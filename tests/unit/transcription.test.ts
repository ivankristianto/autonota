import { afterEach, describe, expect, it, vi } from "vitest";

const {
  statMock,
  createReadStreamMock,
  getAudioDurationSecondsMock,
  planChunkDurationMock,
  splitAudioToMp3ChunksMock,
  cleanupFilesMock,
} = vi.hoisted(() => ({
  statMock: vi.fn(),
  createReadStreamMock: vi.fn(),
  getAudioDurationSecondsMock: vi.fn(),
  planChunkDurationMock: vi.fn(),
  splitAudioToMp3ChunksMock: vi.fn(),
  cleanupFilesMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  createReadStream: createReadStreamMock,
}));

vi.mock("node:fs/promises", () => ({
  stat: statMock,
}));

vi.mock("../../src/lib/audio.js", () => ({
  SAFE_UPLOAD_BYTES: 24 * 1024 * 1024,
  getAudioDurationSeconds: getAudioDurationSecondsMock,
  planChunkDuration: planChunkDurationMock,
  splitAudioToMp3Chunks: splitAudioToMp3ChunksMock,
  cleanupFiles: cleanupFilesMock,
}));

import type { TranscriptSegment } from "../../src/types.js";
import {
  buildTranscriptDocument,
  parseWaitTime,
  transcribeAudio,
  transcribeSingleUpload,
  transcribeChunkedUpload,
  withRateLimitRetry,
} from "../../src/lib/transcription.js";

afterEach(() => {
  statMock.mockReset();
  createReadStreamMock.mockReset();
  getAudioDurationSecondsMock.mockReset();
  planChunkDurationMock.mockReset();
  splitAudioToMp3ChunksMock.mockReset();
  cleanupFilesMock.mockReset();
  vi.restoreAllMocks();
});

describe("transcription helpers", () => {
  it("parses wait times from rate-limit messages", () => {
    expect(parseWaitTime("Please try again in 5m14.5s")).toBeCloseTo(314.5);
  });

  it("retries 429-like errors and does not retry unrelated errors", async () => {
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((callback: TimerHandler) => {
        if (typeof callback === "function") {
          callback();
        }

        return 0 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout);

    let attempts = 0;
    const result = await withRateLimitRetry(async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("Please try again in 1s") as Error & {
          status: number;
        };
        error.status = 429;
        throw error;
      }

      return "ok";
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

    let failedAttempts = 0;
    await expect(
      withRateLimitRetry(async () => {
        failedAttempts += 1;
        const error = new Error("boom") as Error & {
          statusCode: number;
        };
        error.statusCode = 500;
        throw error;
      }),
    ).rejects.toThrow("boom");
    expect(failedAttempts).toBe(1);
  });

  it("preserves source metadata and timestamps when assembling a transcript", () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 10, text: "hello" },
      { start: 12.5, end: 18, text: "world" },
    ];

    const document = buildTranscriptDocument({
      source: {
        type: "youtube",
        url: "https://www.youtube.com/watch?v=abc123xyz00",
        videoId: "abc123xyz00",
        title: "Demo",
      },
      transcription: {
        model: "whisper-1",
        language: "auto",
        generatedAt: "2026-03-27T00:00:00.000Z",
      },
      audio: {
        durationSeconds: 123.45,
        chunkCount: 1,
      },
      segments,
    });

    expect(document.source.title).toBe("Demo");
    expect(document.segments).toEqual(segments);
    expect(document.fullText).toBe("hello world");
  });

  it("applies chunk offsets when assembling chunked transcripts", async () => {
    statMock.mockResolvedValueOnce({ size: 48 * 1024 * 1024 });
    getAudioDurationSecondsMock.mockResolvedValueOnce(120);
    planChunkDurationMock.mockReturnValueOnce(60);
    splitAudioToMp3ChunksMock.mockResolvedValueOnce([
      "/tmp/chunk-000.mp3",
      "/tmp/chunk-001.mp3",
    ]);
    cleanupFilesMock.mockResolvedValueOnce(undefined);
    createReadStreamMock.mockImplementation((filePath: string) => ({ filePath }));

    const client = {
      audio: {
        transcriptions: {
          create: vi
            .fn()
            .mockResolvedValueOnce({
              segments: [
                { start: 0, end: 10, text: "first chunk" },
              ],
            })
            .mockResolvedValueOnce({
              segments: [
                { start: 5, end: 15, text: "second chunk" },
              ],
            }),
        },
      },
    };

    const document = await transcribeAudio(client, {
      audioPath: "/tmp/demo.mp3",
      source: {
        type: "youtube",
        url: "https://www.youtube.com/watch?v=abc123xyz00",
        videoId: "abc123xyz00",
        title: "Demo",
      },
      transcription: {
        model: "whisper-1",
        language: "auto",
      },
      tempDir: "/tmp",
    });

    expect(splitAudioToMp3ChunksMock).toHaveBeenCalledWith("/tmp/demo.mp3", 60, "/tmp");
    expect(document.segments).toEqual([
      { start: 0, end: 10, text: "first chunk" },
      { start: 65, end: 75, text: "second chunk" },
    ]);
    expect(document.audio.chunkCount).toBe(2);
    expect(document.source.title).toBe("Demo");
  });

  it("transcribes a single upload without chunking", async () => {
    createReadStreamMock.mockImplementation((filePath: string) => ({ filePath }));

    const client = {
      audio: {
        transcriptions: {
          create: vi.fn().mockResolvedValueOnce({
            segments: [
              { start: 1, end: 2, text: "  hello  " },
            ],
          }),
        },
      },
    };

    const segments = await transcribeSingleUpload(client, {
      audioPath: "/tmp/demo.mp3",
      model: "whisper-1",
      language: "auto",
    });

    expect(segments).toEqual([{ start: 1, end: 2, text: "hello" }]);
  });

  it("treats chunk cleanup failures as non-fatal after a successful transcription", async () => {
    statMock.mockResolvedValueOnce({ size: 48 * 1024 * 1024 });
    getAudioDurationSecondsMock.mockResolvedValueOnce(120);
    planChunkDurationMock.mockReturnValueOnce(60);
    splitAudioToMp3ChunksMock.mockResolvedValueOnce([
      "/tmp/chunk-000.mp3",
      "/tmp/chunk-001.mp3",
    ]);
    cleanupFilesMock.mockRejectedValueOnce(new Error("cleanup failed"));
    createReadStreamMock.mockImplementation((filePath: string) => ({ filePath }));

    const client = {
      audio: {
        transcriptions: {
          create: vi
            .fn()
            .mockResolvedValueOnce({
              segments: [{ start: 0, end: 5, text: "one" }],
            })
            .mockResolvedValueOnce({
              segments: [{ start: 0, end: 5, text: "two" }],
            }),
        },
      },
    };

    await expect(
      transcribeChunkedUpload(client, {
        audioPath: "/tmp/demo.mp3",
        model: "whisper-1",
        language: "auto",
        chunkDurationSeconds: 60,
        chunkPaths: ["/tmp/chunk-000.mp3", "/tmp/chunk-001.mp3"],
      }),
    ).resolves.toEqual([
      { start: 0, end: 5, text: "one" },
      { start: 60, end: 65, text: "two" },
    ]);
  });

  it("preserves the transcription error when chunk cleanup also fails", async () => {
    cleanupFilesMock.mockRejectedValueOnce(new Error("cleanup failed"));
    createReadStreamMock.mockImplementation((filePath: string) => ({ filePath }));

    const transcriptionError = new Error("transcription failed");
    const client = {
      audio: {
        transcriptions: {
          create: vi.fn().mockRejectedValueOnce(transcriptionError),
        },
      },
    };

    await expect(
      transcribeChunkedUpload(client, {
        audioPath: "/tmp/demo.mp3",
        model: "whisper-1",
        language: "auto",
        chunkDurationSeconds: 60,
        chunkPaths: ["/tmp/chunk-000.mp3"],
      }),
    ).rejects.toThrow(transcriptionError);
  });
});
