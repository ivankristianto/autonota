# Nota

`nota` is a Node CLI for downloading YouTube audio, transcribing it with OpenAI Whisper into timestamped JSON, and summarizing transcript JSON into Markdown.

## Prerequisites

- Node.js 20+
- `yt-dlp`
- `ffmpeg`
- `ffprobe`
- `OPENAI_API_KEY`

## Install

```bash
npm install
npm run build
```

## Usage

```bash
nota transcribe <youtube-url> --output <base-path>
nota summarize <transcript-json> --output <summary-md>
```

Examples:

```bash
nota transcribe "https://www.youtube.com/watch?v=..." --output ./out/demo
nota summarize ./out/demo.transcript.json --output ./out/demo.summary.md
```

## Commands

### Transcribe

```bash
nota transcribe --help
```

Flags:

- `--output <basePath>`: base path used to derive `<base>.transcript.json`
- `--model <name>`: Whisper model override, defaults to `whisper-1`
- `--lang <code>`: transcription language override, defaults to auto detection
- `--browser <name>`: optional `yt-dlp --cookies-from-browser` source
- `--force`: overwrite an existing transcript output
- `--base-url <url>`: optional OpenAI-compatible base URL override

Notes:

- Timestamped transcript generation currently supports only `whisper-1`.
- Omit `--lang` to let the API auto-detect the source language.

### Summarize

```bash
nota summarize --help
```

Flags:

- `--output <summaryPath>`: explicit summary file path
- `--model <name>`: summary model override, defaults to `gpt-4.1-mini`
- `--summary-lang <code>`: summary language override, defaults to `en`
- `--force`: overwrite an existing summary output
- `--base-url <url>`: optional OpenAI-compatible base URL override

## Artifacts

- `nota transcribe --output ./out/demo` writes `./out/demo.transcript.json`
- `nota summarize ./out/demo.transcript.json --output ./out/demo.summary.md` writes `./out/demo.summary.md`

## Environment

Copy `.env.example` to `.env` if you want local environment loading through your shell setup.

Required:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_BASE_URL`
