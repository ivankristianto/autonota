import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertBinaryExists,
  checkSummarizeRequirements,
  checkTranscribeRequirements,
} from "../../src/lib/requirements.js";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

describe("requirements helpers", () => {
  afterEach(() => {
    execFileSyncMock.mockReset();
  });

  it("uses execFileSync with argv to check binaries", () => {
    execFileSyncMock.mockReturnValueOnce("/usr/local/bin/yt-dlp\n");

    assertBinaryExists("yt-dlp");

    expect(execFileSyncMock).toHaveBeenCalledWith("which", ["yt-dlp"], {
      encoding: "utf8",
      stdio: "pipe",
    });
  });

  it("fails when OPENAI_API_KEY is missing for summarize checks", () => {
    expect(() => checkSummarizeRequirements({} as NodeJS.ProcessEnv)).toThrow(/OPENAI_API_KEY/);
  });

  it("fails when transcribe requirements cannot find yt-dlp ffmpeg and ffprobe", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("command not found");
    });

    expect(() =>
      checkTranscribeRequirements({ OPENAI_API_KEY: "test" } as NodeJS.ProcessEnv),
    ).toThrow(/yt-dlp|ffmpeg|ffprobe/);
  });
});
