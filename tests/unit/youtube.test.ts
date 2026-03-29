import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock, spawnMock, mkdirMock, existsSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
  spawnMock: vi.fn(),
  mkdirMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
  spawn: spawnMock,
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
}));

import {
  downloadYoutubeAudio,
  extractVideoId,
  fetchYoutubeMetadata,
  normalizeYoutubeUrl,
} from "../../src/lib/youtube.js";
import type { DownloadProgressEvent } from "../../src/lib/progress.js";

afterEach(() => {
  spawnSyncMock.mockReset();
  spawnMock.mockReset();
  mkdirMock.mockReset();
  existsSyncMock.mockReset();
});

function makeSpawnResult(lines: string[], exitCode = 0): void {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  spawnMock.mockReturnValueOnce(proc);

  process.nextTick(() => {
    for (const line of lines) {
      proc.stderr.emit("data", Buffer.from(`${line}\n`));
    }
    proc.emit("close", exitCode);
  });
}

describe("youtube helpers", () => {
  it("normalizes youtube.com watch URLs", () => {
    const url = normalizeYoutubeUrl("https://www.youtube.com/watch?v=abc123xyz00");

    expect(url.href).toBe("https://www.youtube.com/watch?v=abc123xyz00");
    expect(extractVideoId(url.href)).toBe("abc123xyz00");
  });

  it("extracts video ids from youtu.be short URLs", () => {
    expect(extractVideoId("https://youtu.be/abc123xyz00?t=12")).toBe("abc123xyz00");
  });

  it("extracts video ids from embed URLs", () => {
    expect(extractVideoId("https://www.youtube.com/embed/abc123xyz00")).toBe("abc123xyz00");
  });

  it("extracts video ids from shorts URLs", () => {
    expect(extractVideoId("https://www.youtube.com/shorts/abc123xyz00")).toBe("abc123xyz00");
  });

  it("rejects lookalike youtube domains", () => {
    expect(() => extractVideoId("https://notyoutube.com/watch?v=abc123xyz00")).toThrow(
      /Unsupported YouTube URL/,
    );
  });

  it("threads browser cookies through metadata fetch and download", async () => {
    existsSyncMock.mockReturnValueOnce(false);
    mkdirMock.mockResolvedValueOnce(undefined);
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify({
        id: "abc123xyz00",
        title: "Demo title",
        webpage_url: "https://www.youtube.com/watch?v=abc123xyz00",
      }),
      stderr: "",
    });
    makeSpawnResult([]);

    await downloadYoutubeAudio({
      url: "https://www.youtube.com/watch?v=abc123xyz00",
      outputBasePath: "/tmp/autonota-youtube-test/demo",
      browser: "brave",
    });

    // Metadata still uses spawnSync
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(spawnSyncMock.mock.calls[0][1]).toContain("--cookies-from-browser");

    // Download uses async spawn
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const downloadArgs: string[] = spawnMock.mock.calls[0][1];
    expect(downloadArgs).toContain("--cookies-from-browser");
    expect(downloadArgs).toContain("brave");
    expect(downloadArgs).toContain("--newline");
    expect(downloadArgs).toContain("--progress");
  });

  it("emits metadata and downloading events during download", async () => {
    existsSyncMock.mockReturnValueOnce(false);
    mkdirMock.mockResolvedValueOnce(undefined);
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify({
        id: "abc123xyz00",
        title: "Demo",
        webpage_url: "https://www.youtube.com/watch?v=abc123xyz00",
      }),
      stderr: "",
    });
    makeSpawnResult([
      "[download]  45.2% of 32.4MiB at 1.2MiB/s ETA 00:14",
      "[download] 100% of 32.4MiB",
    ]);

    const events: DownloadProgressEvent[] = [];
    await downloadYoutubeAudio({
      url: "https://www.youtube.com/watch?v=abc123xyz00",
      outputBasePath: "/tmp/test",
      onProgress: (e) => events.push(e),
    });

    expect(events).toContainEqual({ type: "metadata" });
    expect(events).toContainEqual({
      type: "downloading",
      line: "[download]  45.2% of 32.4MiB at 1.2MiB/s ETA 00:14",
    });
    expect(events).toContainEqual({ type: "done" });
  });

  it("reuses an existing mp3 at the derived title-based path", async () => {
    existsSyncMock.mockReturnValueOnce(true);
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify({
        id: "abc123xyz00",
        title: "Demo title",
        webpage_url: "https://www.youtube.com/watch?v=abc123xyz00",
      }),
      stderr: "",
    });

    const result = await downloadYoutubeAudio({
      url: "https://www.youtube.com/watch?v=abc123xyz00",
      outputBasePath: "/tmp/autonota-youtube-test/demo",
    });

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(result.audioPath).toBe("/tmp/autonota-youtube-test/demo-demo-title.mp3");
  });

  it("throws a metadata error when yt-dlp exits non-zero", async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 1,
      stdout: "",
      stderr: "yt-dlp failed",
    });

    await expect(
      fetchYoutubeMetadata("https://www.youtube.com/watch?v=abc123xyz00"),
    ).rejects.toThrow("yt-dlp failed");
  });

  it("throws when yt-dlp metadata output is not valid JSON", async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: "not-json",
      stderr: "",
    });

    await expect(
      fetchYoutubeMetadata("https://www.youtube.com/watch?v=abc123xyz00"),
    ).rejects.toThrow();
  });
});
