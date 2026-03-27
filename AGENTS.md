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

## Key Paths

- `src/cli.ts`: top-level Commander entrypoint
- `src/commands/`: command orchestration
- `src/lib/`: reusable helpers
- `tests/`: unit and command tests
- `docs/superpowers/specs/`: approved design docs
- `docs/superpowers/plans/`: approved implementation plans
