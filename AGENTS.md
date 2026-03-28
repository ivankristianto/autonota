# AGENTS

## Project Purpose

`nota` is a Node CLI that turns YouTube videos into timestamped transcript JSON and transcript JSON into Markdown summaries.

## Working Rules

- Keep command files thin and move reusable logic into `src/lib/*`.
- Preserve the transcript artifact contract from the design spec unless the user explicitly approves a change.
- Prefer `rg` for search.
- Write tests before production code changes and verify the test fails first.
- Run the relevant tests before claiming a task is complete.
- Do not hardcode project-specific transcript filters from older one-off scripts into the default path.
- Keep the CLI scriptable. Terminal UI should stay minimal and should not replace explicit flags.
- The current timestamped transcript artifact depends on segment timestamps, so transcription support is intentionally constrained to `whisper-1` unless the transcript contract is redesigned.
- Keep the transcript and summary path conventions stable: `nota transcribe --output <base-path>` writes `<base-path>.transcript.json`, and `nota summarize <transcript-json> --output <summary-md>` writes exactly the summary path passed by the caller.
- Default transcription remains `whisper-1` with auto language detection, and summary generation defaults to `gpt-4.1-mini` with English output unless the design spec changes.

## Key Paths

- `src/cli.ts`: top-level Commander entrypoint
- `src/commands/transcribe.ts`: YouTube -> transcript pipeline orchestration
- `src/commands/summarize.ts`: transcript -> Markdown summary orchestration
- `src/lib/fs.ts`: artifact path derivation, read/write helpers, and transcript validation
- `src/lib/transcription.ts`: OpenAI Whisper calls, timestamp assembly, and transcript normalization
- `src/lib/summary.ts`: summary prompt construction and Markdown formatting
- `src/lib/requirements.ts`, `src/lib/youtube.ts`, `src/lib/audio.ts`, `src/lib/tui.ts`: reusable helpers for command prerequisites, YouTube handling, audio processing, and progress UI
- `tests/`: unit and command tests
- `docs/superpowers/specs/`: approved design docs
- `docs/superpowers/plans/`: approved implementation plans

## Artifact Conventions

- `nota transcribe --output <base-path>` writes `<base-path>.transcript.json`
- `nota summarize <transcript-json> --output <summary-md>` writes the explicit Markdown path passed by the caller
