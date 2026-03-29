# CLI Provider Summarizer

Date: 2026-03-29

## Problem

The `nota summarize` command requires an OpenAI API key. Users with active Claude Code or Codex subscriptions cannot use those subscriptions to generate summaries.

## Solution

Add `--claude` and `--codex` flags to the `summarize` command. These flags spawn the respective CLI tool as a subprocess, so users with existing subscriptions need no extra API keys.

```
nota summarize transcript.json --claude              # claude CLI, model: claude-sonnet-4-6
nota summarize transcript.json --codex               # codex CLI, model: gpt-5.4-mini
nota summarize transcript.json                       # OpenAI API, model: gpt-5-mini (unchanged)
nota summarize transcript.json --claude --model opus # override default model
```

`--claude` and `--codex` are mutually exclusive. `--model` overrides the provider's default model.

## Architecture

The existing OpenAI path stays untouched. A new module `src/lib/llm-cli.ts` handles CLI subprocess execution. The `summarize` command routes to one path or the other based on flags.

### Command routing

```
runSummarizeCommand(options)
  ├── no flag     → createOpenAiClient + generateSummaryMarkdown  (unchanged)
  ├── --claude    → generateSummaryFromCli("claude", ...)
  └── --codex     → generateSummaryFromCli("codex", ...)
```

Both paths reuse `buildSummaryPrompt()` for prompt construction and `formatSummaryMarkdown()` for output formatting.

### New module: `src/lib/llm-cli.ts`

`generateSummaryFromCli(provider, transcript, options)`:

1. Calls `buildSummaryPrompt(transcript, options)` to produce the prompt.
2. Spawns the CLI subprocess:
   - Claude: `claude -p - --model <model> --output-format json`
   - Codex: `codex exec - --model <model>`
3. Pipes the prompt on stdin (avoids shell-escaping issues).
4. Captures stdout.
5. Strips markdown fences (`` ```json ... ``` ``) if present.
6. Parses JSON and validates required fields (`title`, `overview`, `keyPoints`, `timeline`, `notableQuotes`, `actionItems`).
7. Returns `SummaryResponseShape`.

Error cases:
- CLI not found in PATH: "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code" or "Install Codex CLI: https://github.com/openai/codex"
- Non-zero exit code: surface stderr.
- JSON parse failure: error with raw output for debugging.

### Requirements check

`checkSummarizeRequirements` accepts the provider and checks accordingly:

- Default (OpenAI): `OPENAI_API_KEY` must be set (unchanged).
- `--claude`: `claude` must be in PATH.
- `--codex`: `codex` must be in PATH.

### Options interface

```typescript
export interface SummarizeCommandOptions {
  output?: string;
  model?: string;
  summaryLang?: string;
  force?: boolean;
  baseUrl?: string;
  claude?: boolean;   // new
  codex?: boolean;    // new
}
```

## Files changed

| File | Change |
|------|--------|
| `src/cli.ts` | Add `--claude` and `--codex` flags to the summarize command. |
| `src/commands/summarize.ts` | Resolve provider from flags; route to OpenAI or CLI path. |
| `src/lib/llm-cli.ts` | **New.** CLI subprocess execution and JSON extraction. |
| `src/lib/requirements.ts` | Accept provider parameter; check CLI binary or API key. |
| `tests/unit/llm-cli.test.ts` | **New.** Tests for subprocess invocation, JSON parsing, error cases. |

No changes to `src/lib/summary.ts`, `src/types.ts`, `src/lib/fs.ts`, `src/lib/tui.ts`, or existing tests.

## Testing

- **Unit tests** (`tests/unit/llm-cli.test.ts`): mock `child_process.spawn`; verify CLI arguments, stdin piping, JSON parsing (including fence stripping), and error handling.
- **Command tests**: verify provider routing based on flags.
- Existing tests remain untouched.
