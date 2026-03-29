# AutoNota

`autonota` is a Node CLI for downloading YouTube audio, transcribing it with OpenAI Whisper into timestamped JSON, and summarizing transcript JSON into Markdown.

## Prerequisites

- Node.js 22+
- `yt-dlp`
- `ffmpeg`
- `ffprobe`
- `OPENAI_API_KEY`

## Install

```bash
npm install -g autonota
```

Or run without installing:

```bash
npx autonota transcribe <youtube-url> --output <base-path>
npx autonota summarize <transcript-json> --output <summary-md>
```

## Usage

```bash
autonota transcribe <youtube-url> --output <base-path>
autonota summarize <transcript-json> --output <summary-md>
```

Examples:

```bash
autonota transcribe "https://www.youtube.com/watch?v=..." --output ./out/demo
autonota summarize ./out/demo.transcript.json --output ./out/demo.summary.md
```

## Commands

### Transcribe

```bash
autonota transcribe --help
```

Flags:

- `--output <basePath>`: base path used to derive `<base>.transcript.json`
- `--model <name>`: Whisper model override, defaults to `whisper-1`
- `--lang <code>`: transcription language override, defaults to auto detection
- `--browser <name>`: optional `yt-dlp --cookies-from-browser` source
- `--force`: overwrite an existing transcript output
- `--base-url <url>`: optional OpenAI-compatible base URL override

Notes:

- Downloaded MP3s are stored beside the `--output` base path as `<base>-<youtube-title-slug>.mp3` and reused if that file already exists.
- If `--output` ends with `/` or `\`, it is treated as a directory, producing:
  - transcript: `<output-dir>/<slug>.transcript.json`
  - audio: `<output-dir>/<slug>.mp3`
- Omit `--lang` to let the API auto-detect the source language.

### Summarize

```bash
autonota summarize --help
```

Flags:

- `--output <summaryPath>`: explicit summary file path
- `--model <name>`: summary model override; defaults to `gpt-5-mini` (OpenAI), `claude-sonnet-4-6` (`--claude`), or `gpt-5.4-mini` (`--codex`)
- `--summary-lang <code>`: summary language override, defaults to `en`
- `--force`: overwrite an existing summary output
- `--base-url <url>`: optional OpenAI-compatible base URL override (OpenAI path only)
- `--claude`: use Claude Code CLI for summarization
- `--codex`: use Codex CLI for summarization

Notes:

- `--claude` and `--codex` are mutually exclusive.

## Progress Output

`autonota transcribe` streams progress for the two slow steps:

**Download** — yt-dlp progress lines appear under the spinner as they arrive:

```
↻ downloading audio
    [download]  45.2% of 32.4MiB at 1.2MiB/s ETA 00:14
```

**Transcription** — shows which chunk is being uploaded, and counts down rate-limit waits:

```
↻ transcribing audio
    chunk 2/5...
```

```
↻ transcribing audio
    rate limited, waiting 4m32s (attempt 2/3)...
    retrying in 3m40s...
```

In non-TTY contexts (pipes, CI) all progress writes to stderr; stdout remains machine-readable artifact paths only.

## Artifacts

- `autonota transcribe --output ./out/demo` writes `./out/demo.transcript.json`
- `autonota summarize ./out/demo.transcript.json --output ./out/demo.summary.md` writes `./out/demo.summary.md`

## Environment

Copy `.env.example` to `.env` if you want local environment loading through your shell setup.

Required:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_BASE_URL`
