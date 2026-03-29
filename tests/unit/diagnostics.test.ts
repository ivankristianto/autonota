import { afterEach, describe, expect, it, vi } from "vitest";

import { checkBinary, checkEnvVar, runAllChecks } from "../../src/lib/diagnostics.js";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

afterEach(() => {
  execFileSyncMock.mockReset();
  delete process.env.OPENAI_API_KEY;
});

describe("checkBinary", () => {
  it("returns found with path when binary exists", () => {
    execFileSyncMock.mockReturnValueOnce("/usr/local/bin/yt-dlp\n");

    const result = checkBinary("yt-dlp");

    expect(result).toEqual({
      name: "yt-dlp",
      found: true,
      path: "/usr/local/bin/yt-dlp",
    });
  });

  it("returns not found with install hint when binary is missing", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("not found");
    });

    const result = checkBinary("yt-dlp");

    expect(result).toEqual({
      name: "yt-dlp",
      found: false,
      path: undefined,
      hint: "brew install yt-dlp",
    });
  });

  it("returns brew install ffmpeg hint for ffprobe", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("not found");
    });

    const result = checkBinary("ffprobe");

    expect(result).toEqual({
      name: "ffprobe",
      found: false,
      path: undefined,
      hint: "brew install ffmpeg",
    });
  });
});

describe("checkEnvVar", () => {
  it("returns found when env var is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const result = checkEnvVar("OPENAI_API_KEY", process.env);

    expect(result).toEqual({
      name: "OPENAI_API_KEY",
      found: true,
    });
  });

  it("returns not found with hint when env var is missing", () => {
    const result = checkEnvVar("OPENAI_API_KEY", process.env);

    expect(result).toEqual({
      name: "OPENAI_API_KEY",
      found: false,
      hint: "Set OPENAI_API_KEY in your shell profile or .env file",
    });
  });

  it("returns not found when env var is empty string", () => {
    process.env.OPENAI_API_KEY = "  ";

    const result = checkEnvVar("OPENAI_API_KEY", process.env);

    expect(result).toEqual({
      name: "OPENAI_API_KEY",
      found: false,
      hint: "Set OPENAI_API_KEY in your shell profile or .env file",
    });
  });
});

describe("runAllChecks", () => {
  it("returns all results including failures", () => {
    execFileSyncMock
      .mockReturnValueOnce("/usr/local/bin/yt-dlp\n")
      .mockReturnValueOnce("/usr/local/bin/ffmpeg\n")
      .mockImplementationOnce(() => {
        throw new Error("not found");
      });
    process.env.OPENAI_API_KEY = "sk-test";

    const results = runAllChecks(process.env);

    expect(results).toHaveLength(4);
    expect(results[0]).toEqual({
      name: "yt-dlp",
      found: true,
      path: "/usr/local/bin/yt-dlp",
    });
    expect(results[1]).toEqual({
      name: "ffmpeg",
      found: true,
      path: "/usr/local/bin/ffmpeg",
    });
    expect(results[2]).toEqual({
      name: "ffprobe",
      found: false,
      path: undefined,
      hint: "brew install ffmpeg",
    });
    expect(results[3]).toEqual({
      name: "OPENAI_API_KEY",
      found: true,
    });
  });

  it("returns all passing when everything is available", () => {
    execFileSyncMock
      .mockReturnValueOnce("/usr/local/bin/yt-dlp\n")
      .mockReturnValueOnce("/usr/local/bin/ffmpeg\n")
      .mockReturnValueOnce("/usr/local/bin/ffprobe\n");
    process.env.OPENAI_API_KEY = "sk-test";

    const results = runAllChecks(process.env);

    expect(results.every((r) => r.found)).toBe(true);
  });
});
