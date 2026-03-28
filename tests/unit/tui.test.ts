import { describe, expect, it } from "vitest";
import {
  stripYtDlpLine,
  renderDownloadEvent,
  renderTranscribeEvent,
} from "../../src/lib/tui.js";
import type { DownloadProgressEvent, TranscribeProgressEvent } from "../../src/lib/progress.js";

describe("stripYtDlpLine", () => {
  it("removes ANSI escape codes", () => {
    expect(stripYtDlpLine("\x1b[0m[download]  45.2%\x1b[0m")).toBe("[download]  45.2%");
  });

  it("trims surrounding whitespace", () => {
    expect(stripYtDlpLine("  [download] 100%  ")).toBe("[download] 100%");
  });
});

describe("renderDownloadEvent", () => {
  it("returns metadata message", () => {
    const event: DownloadProgressEvent = { type: "metadata" };
    expect(renderDownloadEvent(event)).toBe("fetching video info...");
  });

  it("returns cleaned line for downloading event", () => {
    const event: DownloadProgressEvent = {
      type: "downloading",
      line: "\x1b[0m[download]  45.2%\x1b[0m",
    };
    expect(renderDownloadEvent(event)).toBe("[download]  45.2%");
  });

  it("returns null when cleaned downloading line is empty", () => {
    const event: DownloadProgressEvent = { type: "downloading", line: "\x1b[0m  \x1b[0m" };
    expect(renderDownloadEvent(event)).toBeNull();
  });

  it("returns null for done event", () => {
    const event: DownloadProgressEvent = { type: "done" };
    expect(renderDownloadEvent(event)).toBeNull();
  });
});

describe("renderTranscribeEvent", () => {
  it("returns uploading message", () => {
    const event: TranscribeProgressEvent = { type: "uploading" };
    expect(renderTranscribeEvent(event)).toBe("uploading audio...");
  });

  it("formats chunk progress with 1-based index", () => {
    const event: TranscribeProgressEvent = { type: "chunk", index: 2, total: 5 };
    expect(renderTranscribeEvent(event)).toBe("chunk 2/5...");
  });

  it("formats rate-limited message with minutes and seconds", () => {
    const event: TranscribeProgressEvent = {
      type: "rate-limited",
      waitSeconds: 272,
      attempt: 2,
      max: 3,
    };
    expect(renderTranscribeEvent(event)).toBe("rate limited, waiting 4m32s (attempt 2/3)...");
  });

  it("formats rate-limited message with seconds only", () => {
    const event: TranscribeProgressEvent = {
      type: "rate-limited",
      waitSeconds: 45,
      attempt: 2,
      max: 3,
    };
    expect(renderTranscribeEvent(event)).toBe("rate limited, waiting 45s (attempt 2/3)...");
  });

  it("formats rate-limit-tick with remaining time in minutes and seconds", () => {
    const event: TranscribeProgressEvent = { type: "rate-limit-tick", remainingSeconds: 220 };
    expect(renderTranscribeEvent(event)).toBe("retrying in 3m40s...");
  });

  it("formats rate-limit-tick with seconds only", () => {
    const event: TranscribeProgressEvent = { type: "rate-limit-tick", remainingSeconds: 30 };
    expect(renderTranscribeEvent(event)).toBe("retrying in 30s...");
  });

  it("returns null for done event", () => {
    const event: TranscribeProgressEvent = { type: "done" };
    expect(renderTranscribeEvent(event)).toBeNull();
  });
});
