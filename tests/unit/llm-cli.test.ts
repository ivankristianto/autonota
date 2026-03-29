import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import sampleTranscriptJson from "../fixtures/sample-transcript.json" with { type: "json" };
import type { TranscriptDocument } from "../../src/types.js";
const sampleTranscript = sampleTranscriptJson as TranscriptDocument;

// ---------------------------------------------------------------------------
// Hoisted mock for node:child_process (used by spawnCli + generateSummaryFromCli)
// ---------------------------------------------------------------------------
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

// ---------------------------------------------------------------------------
// Import SUT — must come AFTER vi.mock for the mock to take effect
// ---------------------------------------------------------------------------
import {
  generateSummaryFromCli,
  parseCliResponse,
  spawnCli,
  stripJsonFence,
} from "../../src/lib/llm-cli.js";

afterEach(() => {
  mockSpawn.mockReset();
});

// ---------------------------------------------------------------------------
// stripJsonFence + parseCliResponse (no spawn involved, mock is harmless)
// ---------------------------------------------------------------------------
describe("stripJsonFence", () => {
  it("returns input unchanged when no fence is present", () => {
    expect(stripJsonFence('{"foo":1}')).toBe('{"foo":1}');
  });

  it("strips a ```json ... ``` fence", () => {
    const raw = '```json\n{"foo":1}\n```';
    expect(stripJsonFence(raw)).toBe('{"foo":1}');
  });

  it("strips a ``` ... ``` fence without language tag", () => {
    const raw = '```\n{"foo":1}\n```';
    expect(stripJsonFence(raw)).toBe('{"foo":1}');
  });

  it("handles leading/trailing whitespace around fence", () => {
    const raw = '  \n  ```json\n{"foo":1}\n```  \n  ';
    expect(stripJsonFence(raw)).toBe('{"foo":1}');
  });
});

describe("parseCliResponse", () => {
  const validPayload = JSON.stringify({
    title: "Test Title",
    overview: "Overview text",
    keyPoints: ["point 1"],
    timeline: [{ heading: "Intro", bullets: ["bullet"] }],
    notableQuotes: ["quote"],
    actionItems: ["action"],
  });

  it("parses valid JSON with all required fields", () => {
    const result = parseCliResponse(validPayload);
    expect(result).toEqual({
      title: "Test Title",
      overview: "Overview text",
      keyPoints: ["point 1"],
      timeline: [{ heading: "Intro", bullets: ["bullet"] }],
      notableQuotes: ["quote"],
      actionItems: ["action"],
    });
  });

  it("strips a json fence before parsing", () => {
    const fenced = "```json\n" + validPayload + "\n```";
    const result = parseCliResponse(fenced);
    expect(result.title).toBe("Test Title");
  });

  it("throws when stdout is not valid JSON", () => {
    expect(() => parseCliResponse("not-json")).toThrow("CLI response is not valid JSON");
  });

  it("throws when title is missing", () => {
    const noTitle = JSON.stringify({
      overview: "o",
      keyPoints: [],
      timeline: [],
      notableQuotes: [],
      actionItems: [],
    });
    expect(() => parseCliResponse(noTitle)).toThrow(
      'CLI response JSON is missing required field "title"',
    );
  });

  it("throws when multiple required fields are missing", () => {
    const sparse = JSON.stringify({ title: "t" });
    expect(() => parseCliResponse(sparse)).toThrow("missing required field");
  });

  it("throws when CLI response is not a JSON object", () => {
    expect(() => parseCliResponse("[1,2,3]")).toThrow("CLI response did not produce a JSON object");
  });
});

// ---------------------------------------------------------------------------
// spawnCli + generateSummaryFromCli (child_process is mocked)
// ---------------------------------------------------------------------------

/** Helper: build a fake child process that resolves with stdout. */
function mockSuccessfulSpawn(stdout: string) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };

  mockSpawn.mockReturnValueOnce(child);

  process.nextTick(() => {
    child.stdout.emit("data", Buffer.from(stdout));
    child.emit("close", 0);
  });

  return child;
}

/** Helper: build a fake child process that exits non-zero. */
function mockFailingSpawn(stderr: string, exitCode: number) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };

  mockSpawn.mockReturnValueOnce(child);

  process.nextTick(() => {
    child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", exitCode);
  });

  return child;
}

describe("spawnCli", () => {
  it("spawns claude with correct args and pipes prompt on stdin", async () => {
    const child = mockSuccessfulSpawn("ok");

    const result = await spawnCli("claude", "my prompt", "claude-sonnet-4-6");

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      ["-p", "-", "--model", "claude-sonnet-4-6", "--output-format", "json"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    expect(child.stdin.write).toHaveBeenCalledWith("my prompt");
    expect(child.stdin.end).toHaveBeenCalled();
    expect(result).toBe("ok");
  });

  it("spawns codex with correct args", async () => {
    mockSuccessfulSpawn("done");

    await spawnCli("codex", "prompt text", "gpt-5.4-mini");

    expect(mockSpawn).toHaveBeenCalledWith("codex", ["exec", "-", "--model", "gpt-5.4-mini"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  });

  it("throws when CLI exits with non-zero code (surfaces stderr)", async () => {
    mockFailingSpawn("something went wrong", 1);

    await expect(spawnCli("claude", "prompt", "model")).rejects.toThrow(
      "claude exited with code 1: something went wrong",
    );
  });

  it("throws with install hint when CLI not found (ENOENT)", async () => {
    mockSpawn.mockImplementationOnce(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write: vi.fn(), end: vi.fn() };

      process.nextTick(() => {
        const err = new Error("not found") as Error & { code?: string };
        err.code = "ENOENT";
        child.emit("error", err);
      });

      return child;
    });

    await expect(spawnCli("claude", "prompt", "model")).rejects.toThrow("claude not found in PATH");
  });
});

describe("generateSummaryFromCli", () => {
  it("spawns claude, parses response, and returns formatted markdown", async () => {
    const cliOutput = JSON.stringify({
      title: "Model title",
      overview: "A concise summary.",
      keyPoints: ["Point one", "Point two"],
      timeline: [{ heading: "Intro", bullets: ["Detail"] }],
      notableQuotes: ["Clarity reduces anxiety."],
      actionItems: ["Assign owners."],
    });

    mockSuccessfulSpawn(cliOutput);

    const markdown = await generateSummaryFromCli("claude", sampleTranscript, {
      model: "claude-sonnet-4-6",
      summaryLanguage: "en",
    });

    // Title should come from transcript, not from the CLI response
    expect(markdown).toContain("# How to Run Better 1:1 Meetings");
    expect(markdown).toContain("## Overview");
    expect(markdown).toContain("A concise summary.");
    expect(markdown).toContain("## Key Points");
    expect(markdown).toContain("- Point one");
    expect(markdown).toContain("## Notable Quotes");
    expect(markdown).toContain("## Action Items");
  });

  it("uses the correct model in spawn args", async () => {
    mockSuccessfulSpawn(
      JSON.stringify({
        title: "t",
        overview: "o",
        keyPoints: [],
        timeline: [],
        notableQuotes: [],
        actionItems: [],
      }),
    );

    await generateSummaryFromCli("claude", sampleTranscript, {
      model: "claude-sonnet-4-6",
      summaryLanguage: "en",
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--model", "claude-sonnet-4-6"]),
      expect.anything(),
    );
  });
});
