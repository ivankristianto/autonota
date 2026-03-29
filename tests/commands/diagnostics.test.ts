import { afterEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

import { formatDiagnosticsOutput, runDiagnosticsCommand } from "../../src/commands/diagnostics.js";

afterEach(() => {
  execFileSyncMock.mockReset();
  delete process.env.OPENAI_API_KEY;
  process.exitCode = undefined;
});

describe("formatDiagnosticsOutput", () => {
  it("formats all-passing output", () => {
    const output = formatDiagnosticsOutput([
      { name: "yt-dlp", found: true, path: "/usr/local/bin/yt-dlp" },
      { name: "ffmpeg", found: true, path: "/usr/local/bin/ffmpeg" },
      { name: "ffprobe", found: true, path: "/usr/local/bin/ffprobe" },
      { name: "OPENAI_API_KEY", found: true },
    ]);

    expect(output).toContain("\u2713 yt-dlp");
    expect(output).toContain("\u2713 ffmpeg");
    expect(output).toContain("\u2713 ffprobe");
    expect(output).toContain("\u2713 OPENAI_API_KEY");
    expect(output).toContain("All checks passed.");
  });

  it("formats failing output with hints", () => {
    const output = formatDiagnosticsOutput([
      { name: "yt-dlp", found: true, path: "/usr/local/bin/yt-dlp" },
      { name: "ffmpeg", found: true, path: "/usr/local/bin/ffmpeg" },
      { name: "ffprobe", found: false, path: undefined, hint: "brew install ffmpeg" },
      {
        name: "OPENAI_API_KEY",
        found: false,
        hint: "Set OPENAI_API_KEY in your shell profile or .env file",
      },
    ]);

    expect(output).toContain("\u2713 yt-dlp");
    expect(output).toContain("\u2713 ffmpeg");
    expect(output).toContain("\u2717 ffprobe");
    expect(output).toContain("brew install ffmpeg");
    expect(output).toContain("\u2717 OPENAI_API_KEY");
    expect(output).toContain("2 issues found");
  });
});

describe("runDiagnosticsCommand", () => {
  it("prints results and sets exit code 1 when checks fail", async () => {
    execFileSyncMock
      .mockReturnValueOnce("/usr/local/bin/yt-dlp\n")
      .mockReturnValueOnce("/usr/local/bin/ffmpeg\n")
      .mockImplementationOnce(() => {
        throw new Error("not found");
      });

    const writes: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      });

    try {
      await runDiagnosticsCommand();

      expect(writes.join("")).toContain("\u2717 ffprobe");
      expect(process.exitCode).toBe(1);
    } finally {
      writeSpy.mockRestore();
      process.exitCode = undefined;
    }
  });

  it("prints results and does not set exit code when all checks pass", async () => {
    execFileSyncMock
      .mockReturnValueOnce("/usr/local/bin/yt-dlp\n")
      .mockReturnValueOnce("/usr/local/bin/ffmpeg\n")
      .mockReturnValueOnce("/usr/local/bin/ffprobe\n");
    process.env.OPENAI_API_KEY = "sk-test";

    const writes: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      });

    try {
      await runDiagnosticsCommand();

      expect(writes.join("")).toContain("All checks passed.");
      expect(process.exitCode).toBeUndefined();
    } finally {
      writeSpy.mockRestore();
      process.exitCode = undefined;
    }
  });
});
