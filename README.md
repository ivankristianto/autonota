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

## Environment

Copy `.env.example` to `.env` if you want local environment loading through your shell setup.

Required:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_BASE_URL`
