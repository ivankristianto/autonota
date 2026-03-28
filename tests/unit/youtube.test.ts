import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock, mkdirMock, existsSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
  mkdirMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
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
  normalizeYoutubeUrl,
} from "../../src/lib/youtube.js";

afterEach(() => {
  spawnSyncMock.mockReset();
  mkdirMock.mockReset();
  existsSyncMock.mockReset();
});

describe("youtube helpers", () => {
  it("normalizes youtube.com watch URLs", () => {
    const url = normalizeYoutubeUrl(
      "https://www.youtube.com/watch?v=abc123xyz00",
    );

    expect(url.href).toBe("https://www.youtube.com/watch?v=abc123xyz00");
    expect(extractVideoId(url.href)).toBe("abc123xyz00");
  });

  it("extracts video ids from youtu.be short URLs", () => {
    expect(extractVideoId("https://youtu.be/abc123xyz00?t=12")).toBe(
      "abc123xyz00",
    );
  });

  it("rejects lookalike youtube domains", () => {
    expect(() => extractVideoId("https://notyoutube.com/watch?v=abc123xyz00")).toThrow(
      /Unsupported YouTube URL/,
    );
  });

  it("threads browser cookies through metadata fetch and download", async () => {
    existsSyncMock.mockReturnValueOnce(false);
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          id: "abc123xyz00",
          title: "Demo title",
          webpage_url: "https://www.youtube.com/watch?v=abc123xyz00",
        }),
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      });

    await downloadYoutubeAudio({
      url: "https://www.youtube.com/watch?v=abc123xyz00",
      outputBasePath: "/tmp/nota-youtube-test/demo",
      browser: "brave",
    });

    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    expect(spawnSyncMock.mock.calls[0][1]).toContain("--cookies-from-browser");
    expect(spawnSyncMock.mock.calls[0][1]).toContain("brave");
    expect(spawnSyncMock.mock.calls[1][1]).toContain("--cookies-from-browser");
    expect(spawnSyncMock.mock.calls[1][1]).toContain("brave");
    expect(spawnSyncMock.mock.calls[1][1]).toContain(
      "/tmp/nota-youtube-test/demo-demo-title.mp3",
    );
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
      outputBasePath: "/tmp/nota-youtube-test/demo",
    });

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(result.audioPath).toBe("/tmp/nota-youtube-test/demo-demo-title.mp3");
  });
});
