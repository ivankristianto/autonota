import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock, mkdirMock, mkdtempMock, readdirMock, unlinkMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
  mkdirMock: vi.fn(),
  mkdtempMock: vi.fn(),
  readdirMock: vi.fn(),
  unlinkMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  mkdtemp: mkdtempMock,
  readdir: readdirMock,
  unlink: unlinkMock,
}));

import {
  SAFE_UPLOAD_BYTES,
  cleanupFiles,
  getAudioDurationSeconds,
  planChunkDuration,
  splitAudioToMp3Chunks,
} from "../../src/lib/audio.js";

afterEach(() => {
  spawnSyncMock.mockReset();
  mkdirMock.mockReset();
  mkdtempMock.mockReset();
  readdirMock.mockReset();
  unlinkMock.mockReset();
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
    mkdtempMock.mockResolvedValueOnce("/tmp/autonota-audio/run-123");
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: "",
      stderr: "",
    });
    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === "/tmp/autonota-audio") {
        return ["stale_chunk_000.mp3", "stale_chunk_001.mp3"];
      }

      return ["current_chunk_000.mp3", "current_chunk_001.mp3"];
    });

    const chunks = await splitAudioToMp3Chunks(
      "/tmp/autonota-audio/current.mp3",
      60,
      "/tmp/autonota-audio",
    );

    expect(chunks).toEqual([
      "/tmp/autonota-audio/run-123/current_chunk_000.mp3",
      "/tmp/autonota-audio/run-123/current_chunk_001.mp3",
    ]);
  });

  it("throws when ffprobe exits non-zero while reading duration", async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 1,
      stdout: "",
      stderr: "ffprobe failed",
    });

    await expect(getAudioDurationSeconds("/tmp/audio.mp3")).rejects.toThrow("ffprobe failed");
  });

  it("throws when ffprobe output has no duration", async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify({ format: {} }),
      stderr: "",
    });

    await expect(getAudioDurationSeconds("/tmp/audio.mp3")).rejects.toThrow(
      "Unable to determine duration",
    );
  });

  it("ignores ENOENT when cleaning up files", async () => {
    unlinkMock.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));

    await expect(cleanupFiles(["/tmp/missing.mp3"])).resolves.toBeUndefined();
  });

  it("rethrows non-ENOENT errors during cleanup", async () => {
    unlinkMock.mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "EPERM" }),
    );

    await expect(cleanupFiles(["/tmp/protected.mp3"])).rejects.toThrow("permission denied");
  });
});
