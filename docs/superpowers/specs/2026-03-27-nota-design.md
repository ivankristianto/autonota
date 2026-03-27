# Nota Design

Date: 2026-03-27
Status: Approved for planning review

## Overview

`nota` is a Node-based CLI for turning a YouTube video into a transcript artifact, then turning that transcript into a readable Markdown summary.

The v1 command surface is:

```bash
nota transcribe <youtube-url> --output <base-path>
nota summarize <transcript-json> --output <summary-md>
```

Example:

```bash
nota transcribe "https://www.youtube.com/watch?v=..." --output ./out/my-episode
nota summarize ./out/my-episode.transcript.json --output ./out/my-episode.summary.md
```

The tool should produce two separate artifacts:

- `<base>.transcript.json`
- `<base>.summary.md`

This keeps transcription deterministic and allows repeated summarization with different prompts or models without mutating the source transcript.

## Goals

- Provide a short standalone binary name: `nota`
- Download YouTube audio and convert it to MP3
- Chunk audio automatically when it exceeds OpenAI upload limits
- Transcribe audio with OpenAI Whisper through the official Node SDK
- Save the transcript as structured JSON
- Summarize a transcript JSON file into human-readable Markdown
- Expose minimal terminal UI feedback for progress, retries, and output paths

## Non-Goals

- A full-screen interactive TUI dashboard
- Batch queue management
- History, persistence, or job resumption beyond output artifacts
- Markdown and JSON summary outputs in the same v1 command
- Tight coupling to the existing `ai` shell command family

## User Experience

`nota` is command-first and scriptable. The TUI layer exists only to improve execution feedback, not to replace flags with an interactive workflow.

Expected status phases:

- checking requirements
- downloading audio
- chunking audio
- transcribing chunk x/y
- writing transcript
- summarizing transcript
- writing markdown summary

The CLI should print final artifact paths plainly so they are easy to reuse in shell pipelines.

## Commands

### `nota transcribe`

Purpose: download a YouTube video as MP3, chunk it if necessary, transcribe it, and write a transcript JSON artifact.

Base interface:

```bash
nota transcribe <youtube-url> --output <base-path>
```

Initial options expected in v1:

- `--output <base-path>`: base path used to derive `<base>.transcript.json`
- `--model <name>`: optional Whisper model override, default `whisper-1`
- `--lang <code|auto>`: optional transcription language override, default `auto`
- `--browser <name>`: optional `yt-dlp --cookies-from-browser` source when needed
- `--force`: allow overwriting existing transcript output
- `--base-url <url>`: optional OpenAI-compatible base URL override

### `nota summarize`

Purpose: load a transcript JSON artifact, summarize it with OpenAI, and write a Markdown summary.

Base interface:

```bash
nota summarize <transcript-json> --output <summary-md>
```

Initial options expected in v1:

- `--output <summary-md>`: explicit summary file path
- `--model <name>`: optional summary model override
- `--summary-lang <code>`: optional summary language override, default `en`
- `--force`: allow overwriting existing summary output
- `--base-url <url>`: optional OpenAI-compatible base URL override

## Default Language Behavior

The project is English-first for summary output and CLI documentation.

Transcription should default to `auto` rather than forcing English, because source-language detection is safer for transcript quality. Summary generation should default to English.

## Architecture

The project should be a small ESM Node CLI package with one executable entrypoint and reusable library modules.

Proposed layout:

- `src/cli.ts`: parse commands and flags, dispatch subcommands, own exit codes
- `src/commands/transcribe.ts`: orchestrate download, chunking, transcription, and transcript output
- `src/commands/summarize.ts`: orchestrate transcript loading, summary generation, and Markdown output
- `src/lib/youtube.ts`: YouTube URL normalization, video ID extraction, and `yt-dlp` download logic
- `src/lib/audio.ts`: duration lookup, chunk planning, split/cleanup helpers
- `src/lib/transcription.ts`: OpenAI Whisper calls, retry handling, segment normalization
- `src/lib/summary.ts`: summary prompt construction and Markdown formatting
- `src/lib/fs.ts`: artifact naming, output directory creation, read/write helpers
- `src/lib/requirements.ts`: dependency and environment checks
- `src/types.ts`: shared transcript and summary-related types

Commands should orchestrate. Library modules should contain the reusable logic.

## Refactor Source

The existing script at `/Users/ivan/Works/AI/ngobrolinweb/landing/scripts/transcribe-openai.js` should be used as the initial source for reusable logic.

Logic to preserve:

- dependency checks for `OPENAI_API_KEY`, `yt-dlp`, `ffmpeg`, and `ffprobe`
- MP3 download flow through `yt-dlp`
- size-aware chunking based on file size and duration
- retry handling for OpenAI rate limits
- segment normalization and transcript assembly

Logic to remove or generalize:

- project-specific fixed directories
- dependency on `episodes.json`
- hardcoded content-source assumptions
- hardcoded transcript filtering rules tied to one media workflow

If non-conversation filtering is kept at all, it should be optional and configurable rather than built into the default path.

## Transcript Artifact Contract

Transcript JSON should follow this shape:

```json
{
  "source": {
    "type": "youtube",
    "url": "https://www.youtube.com/watch?v=...",
    "videoId": "..."
  },
  "transcription": {
    "model": "whisper-1",
    "language": "auto",
    "generatedAt": "ISO-8601"
  },
  "audio": {
    "durationSeconds": 1234.56,
    "chunkCount": 4
  },
  "segments": [
    {
      "start": 0.0,
      "end": 12.3,
      "text": "..."
    }
  ],
  "fullText": "..."
}
```

The summarizer must treat this JSON format as its stable input contract.

## Summary Artifact Contract

The summary output is Markdown. The v1 structure should include:

- title and source metadata
- short overview
- key points
- timeline or section breakdown based on transcript content
- notable quotes
- action items only when the source content supports them

This output is intended for direct reading, not as an intermediate machine format.

## Error Handling

The CLI should:

- fail fast when required tools or environment variables are missing
- validate YouTube URLs before starting work
- exit non-zero on command failure
- print concise retry notices for rate-limit handling
- clean temporary chunk files on success or failure
- avoid overwriting existing outputs unless `--force` is provided

If an output file already exists and `--force` is not set, the command should stop with a clear error instead of mutating the file silently.

## Minimal TUI

The v1 TUI should stay minimal. It exists to show live progress and concise status, not to create a guided interactive application.

Appropriate tooling includes lightweight CLI feedback libraries such as `ora`, `cli-progress`, or `listr2`. The exact choice is an implementation detail as long as the command remains scriptable and the output stays readable.

## Testing

The project should include:

- unit tests for URL parsing, artifact naming, chunk-duration math, transcript assembly, and Markdown formatting
- command-level tests with mocked OpenAI and process execution
- smoke tests using local fixtures instead of real network calls
- manual verification for real `yt-dlp` and `ffmpeg` integration

The initial implementation should optimize for confidence in the pipeline logic without requiring live external services in automated tests.

## Implementation Boundaries

The repo is currently empty. Initial implementation work is expected to include:

- Node project initialization
- package scripts and executable wiring
- dependency installation and baseline config
- project `AGENTS.md` creation

These are part of the implementation phase, not this design document phase.
