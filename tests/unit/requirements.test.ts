import { describe, expect, it, vi } from "vitest";

import {
  checkSummarizeRequirements,
  checkTranscribeRequirements,
} from "../../src/lib/requirements.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => {
    throw new Error("command not found");
  }),
}));

describe("requirements helpers", () => {
  it("fails when OPENAI_API_KEY is missing for summarize checks", () => {
    expect(() => checkSummarizeRequirements({} as NodeJS.ProcessEnv)).toThrow(
      /OPENAI_API_KEY/,
    );
  });

  it("fails when transcribe requirements cannot find yt-dlp ffmpeg and ffprobe", () => {
    expect(() =>
      checkTranscribeRequirements({ OPENAI_API_KEY: "test" } as NodeJS.ProcessEnv),
    ).toThrow(/yt-dlp|ffmpeg|ffprobe/);
  });
});
