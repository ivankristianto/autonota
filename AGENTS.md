# AGENTS

## Project Purpose

`nota` is a Node CLI that turns YouTube videos into transcript JSON and transcript JSON into Markdown summaries.

## Working Rules

- Keep command files thin and move reusable logic into `src/lib/*`.
- Preserve the transcript artifact contract from the design spec unless the user explicitly approves a change.
- Prefer `rg` for search.
- Write tests before production code changes and verify the test fails first.
- Run the relevant tests before claiming a task is complete.
- Do not hardcode project-specific transcript filters from older one-off scripts into the default path.
- Keep the CLI scriptable. Terminal UI should stay minimal and should not replace explicit flags.
- The current timestamped transcript artifact depends on segment timestamps, so transcription support is intentionally constrained to `whisper-1` unless the transcript contract is redesigned.

## Key Paths

- `src/cli.ts`: top-level Commander entrypoint
- `src/commands/transcribe.ts`: YouTube -> transcript pipeline orchestration
- `src/commands/summarize.ts`: transcript -> Markdown summary orchestration
- `src/lib/`: reusable helpers for fs, requirements, YouTube, audio, transcription, summary, and TUI
- `tests/`: unit and command tests
- `docs/superpowers/specs/`: approved design docs
- `docs/superpowers/plans/`: approved implementation plans

## Artifact Conventions

- `nota transcribe --output <base-path>` writes `<base-path>.transcript.json`
- `nota summarize <transcript-json> --output <summary-md>` writes the explicit Markdown path passed by the caller
