# --version flag and diagnostics subcommand

Date: 2026-03-29

## Overview

Add two CLI features to `autonota`:

1. A `--version` flag that prints the current package version.
2. A `diagnostics` subcommand that checks all required tools and the API key, reporting status and install hints.

## `--version`

- Add `program.version(<version>)` to the Commander program in `src/cli.ts`.
- Read the version string from `package.json` using `fs.readFileSync` + `JSON.parse`.
- Output format: `autonota 0.2.0` (Commander default: `<name> <version>`).

## `diagnostics` subcommand

### Command

```
autonota diagnostics
```

No arguments or options.

### Checks

| Check | Validation |
|---|---|
| `yt-dlp` | Binary exists in PATH |
| `ffmpeg` | Binary exists in PATH |
| `ffprobe` | Binary exists in PATH |
| `OPENAI_API_KEY` | Environment variable is set and non-empty |

### Output

Plain text to stdout:

```
autonota diagnostics

  ✓ yt-dlp        /opt/homebrew/bin/yt-dlp
  ✓ ffmpeg        /opt/homebrew/bin/ffmpeg
  ✗ ffprobe       not found — brew install ffmpeg
  ✓ OPENAI_API_KEY set

1 issue found. Fix the above before running autonota.
```

When all checks pass:

```
autonota diagnostics

  ✓ yt-dlp        /opt/homebrew/bin/yt-dlp
  ✓ ffmpeg        /opt/homebrew/bin/ffmpeg
  ✓ ffprobe       /opt/homebrew/bin/ffprobe
  ✓ OPENAI_API_KEY set

All checks passed.
```

### Exit codes

- `0` if all checks pass.
- `1` if any check fails.

### Install hints

- `yt-dlp`: `brew install yt-dlp`
- `ffmpeg` / `ffprobe`: `brew install ffmpeg`
- `OPENAI_API_KEY`: `Set OPENAI_API_KEY in your shell profile or .env file`

### Implementation

- **`src/lib/diagnostics.ts`** — Check functions that return structured results (found/not found, path, hint) instead of throwing. Each check is a pure function easy to unit-test.
- **`src/commands/diagnostics.ts`** — `runDiagnosticsCommand()` that calls all checks, formats output, and sets `process.exitCode`.
- **`src/cli.ts`** — Register `.version()` and the `diagnostics` subcommand.

### Testing

- Unit tests for diagnostic check logic in `tests/unit/diagnostics.test.ts` (mocked `execFileSync` and `process.env`).
- CLI-level test verifying `autonota diagnostics` invocation and output format.
