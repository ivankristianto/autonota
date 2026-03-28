import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mkdtempMock,
  rmMock,
  checkTranscribeRequirementsMock,
  deriveTranscriptPathMock,
  assertWritableMock,
  writeJsonMock,
  downloadYoutubeAudioMock,
  transcribeAudioMock,
  printArtifactPathsMock,
  openAiConstructorMock,
} = vi.hoisted(() => ({
  mkdtempMock: vi.fn(),
  rmMock: vi.fn(),
  checkTranscribeRequirementsMock: vi.fn(),
  deriveTranscriptPathMock: vi.fn(),
  assertWritableMock: vi.fn(),
  writeJsonMock: vi.fn(),
  downloadYoutubeAudioMock: vi.fn(),
  transcribeAudioMock: vi.fn(),
  printArtifactPathsMock: vi.fn(),
  openAiConstructorMock: vi.fn(),
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    mkdtemp: mkdtempMock,
    rm: rmMock,
  };
});

vi.mock("openai", () => ({
  default: openAiConstructorMock,
}));

vi.mock("../../src/lib/requirements.js", () => ({
  checkTranscribeRequirements: checkTranscribeRequirementsMock,
}));

vi.mock("../../src/lib/fs.js", () => ({
  deriveTranscriptPath: deriveTranscriptPathMock,
  assertWritable: assertWritableMock,
  writeJson: writeJsonMock,
}));

vi.mock("../../src/lib/youtube.js", () => ({
  downloadYoutubeAudio: downloadYoutubeAudioMock,
}));

vi.mock("../../src/lib/transcription.js", () => ({
  transcribeAudio: transcribeAudioMock,
}));

vi.mock("../../src/lib/tui.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/tui.js")>("../../src/lib/tui.js");
  return {
    ...actual,
    printArtifactPaths: printArtifactPathsMock,
  };
});

import { createProgram } from "../../src/cli.js";
import { runTranscribeCommand } from "../../src/commands/transcribe.js";

afterEach(() => {
  mkdtempMock.mockReset();
  rmMock.mockReset();
  checkTranscribeRequirementsMock.mockReset();
  deriveTranscriptPathMock.mockReset();
  assertWritableMock.mockReset();
  writeJsonMock.mockReset();
  downloadYoutubeAudioMock.mockReset();
  transcribeAudioMock.mockReset();
  printArtifactPathsMock.mockReset();
  openAiConstructorMock.mockReset();
  vi.restoreAllMocks();
  delete process.env.OPENAI_API_KEY;
});

describe("transcribe command", () => {
  it("writes a transcript to the derived output path and cleans up temp files", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const transcript = {
      source: {
        type: "youtube" as const,
        url: "https://www.youtube.com/watch?v=abc123xyz00",
        videoId: "abc123xyz00",
        title: "Demo Video",
      },
      transcription: {
        model: "whisper-1",
        language: "auto",
        generatedAt: "2026-03-27T00:00:00.000Z",
      },
      audio: {
        durationSeconds: 120,
        chunkCount: 1,
      },
      segments: [{ start: 0, end: 2, text: "hello" }],
      fullText: "hello",
    };
    const client = { tag: "openai-client" };

    mkdtempMock.mockResolvedValueOnce("/tmp/nota-run-123");
    deriveTranscriptPathMock.mockReturnValueOnce("/work/out/demo.transcript.json");
    openAiConstructorMock.mockImplementationOnce((options: unknown) => {
      Object.assign(client, { options });
      return client;
    });
    downloadYoutubeAudioMock.mockResolvedValueOnce({
      audioPath: "/tmp/nota-run-123/audio.mp3",
      metadata: transcript.source,
    });
    transcribeAudioMock.mockResolvedValueOnce(transcript);

    const result = await runTranscribeCommand("https://youtu.be/abc123xyz00", {
      output: "/work/out/demo",
      model: "whisper-1",
      lang: "id",
      browser: "brave",
      force: true,
      baseUrl: "https://openrouter.example/v1",
    });

    expect(checkTranscribeRequirementsMock).toHaveBeenCalledWith(process.env);
    expect(deriveTranscriptPathMock).toHaveBeenCalledWith("/work/out/demo");
    expect(assertWritableMock).toHaveBeenCalledWith("/work/out/demo.transcript.json", true);
    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://openrouter.example/v1",
    });
    expect(downloadYoutubeAudioMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://youtu.be/abc123xyz00",
        outputBasePath: "/work/out/demo",
        browser: "brave",
        onProgress: expect.any(Function),
      }),
    );
    expect(transcribeAudioMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        audioPath: "/tmp/nota-run-123/audio.mp3",
        source: transcript.source,
        transcription: {
          model: "whisper-1",
          language: "id",
        },
        tempDir: "/tmp/nota-run-123",
        onProgress: expect.any(Function),
      }),
    );
    expect(writeJsonMock).toHaveBeenCalledWith("/work/out/demo.transcript.json", transcript, {
      overwrite: true,
    });
    expect(printArtifactPathsMock).toHaveBeenCalledWith({
      transcriptPath: "/work/out/demo.transcript.json",
    });
    expect(rmMock).toHaveBeenCalledWith("/tmp/nota-run-123", { recursive: true, force: true });
    expect(result).toEqual({
      transcriptPath: "/work/out/demo.transcript.json",
      transcript,
    });
  });

  it("stops before doing work when the output already exists and --force is not set", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    mkdtempMock.mockResolvedValueOnce("/tmp/nota-run-456");
    deriveTranscriptPathMock.mockReturnValueOnce("/work/out/demo.transcript.json");
    assertWritableMock.mockImplementationOnce(() => {
      throw new Error("Refusing to overwrite /work/out/demo.transcript.json. Use --force to replace it.");
    });

    await expect(
      runTranscribeCommand("https://www.youtube.com/watch?v=abc123xyz00", {
        output: "/work/out/demo",
        force: false,
      }),
    ).rejects.toThrow(/--force/);

    expect(downloadYoutubeAudioMock).not.toHaveBeenCalled();
    expect(transcribeAudioMock).not.toHaveBeenCalled();
    expect(writeJsonMock).not.toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledWith("/tmp/nota-run-456", { recursive: true, force: true });
  });

  it("forwards custom transcription models to the transcription layer", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    mkdtempMock.mockResolvedValueOnce("/tmp/nota-run-456");
    deriveTranscriptPathMock.mockReturnValueOnce("/work/out/demo.transcript.json");
    openAiConstructorMock.mockReturnValueOnce({ tag: "openai-client" });
    downloadYoutubeAudioMock.mockResolvedValueOnce({
      audioPath: "/tmp/nota-run-456/audio.mp3",
      metadata: {
        type: "youtube" as const,
        url: "https://www.youtube.com/watch?v=abc123xyz00",
        videoId: "abc123xyz00",
        title: "Demo Video",
      },
    });
    transcribeAudioMock.mockResolvedValueOnce({
      source: {
        type: "youtube" as const,
        url: "https://www.youtube.com/watch?v=abc123xyz00",
        videoId: "abc123xyz00",
        title: "Demo Video",
      },
      transcription: {
        model: "whisper-large-v3",
        language: "en",
        generatedAt: "2026-03-27T00:00:00.000Z",
      },
      audio: {
        durationSeconds: 30,
        chunkCount: 1,
      },
      segments: [{ start: 0, end: 1, text: "hello" }],
      fullText: "hello",
    });

    await runTranscribeCommand("https://www.youtube.com/watch?v=abc123xyz00", {
      output: "/work/out/demo",
      model: "whisper-large-v3",
      lang: "en",
    });

    expect(transcribeAudioMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        transcription: {
          model: "whisper-large-v3",
          language: "en",
        },
      }),
    );
  });

  it("emits non-TTY task titles only when execution reaches each task", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    const stderrWrites: string[] = [];
    const stderrWriteSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      configurable: true,
    });

    mkdtempMock.mockResolvedValueOnce("/tmp/nota-run-789");
    deriveTranscriptPathMock.mockReturnValueOnce("/work/out/demo.transcript.json");
    openAiConstructorMock.mockReturnValueOnce({ tag: "openai-client" });
    downloadYoutubeAudioMock.mockRejectedValueOnce(new Error("download failed"));

    try {
      await expect(
        runTranscribeCommand("https://www.youtube.com/watch?v=abc123xyz00", {
          output: "/work/out/demo",
          force: true,
        }),
      ).rejects.toThrow("download failed");
    } finally {
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalIsTTY,
        configurable: true,
      });
      stderrWriteSpy.mockRestore();
    }

    expect(stderrWrites).toEqual([
      "checking requirements\n",
      "downloading audio\n",
    ]);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
    expect(writeJsonMock).not.toHaveBeenCalled();
  });

  it("registers the transcribe command with the required options", async () => {
    const program = createProgram();

    const transcribeCommand = program.commands.find((command) => command.name() === "transcribe");

    expect(transcribeCommand).toBeDefined();
    expect(transcribeCommand?.registeredArguments.map((argument) => argument.name())).toEqual([
      "youtube-url",
    ]);
    expect(transcribeCommand?.options.find((option) => option.long === "--output")?.required).toBe(true);
    expect(transcribeCommand?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining([
        "--output",
        "--model",
        "--lang",
        "--browser",
        "--force",
        "--base-url",
      ]),
    );
  });
});
