# Nota

`nota` is a Node CLI for downloading YouTube audio, transcribing it with OpenAI Whisper, and summarizing transcript JSON into Markdown.

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

## Commands

```bash
nota transcribe <youtube-url> --output <base-path>
nota summarize <transcript-json> --output <summary-md>
```

Examples:

```bash
nota transcribe "https://www.youtube.com/watch?v=..." --output ./out/demo
nota summarize ./out/demo.transcript.json --output ./out/demo.summary.md
```

Verified help output:

```bash
nota transcribe --help
```

Supported flags:

- `--output <basePath>`
- `--model <name>`
- `--lang <code>`
- `--browser <name>`
- `--force`
- `--base-url <url>`

Notes:

- Timestamped transcript generation currently supports `whisper-1`.
- Omit `--lang` to let the API auto-detect the source language.

```bash
nota summarize --help
```

Supported flags:

- `--output <summaryPath>`
- `--model <name>`
- `--summary-lang <code>`
- `--force`
- `--base-url <url>`

Artifacts:

- `nota transcribe --output ./out/demo` writes `./out/demo.transcript.json`
- `nota summarize ./out/demo.transcript.json --output ./out/demo.summary.md` writes Markdown summary output

## Environment

Copy `.env.example` to `.env` if you want local environment loading through your shell setup.

Required:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_BASE_URL`
