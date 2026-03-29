# AGENTS.md

This file provides guidance to Claude Code and other AI agents when working with code in this repository.

## Project Purpose

`autonota` is a Node CLI that downloads YouTube audio, transcribes it with OpenAI Whisper into timestamped JSON, and summarizes transcripts into Markdown.

## Commands

```bash
npm run build        # compile TypeScript → dist/
npm run dev          # run CLI via tsx without building
npm test             # run all tests once
npm run test:watch   # run tests in watch mode
```

Run a single test file:

```bash
npx vitest run tests/unit/fs.test.ts
```

Run the CLI locally:

```bash
node dist/cli.js transcribe <youtube-url> --output <base-path>
node dist/cli.js summarize <transcript-json> --output <summary.md>
```

Requires `OPENAI_API_KEY` in the environment (copy `.env.example` → `.env`). System dependencies: `yt-dlp`, `ffmpeg`, `ffprobe`.

## Architecture

The app has two commands, each orchestrated in `src/commands/` and powered by focused libraries in `src/lib/`:

- **`src/cli.ts`** — Commander entrypoint; registers `transcribe` and `summarize` subcommands.
- **`src/commands/transcribe.ts`** — YouTube → transcript pipeline: validate paths → check requirements → download audio → transcribe with Whisper → write JSON.
- **`src/commands/summarize.ts`** — Transcript → Markdown summary pipeline: validate → check requirements → read transcript → call GPT → write Markdown.
- **`src/lib/transcription.ts`** — Whisper API calls, chunking for files >24 MB, timestamp assembly, rate-limit retry.
- **`src/lib/youtube.ts`** — `yt-dlp` wrapper; URL normalization, video ID extraction, metadata fetch, audio download.
- **`src/lib/audio.ts`** — `ffprobe`/`ffmpeg` wrappers; duration detection, chunk planning, audio splitting.
- **`src/lib/summary.ts`** — GPT structured-output call via `responses.parse`; prompt construction, Markdown formatting.
- **`src/lib/fs.ts`** — Artifact path derivation, atomic writes (temp file + rename), transcript shape validation, overwrite guard.
- **`src/lib/tui.ts`** — Listr2 task runner; TTY detection, progress to stderr in non-TTY contexts.
- **`src/lib/requirements.ts`** — Pre-flight checks for binaries and `OPENAI_API_KEY`.
- **`src/types.ts`** — Shared TypeScript types; defines the stable `TranscriptDocument` artifact shape.

Tests live in `tests/unit/` (per-module) and `tests/commands/` (command-level integration). Fixtures are in `tests/fixtures/`.

## Working Rules

- Keep command files thin; move reusable logic into `src/lib/*`.
- Write tests before production code changes and verify the failing test first.
- Run the relevant tests before claiming a task is complete.
- Transcription is intentionally constrained to `whisper-1` — it is the only Whisper model that returns segment-level timestamps. Do not change the default model without redesigning the transcript contract.
- Default models: `whisper-1` for transcription, `gpt-5-mini` for summarization.
- Keep the CLI scriptable; do not add interactive prompts or replace explicit flags with TUI dialogs.

## Artifact Conventions

- `autonota transcribe --output <base-path>` writes `<base-path>.transcript.json`
- `autonota summarize <transcript-json> --output <summary-md>` writes exactly the path the caller specified

The `TranscriptDocument` shape in `src/types.ts` is the stable contract between commands. Do not change it without explicit user approval.

## Forbidden Paths

- `docs/superpowers/` is gitignored and must never be recreated or committed. Do not write specs, plans, or any other files under this path.
