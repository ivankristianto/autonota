import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock, mkdirMock, mkdtempMock, readdirMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
  mkdirMock: vi.fn(),
  mkdtempMock: vi.fn(),
  readdirMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  mkdtemp: mkdtempMock,
  readdir: readdirMock,
  unlink: vi.fn(),
}));

import { SAFE_UPLOAD_BYTES, planChunkDuration, splitAudioToMp3Chunks } from "../../src/lib/audio.js";

afterEach(() => {
  spawnSyncMock.mockReset();
  mkdirMock.mockReset();
  mkdtempMock.mockReset();
  readdirMock.mockReset();
});

describe("audio helpers", () => {
  it("plans a positive chunk duration for oversized audio", () => {
    const chunkDurationSeconds = planChunkDuration({
      fileSizeBytes: SAFE_UPLOAD_BYTES * 2,
      durationSeconds: 1_200,
    });

    expect(chunkDurationSeconds).toBeGreaterThan(0);
    expect(chunkDurationSeconds).toBeLessThanOrEqual(1_200);
  });

  it("returns only chunks from the current split run", async () => {
    mkdtempMock.mockResolvedValueOnce("/tmp/nota-audio/run-123");
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: "",
      stderr: "",
    });
    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === "/tmp/nota-audio") {
        return ["stale_chunk_000.mp3", "stale_chunk_001.mp3"];
      }

      return ["current_chunk_000.mp3", "current_chunk_001.mp3"];
    });

    const chunks = await splitAudioToMp3Chunks(
      "/tmp/nota-audio/current.mp3",
      60,
      "/tmp/nota-audio",
    );

    expect(chunks).toEqual([
      "/tmp/nota-audio/run-123/current_chunk_000.mp3",
      "/tmp/nota-audio/run-123/current_chunk_001.mp3",
    ]);
  });
});
