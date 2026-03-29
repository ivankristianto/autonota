# Release Process Design

## Goal

Add `npm run release` — a single command that bumps the version (patch/minor/major), runs quality gates, publishes to npm, and pushes a version tag to GitHub.

## Flow

```
npm run release
  └─ scripts/release.sh
       1. Pre-flight checks
       2. Prompt version bump (patch | minor | major)
       3. Bump package.json via jq
       4. Run quality gates (typecheck → lint → test → build)
       5. Git commit + tag (vX.Y.Z)
       6. npm publish --dry-run → show output
       7. Prompt: "Publish vX.Y.Z? [y/N]"
       8. npm publish
       9. git push && git push --tags
```

## Steps in Detail

### 1. Pre-flight checks

- Verify clean git working tree (`git diff --quiet`)
- Verify current branch is `main`
- Verify npm auth (`npm whoami` succeeds)
- Abort immediately if any check fails

### 2. Version bump prompt

- Display current version from `package.json`
- Prompt user to select: `patch`, `minor`, or `major`
- Use `jq` to bump `package.json` in place

### 3. Quality gates

Run in order. Abort on first failure.

1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. `npm run build`

### 4. Git commit + tag

- Commit `package.json` with message `chore(release): vX.Y.Z`
- Create annotated tag `vX.Y.Z`

### 5. Dry-run publish

- Run `npm publish --dry-run`
- Display output so the user can verify what will be published

### 6. Confirm

- Prompt: `Publish vX.Y.Z to npm? [y/N]`
- If no → restore `package.json`, remove commit and tag, abort

### 7. Publish

- Run `npm publish`
- If it fails → leave commit+tag in place but do not push; user can retry or reset

### 8. Push

- `git push origin main`
- `git push origin vX.Y.Z`

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Unclean working tree | Abort with message |
| Not on main branch | Abort with message |
| npm not authenticated | Abort with message |
| Quality gate fails | Restore `package.json`, abort |
| User declines publish | Restore version, remove commit+tag, abort |
| npm publish fails | Leave commit+tag unpushed, print retry instructions |
| git push fails | Print manual push instructions |

## Implementation

- **File**: `scripts/release.sh`
- **npm script**: `"release": "bash scripts/release.sh"`
- **No new dependencies** — uses `jq` (pre-installed on macOS)
- **Interactive prompts**: `select` for version choice, `read` for confirmations
- **Shell**: bash

## Out of Scope

- Changelog generation
- GitHub Releases creation
- CI-based publishing
- Conventional commit enforcement
