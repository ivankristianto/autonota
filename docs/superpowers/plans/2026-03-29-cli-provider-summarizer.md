# CLI Provider Summarizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--claude` and `--codex` flags to `nota summarize` that spawn the respective CLI as a subprocess, letting users with existing subscriptions generate summaries without an OpenAI API key.

**Architecture:** Two parallel paths in the summarize command: the existing OpenAI path (unchanged) and a new CLI subprocess path via `src/lib/llm-cli.ts`. Both paths share `buildSummaryPrompt()` and `formatSummaryMarkdown()`. A provider enum determines which path runs and which requirements to check.

**Tech Stack:** TypeScript, Node.js `child_process.spawn`, Vitest, existing Commander CLI.

---

### Task 1: Create `src/lib/llm-cli.ts` — pure functions (spawn + parse)

**Files:**
- Create: `src/lib/llm-cli.ts`
- Create: `tests/unit/llm-cli.test.ts`

- [ ] **Step 1: Write the failing tests for `stripJsonFence`**

```typescript
// tests/unit/llm-cli.test.ts
import { describe, expect, it } from "vitest";

import { stripJsonFence } from "../../src/lib/llm-cli.js";

describe("stripJsonFence", () => {
  it("returns input unchanged when it contains no fence", () => {
    const raw = '{"title":"Hello","overview":"World"}';
    expect(stripJsonFence(raw)).toBe(raw);
  });

  it("strips a ```json ... ``` fence", () => {
    const raw = '```json\n{"title":"Hello","overview":"World"}\n```';
    expect(stripJsonFence(raw)).toBe('{"title":"Hello","overview":"World"}');
  });

  it("strips a ``` ... ``` fence without language tag", () => {
    const raw = '```\n{"title":"Hello"}\n```';
    expect(stripJsonFence(raw)).toBe('{"title":"Hello"}');
  });

  it("handles leading and trailing whitespace around the fence", () => {
    const raw = '\n  ```json\n{"title":"Hello"}\n```\n  ';
    expect(stripJsonFence(raw)).toBe('{"title":"Hello"}');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/llm-cli.test.ts`
Expected: FAIL — module `../../src/lib/llm-cli.js` not found.

- [ ] **Step 3: Write the `stripJsonFence` implementation**

```typescript
// src/lib/llm-cli.ts
export function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/);
  return match ? match[1].trim() : trimmed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/llm-cli.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing tests for `parseCliResponse`**

Append to `tests/unit/llm-cli.test.ts`:

```typescript
import { parseCliResponse } from "../../src/lib/llm-cli.js";

describe("parseCliResponse", () => {
  it("parses valid JSON with all required fields", () => {
    const raw = JSON.stringify({
      title: "Test",
      overview: "An overview.",
      keyPoints: ["Point one"],
      timeline: [{ heading: "Intro", bullets: ["Bullet"] }],
      notableQuotes: ["Quote"],
      actionItems: ["Action"],
    });

    const result = parseCliResponse(raw);
    expect(result.title).toBe("Test");
    expect(result.keyPoints).toEqual(["Point one"]);
  });

  it("strips a json fence before parsing", () => {
    const inner = JSON.stringify({
      title: "Test",
      overview: "Overview",
      keyPoints: [],
      timeline: [],
      notableQuotes: [],
      actionItems: [],
    });
    const raw = `\`\`\`json\n${inner}\n\`\`\``;

    const result = parseCliResponse(raw);
    expect(result.title).toBe("Test");
  });

  it("throws when stdout is not valid JSON", () => {
    expect(() => parseCliResponse("not json at all")).toThrow(/JSON/);
  });

  it("throws when title is missing from parsed JSON", () => {
    const raw = JSON.stringify({ overview: "No title" });
    expect(() => parseCliResponse(raw)).toThrow(/title/);
  });

  it("throws when key required fields are missing", () => {
    const raw = JSON.stringify({ title: "Has title" });
    expect(() => parseCliResponse(raw)).toThrow(/overview/);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/unit/llm-cli.test.ts`
Expected: FAIL — `parseCliResponse` is not exported.

- [ ] **Step 7: Write the `parseCliResponse` implementation**

Append to `src/lib/llm-cli.ts`:

```typescript
const REQUIRED_SUMMARY_FIELDS = ["title", "overview", "keyPoints", "timeline", "notableQuotes", "actionItems"] as const;

export interface SummaryResponseShape {
  title?: unknown;
  overview?: unknown;
  keyPoints?: unknown;
  timeline?: unknown;
  notableQuotes?: unknown;
  actionItems?: unknown;
}

export function parseCliResponse(stdout: string): SummaryResponseShape {
  const cleaned = stripJsonFence(stdout);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`CLI response is not valid JSON. Raw output:\n${stdout}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`CLI response did not produce a JSON object. Raw output:\n${stdout}`);
  }

  for (const field of REQUIRED_SUMMARY_FIELDS) {
    if (!((field) in (parsed as Record<string, unknown>))) {
      throw new Error(`CLI response JSON is missing required field "${field}". Raw output:\n${stdout}`);
    }
  }

  return parsed as SummaryResponseShape;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/unit/llm-cli.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing tests for `spawnCli`**

Append to `tests/unit/llm-cli.test.ts`. Note the mock pattern matches the project convention: `vi.hoisted` + `vi.mock("node:child_process")`.

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import { spawnCli } from "../../src/lib/llm-cli.js";

const { mockStdin, mockSpawn } = vi.hoisted(() => {
  const stdin = { write: vi.fn(), end: vi.fn() };
  const spawn = vi.fn(() => {
    const stdoutListeners: Array<(chunk: Buffer) => void> = [];
    const stderrListeners: Array<(chunk: Buffer) => void> = [];
    const closeListeners: Array<(code: number | null) => void> = [];

    setImmediate(() => {
      stdoutListeners.forEach((fn) => fn(Buffer.from('{"title":"Test","overview":"O","keyPoints":[],"timeline":[],"notableQuotes":[],"actionItems":[]}')));
      closeListeners.forEach((fn) => fn(0));
    });

    return {
      stdin,
      stdout: { on: vi.fn((event: string, fn: (chunk: Buffer) => void) => { if (event === "data") stdoutListeners.push(fn); }) },
      stderr: { on: vi.fn((event: string, fn: (chunk: Buffer) => void) => { if (event === "data") stderrListeners.push(fn); }) },
      on: vi.fn((event: string, fn: (code: number | null) => void) => { if (event === "close") closeListeners.push(fn); }),
    };
  });

  return { mockStdin: stdin, mockSpawn: spawn };
});

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

afterEach(() => {
  mockSpawn.mockReset();
});

describe("spawnCli", () => {
  it("spawns claude with correct args and pipes prompt on stdin", async () => {
    const result = await spawnCli("claude", "test prompt", "claude-sonnet-4-6");

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      ["-p", "-", "--model", "claude-sonnet-4-6", "--output-format", "json"],
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
    );
    expect(mockStdin.write).toHaveBeenCalledWith("test prompt");
    expect(mockStdin.end).toHaveBeenCalled();
    expect(result).toContain('"title":"Test"');
  });

  it("spawns codex with correct args", async () => {
    await spawnCli("codex", "test prompt", "gpt-5.4-mini");

    expect(mockSpawn).toHaveBeenCalledWith(
      "codex",
      ["exec", "-", "--model", "gpt-5.4-mini"],
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
    );
  });

  it("throws when the CLI exits with non-zero code", async () => {
    mockSpawn.mockImplementationOnce(() => {
      const closeListeners: Array<(code: number | null) => void> = [];
      const stderrListeners: Array<(chunk: Buffer) => void> = [];

      setImmediate(() => {
        stderrListeners.forEach((fn) => fn(Buffer.from("something went wrong")));
        closeListeners.forEach((fn) => fn(1));
      });

      return {
        stdin: mockStdin,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn((event: string, fn: (chunk: Buffer) => void) => { if (event === "data") stderrListeners.push(fn); }) },
        on: vi.fn((event: string, fn: (code: number | null) => void) => { if (event === "close") closeListeners.push(fn); }),
      };
    });

    await expect(spawnCli("claude", "prompt", "model")).rejects.toThrow(/something went wrong/);
  });

  it("throws with install hint when CLI is not found", async () => {
    mockSpawn.mockImplementationOnce(() => {
      const errorListeners: Array<(err: Error) => void> = [];
      setImmediate(() => {
        const err = new Error("spawn claude ENOENT") as Error & { code?: string };
        err.code = "ENOENT";
        errorListeners.forEach((fn) => fn(err));
      });
      return {
        stdin: mockStdin,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, fn: (err: Error | number | null) => void) => { if (event === "error") errorListeners.push(fn as (err: Error) => void); }),
      };
    });

    await expect(spawnCli("claude", "prompt", "model")).rejects.toThrow(
      /Install Claude Code/,
    );
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run tests/unit/llm-cli.test.ts`
Expected: FAIL — `spawnCli` is not exported.

- [ ] **Step 11: Write the `spawnCli` implementation**

Append to `src/lib/llm-cli.ts`:

```typescript
import { spawn } from "node:child_process";

const INSTALL_HINTS: Record<string, string> = {
  claude: "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code",
  codex: "Install Codex CLI: https://github.com/openai/codex",
};

const CLI_ARGS: Record<string, (model: string) => string[]> = {
  claude: (model) => ["-p", "-", "--model", model, "--output-format", "json"],
  codex: (model) => ["exec", "-", "--model", model],
};

export async function spawnCli(
  provider: "claude" | "codex",
  prompt: string,
  model: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const args = CLI_ARGS[provider](model);
    const child = spawn(provider, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err: Error & { code?: string }) => {
      if (err.code === "ENOENT") {
        reject(new Error(`${provider} not found in PATH. ${INSTALL_HINTS[provider]}`));
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(new Error(`${provider} exited with code ${code}: ${stderr}`));
        return;
      }

      resolve(Buffer.concat(stdoutChunks).toString("utf8"));
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run tests/unit/llm-cli.test.ts`
Expected: PASS

- [ ] **Step 13: Write the failing test for `generateSummaryFromCli`**

Append to `tests/unit/llm-cli.test.ts`:

```typescript
import { generateSummaryFromCli } from "../../src/lib/llm-cli.js";
import { buildSummaryPrompt, formatSummaryMarkdown } from "../../src/lib/summary.js";

vi.mock("../../src/lib/summary.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/summary.js")>("../../src/lib/summary.js");
  return {
    ...actual,
  };
});

import sampleTranscriptJson from "../fixtures/sample-transcript.json" with { type: "json" };
import type { TranscriptDocument } from "../../src/types.js";
const sampleTranscript = sampleTranscriptJson as TranscriptDocument;

describe("generateSummaryFromCli", () => {
  afterEach(() => {
    mockSpawn.mockReset();
  });

  it("spawns claude, parses the response, and returns formatted markdown", async () => {
    mockSpawn.mockImplementationOnce(() => {
      const stdoutListeners: Array<(chunk: Buffer) => void> = [];
      const closeListeners: Array<(code: number | null) => void> = [];

      setImmediate(() => {
        stdoutListeners.forEach((fn) => fn(Buffer.from(JSON.stringify({
          title: "Test Title",
          overview: "A summary.",
          keyPoints: ["Point one"],
          timeline: [],
          notableQuotes: [],
          actionItems: [],
        }))));
        closeListeners.forEach((fn) => fn(0));
      });

      return {
        stdin: mockStdin,
        stdout: { on: vi.fn((event: string, fn: (chunk: Buffer) => void) => { if (event === "data") stdoutListeners.push(fn); }) },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, fn: (code: number | null) => void) => { if (event === "close") closeListeners.push(fn); }),
      };
    });

    const markdown = await generateSummaryFromCli("claude", sampleTranscript, {
      model: "claude-sonnet-4-6",
      summaryLanguage: "en",
    });

    expect(markdown).toContain("# How to Run Better 1:1 Meetings");
    expect(markdown).toContain("## Overview");
    expect(markdown).toContain("## Key Points");
    expect(markdown).toContain("Point one");
  });

  it("uses the default model for claude when no model override is provided", async () => {
    mockSpawn.mockImplementationOnce(() => {
      const stdoutListeners: Array<(chunk: Buffer) => void> = [];
      const closeListeners: Array<(code: number | null) => void> = [];

      setImmediate(() => {
        stdoutListeners.forEach((fn) => fn(Buffer.stringify({
          title: "T", overview: "O", keyPoints: [], timeline: [], notableQuotes: [], actionItems: [],
        })));
        closeListeners.forEach((fn) => fn(0));
      });

      return {
        stdin: mockStdin,
        stdout: { on: vi.fn((event: string, fn: (chunk: Buffer) => void) => { if (event === "data") stdoutListeners.push(fn); }) },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, fn: (code: number | null) => void) => { if (event === "close") closeListeners.push(fn); }),
      };
    });

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
```

- [ ] **Step 14: Run the test to verify it fails**

Run: `npx vitest run tests/unit/llm-cli.test.ts`
Expected: FAIL — `generateSummaryFromCli` is not exported.

- [ ] **Step 15: Write the `generateSummaryFromCli` implementation**

Append to `src/lib/llm-cli.ts`:

```typescript
import type { TranscriptDocument } from "../types.js";
import { buildSummaryPrompt, formatSummaryMarkdown, pickSections, pickString, pickStringArray } from "./summary.js";

export interface CliSummaryOptions {
  model: string;
  summaryLanguage: string;
}

export async function generateSummaryFromCli(
  provider: "claude" | "codex",
  transcript: TranscriptDocument,
  options: CliSummaryOptions,
): Promise<string> {
  const prompt = buildSummaryPrompt(transcript, options);
  const stdout = await spawnCli(provider, prompt, options.model);
  const content = parseCliResponse(stdout);

  return formatSummaryMarkdown({
    title: transcript.source.title,
    source: {
      url: transcript.source.url,
      videoId: transcript.source.videoId,
      durationSeconds: transcript.audio.durationSeconds,
      generatedAt: transcript.transcription.generatedAt,
      language: transcript.transcription.language,
    },
    overview: pickString(content.overview) ?? undefined,
    keyPoints: pickStringArray(content.keyPoints),
    timeline: pickSections(content.timeline),
    notableQuotes: pickStringArray(content.notableQuotes),
    actionItems: pickStringArray(content.actionItems),
  });
}
```

Note: `pickString`, `pickStringArray`, and `pickSections` are already exported from `summary.ts` — they need no changes.

- [ ] **Step 16: Run the test to verify it passes**

Run: `npx vitest run tests/unit/llm-cli.test.ts`
Expected: PASS

- [ ] **Step 17: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: All tests pass (11 test files).

- [ ] **Step 18: Commit**

```bash
git add src/lib/llm-cli.ts tests/unit/llm-cli.test.ts
git commit -m "feat: add llm-cli module for CLI-based summarization"
```

---

### Task 2: Update requirements checks for provider-aware validation

**Files:**
- Modify: `src/lib/requirements.ts`
- Modify: `tests/unit/requirements.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/requirements.test.ts`:

```typescript
import { checkCliRequirement } from "../../src/lib/requirements.js";

describe("checkCliRequirement", () => {
  afterEach(() => {
    execFileSyncMock.mockReset();
  });

  it("passes when claude is found in PATH", () => {
    execFileSyncMock.mockReturnValueOnce("/usr/local/bin/claude\n");
    expect(() => checkCliRequirement("claude")).not.toThrow();
    expect(execFileSyncMock).toHaveBeenCalledWith("which", ["claude"], {
      encoding: "utf8",
      stdio: "pipe",
    });
  });

  it("throws when codex is not found in PATH", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found");
    });
    expect(() => checkCliRequirement("codex")).toThrow(/codex.*not found.*Install Codex/);
  });

  it("throws when claude is not found in PATH", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found");
    });
    expect(() => checkCliRequirement("claude")).toThrow(/claude.*not found.*Install Claude/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/requirements.test.ts`
Expected: FAIL — `checkCliRequirement` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/requirements.ts`:

```typescript
const CLI_INSTALL_HINTS: Record<string, string> = {
  claude: "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code",
  codex: "Install Codex CLI: https://github.com/openai/codex",
};

export function checkCliRequirement(name: string): void {
  try {
    execFileSync("which", [name], { encoding: "utf8", stdio: "pipe" });
  } catch {
    throw new Error(`${name} not found in PATH. ${CLI_INSTALL_HINTS[name] ?? `Install ${name}.`}`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/requirements.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/requirements.ts tests/unit/requirements.test.ts
git commit -m "feat: add checkCliRequirement for provider-aware validation"
```

---

### Task 3: Export `pickString`, `pickStringArray`, `pickSections` from summary.ts

**Files:**
- Modify: `src/lib/summary.ts`

These three helpers are already `function` declarations (not exported). They need to be exported so `llm-cli.ts` can import them.

- [ ] **Step 1: Export the three helpers**

In `src/lib/summary.ts`, change these three function declarations:

```typescript
function pickString(value: unknown): string | undefined {
```

to:

```typescript
export function pickString(value: unknown): string | undefined {
```

And:

```typescript
function pickStringArray(value: unknown): string[] {
```

to:

```typescript
export function pickStringArray(value: unknown): string[] {
```

And:

```typescript
function pickSections(value: unknown): SummarySection[] {
```

to:

```typescript
export function pickSections(value: unknown): SummarySection[] {
```

- [ ] **Step 2: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/summary.ts
git commit -m "refactor: export pickString, pickStringArray, pickSections from summary"
```

---

### Task 4: Update `src/cli.ts` — add `--claude` and `--codex` flags

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/commands/summarize.test.ts`

- [ ] **Step 1: Write the failing test for the new flags**

Append to `tests/commands/summarize.test.ts`:

```typescript
it("registers --claude and --codex flags on the summarize command", () => {
  const program = createProgram();

  const summarizeCommand = program.commands.find((command) => command.name() === "summarize");

  expect(summarizeCommand?.options.map((option) => option.long)).toEqual(
    expect.arrayContaining(["--claude", "--codex"]),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/commands/summarize.test.ts`
Expected: FAIL — `--claude` and `--codex` not found in option list.

- [ ] **Step 3: Add the flags to `src/cli.ts`**

In `src/cli.ts`, add `--claude` and `--codex` options to the `summarize` command. Update the option chain after `--base-url`:

```typescript
    .option("--claude")
    .option("--codex")
```

And update the options type in the action handler to include the new fields:

```typescript
        options: {
          output: string;
          model?: string;
          summaryLang?: string;
          force?: boolean;
          baseUrl?: string;
          claude?: boolean;
          codex?: boolean;
        },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/commands/summarize.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts tests/commands/summarize.test.ts
git commit -m "feat: add --claude and --codex flags to summarize command"
```

---

### Task 5: Wire up provider routing in `src/commands/summarize.ts`

**Files:**
- Modify: `src/commands/summarize.ts`
- Modify: `tests/commands/summarize.test.ts`

This is the integration task. The command resolves the provider from flags, checks the right requirements, and routes to the OpenAI path or the CLI path.

- [ ] **Step 1: Write the failing tests for CLI provider routing**

Append to `tests/commands/summarize.test.ts`. Add new mocks at the top of the file (inside the `vi.hoisted` block) and new mock registrations:

Add to the `vi.hoisted` block:

```typescript
  generateSummaryFromCliMock: vi.fn(),
```

Add a new mock registration after the existing ones:

```typescript
vi.mock("../../src/lib/llm-cli.js", () => ({
  generateSummaryFromCli: generateSummaryFromCliMock,
}));
```

Add `generateSummaryFromCliMock` to the `afterEach` cleanup:

```typescript
  generateSummaryFromCliMock.mockReset();
```

Add the test cases:

```typescript
  it("routes to the claude CLI provider when --claude is set", async () => {
    const markdown = "# Summary via Claude\n";

    readTranscriptMock.mockResolvedValueOnce(sampleTranscript);
    generateSummaryFromCliMock.mockResolvedValueOnce(markdown);

    const result = await runSummarizeCommand("/work/out/demo.transcript.json", {
      output: "/work/out/demo.summary.md",
      claude: true,
    });

    expect(checkSummarizeRequirementsMock).toHaveBeenCalledWith(process.env, "claude");
    expect(generateSummaryFromCliMock).toHaveBeenCalledWith("claude", sampleTranscript, {
      model: "claude-sonnet-4-6",
      summaryLanguage: "en",
    });
    expect(writeTextMock).toHaveBeenCalledWith("/work/out/demo.summary.md", `${markdown}\n`, {
      overwrite: false,
    });
    expect(result).toEqual({ summaryPath: "/work/out/demo.summary.md", markdown });
  });

  it("routes to the codex CLI provider when --codex is set", async () => {
    const markdown = "# Summary via Codex\n";

    readTranscriptMock.mockResolvedValueOnce(sampleTranscript);
    generateSummaryFromCliMock.mockResolvedValueOnce(markdown);

    const result = await runSummarizeCommand("/work/out/demo.transcript.json", {
      output: "/work/out/demo.summary.md",
      codex: true,
      model: "gpt-5.4",
    });

    expect(checkSummarizeRequirementsMock).toHaveBeenCalledWith(process.env, "codex");
    expect(generateSummaryFromCliMock).toHaveBeenCalledWith("codex", sampleTranscript, {
      model: "gpt-5.4",
      summaryLanguage: "en",
    });
    expect(result).toEqual({ summaryPath: "/work/out/demo.summary.md", markdown });
  });

  it("rejects when both --claude and --codex are set", async () => {
    await expect(
      runSummarizeCommand("/work/out/demo.transcript.json", {
        output: "/work/out/demo.summary.md",
        claude: true,
        codex: true,
      }),
    ).rejects.toThrow(/--claude.*--codex/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/commands/summarize.test.ts`
Expected: FAIL — `checkSummarizeRequirements` called with wrong arguments, or provider routing not implemented.

- [ ] **Step 3: Update `src/commands/summarize.ts`**

Rewrite `src/commands/summarize.ts` to add provider routing:

```typescript
import { assertWritable, deriveSummaryPath, readTranscript, writeText } from "../lib/fs.js";
import { generateSummaryFromCli } from "../lib/llm-cli.js";
import { createOpenAiClient } from "../lib/openai.js";
import { checkSummarizeRequirements } from "../lib/requirements.js";
import { generateSummaryMarkdown } from "../lib/summary.js";
import { printArtifactPaths, runTasks } from "../lib/tui.js";

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-5-mini",
  claude: "claude-sonnet-4-6",
  codex: "gpt-5.4-mini",
};

type Provider = "openai" | "claude" | "codex";

export interface SummarizeCommandOptions {
  output?: string;
  model?: string;
  summaryLang?: string;
  force?: boolean;
  baseUrl?: string;
  claude?: boolean;
  codex?: boolean;
}

function resolveProvider(options: SummarizeCommandOptions): Provider {
  if (options.claude && options.codex) {
    throw new Error("Cannot use --claude and --codex together. Choose one.");
  }
  if (options.claude) return "claude";
  if (options.codex) return "codex";
  return "openai";
}

export async function runSummarizeCommand(
  transcriptJson: string,
  options: SummarizeCommandOptions,
): Promise<{ summaryPath: string; markdown: string }> {
  const provider = resolveProvider(options);
  const model = options.model ?? DEFAULT_MODELS[provider];
  const summaryPath = options.output ?? deriveSummaryPath(transcriptJson);
  let markdown: string | undefined;

  assertWritable(summaryPath, options.force ?? false);

  if (provider === "openai") {
    let client: ReturnType<typeof createOpenAiClient> | undefined;

    await runTasks([
      {
        title: "checking requirements",
        task: async (_setOutput) => {
          checkSummarizeRequirements(process.env, provider);
          client = createOpenAiClient(process.env, options.baseUrl);
        },
      },
      {
        title: "summarizing transcript",
        task: async (_setOutput) => {
          if (!client) {
            throw new Error("OpenAI client was not initialized");
          }

          const transcript = await readTranscript(transcriptJson);
          markdown = await generateSummaryMarkdown(client, transcript, {
            model,
            summaryLanguage: options.summaryLang ?? "en",
          });
        },
      },
      {
        title: "writing markdown summary",
        task: async (_setOutput) => {
          if (!markdown) {
            throw new Error("Summary markdown was not created");
          }

          await writeText(summaryPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, {
            overwrite: options.force ?? false,
          });
        },
      },
    ]);
  } else {
    await runTasks([
      {
        title: "checking requirements",
        task: async (_setOutput) => {
          checkSummarizeRequirements(process.env, provider);
        },
      },
      {
        title: "summarizing transcript",
        task: async (_setOutput) => {
          const transcript = await readTranscript(transcriptJson);
          markdown = await generateSummaryFromCli(provider, transcript, {
            model,
            summaryLanguage: options.summaryLang ?? "en",
          });
        },
      },
      {
        title: "writing markdown summary",
        task: async (_setOutput) => {
          if (!markdown) {
            throw new Error("Summary markdown was not created");
          }

          await writeText(summaryPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, {
            overwrite: options.force ?? false,
          });
        },
      },
    ]);
  }

  if (!markdown) {
    throw new Error("Summary markdown was not created");
  }

  printArtifactPaths({ summaryPath });

  return {
    summaryPath,
    markdown,
  };
}
```

- [ ] **Step 4: Update `checkSummarizeRequirements` to accept a provider**

In `src/lib/requirements.ts`, update `checkSummarizeRequirements`:

```typescript
export function checkSummarizeRequirements(
  env: NodeJS.ProcessEnv,
  provider: string = "openai",
): void {
  if (provider === "openai") {
    assertOpenAiConfigured(env);
  } else {
    checkCliRequirement(provider);
  }
}
```

- [ ] **Step 5: Run the command tests**

Run: `npx vitest run tests/commands/summarize.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/commands/summarize.ts src/lib/requirements.ts tests/commands/summarize.test.ts
git commit -m "feat: wire up provider routing for --claude and --codex in summarize"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All 11 test files pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors.
