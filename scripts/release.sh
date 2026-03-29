#!/usr/bin/env bash
set -euo pipefail

# ── Colors ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${GREEN}✔${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${RESET} %s\n" "$*"; }
error() { printf "${RED}✖${RESET} %s\n" "$*" >&2; }
bold()  { printf "${BOLD}%s${RESET}\n" "$*"; }

# ── Cleanup trap ────────────────────────────────────────
ORIGINAL_VERSION=""
NEW_VERSION=""
GIT_TAG=""
COMMIT_CREATED=false

cleanup() {
  if [[ -n "$ORIGINAL_VERSION" && -f package.json ]]; then
    # Restore original version if we changed it
    current_version=$(jq -r '.version' package.json)
    if [[ "$current_version" != "$ORIGINAL_VERSION" ]]; then
      jq --arg v "$ORIGINAL_VERSION" '.version = $v' package.json > package.json.tmp \
        && mv package.json.tmp package.json
      warn "Restored package.json to v$ORIGINAL_VERSION"
    fi
  fi
  # Remove commit and tag if we created them
  if $COMMIT_CREATED; then
    git reset --soft HEAD~1 2>/dev/null || true
    warn "Removed release commit"
  fi
  if [[ -n "$GIT_TAG" ]]; then
    git tag -d "$GIT_TAG" 2>/dev/null || true
    warn "Removed tag $GIT_TAG"
  fi
}

trap cleanup EXIT

# ── 1. Pre-flight checks ───────────────────────────────
bold "Pre-flight checks"

# Check jq
if ! command -v jq &>/dev/null; then
  error "jq is required but not installed. Install with: brew install jq"
  exit 1
fi

# Clean working tree
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  error "Working tree is not clean. Commit or stash your changes first."
  exit 1
fi
info "Working tree is clean"

# On main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  error "Not on main branch (currently on $CURRENT_BRANCH). Switch to main first."
  exit 1
fi
info "On main branch"

# npm auth
NPM_USER=$(npm whoami 2>/dev/null) || {
  error "Not authenticated with npm. Run 'npm login' first."
  exit 1
}
info "Authenticated as $NPM_USER on npm"

# ── 2. Version bump ────────────────────────────────────
bold "Version bump"

ORIGINAL_VERSION=$(jq -r '.version' package.json)

# Pre-compute bumped versions
NEXT_PATCH=$(jq -r '.version | split(".") | .[0:2] + [ (.[2] | tonumber + 1 | tostring) ] | join(".")' <<< "{\"version\":\"$ORIGINAL_VERSION\"}")
NEXT_MINOR=$(jq -r '.version | split(".") | .[0:1] + [ (.[1] | tonumber + 1 | tostring), "0" ] | join(".")' <<< "{\"version\":\"$ORIGINAL_VERSION\"}")
NEXT_MAJOR=$(jq -r '.version | split(".") | [ (.[0] | tonumber + 1 | tostring), "0", "0" ] | join(".")' <<< "{\"version\":\"$ORIGINAL_VERSION\"}")

echo ""
info "Current version: v$ORIGINAL_VERSION"
echo ""
echo "Select version bump:"
echo "  1) patch  ($ORIGINAL_VERSION → $NEXT_PATCH)"
echo "  2) minor  ($ORIGINAL_VERSION → $NEXT_MINOR)"
echo "  3) major  ($ORIGINAL_VERSION → $NEXT_MAJOR)"
echo ""

read -r -p "Enter choice [1-3]: " BUMP_CHOICE

case "$BUMP_CHOICE" in
  1) BUMP_TYPE="patch" ;;
  2) BUMP_TYPE="minor" ;;
  3) BUMP_TYPE="major" ;;
  *) error "Invalid choice: $BUMP_CHOICE"; exit 1 ;;
esac

# Calculate new version
case "$BUMP_TYPE" in
  patch) NEW_VERSION="$NEXT_PATCH" ;;
  minor) NEW_VERSION="$NEXT_MINOR" ;;
  major) NEW_VERSION="$NEXT_MAJOR" ;;
esac

# Bump version in package.json
jq --arg v "$NEW_VERSION" '.version = $v' package.json > package.json.tmp \
  && mv package.json.tmp package.json

info "Bumped version: v$ORIGINAL_VERSION → v$NEW_VERSION ($BUMP_TYPE)"

# ── 3. Quality gates ───────────────────────────────────
bold "Quality gates"

run_gate() {
  local name="$1"
  shift
  echo ""
  info "Running: $name"
  if ! "$@"; then
    error "$name failed"
    exit 1
  fi
  info "$name passed"
}

run_gate "Typecheck" npm run typecheck
run_gate "Lint"       npm run lint
run_gate "Tests"      npm test
run_gate "Build"      npm run build

# ── 4. Git commit + tag ────────────────────────────────
bold "Git commit + tag"

GIT_TAG="v$NEW_VERSION"

git add package.json
git commit -m "chore(release): $GIT_TAG"
COMMIT_CREATED=true

git tag -a "$GIT_TAG" -m "Release $GIT_TAG"

info "Committed and tagged $GIT_TAG"

# ── 5. Dry-run publish ─────────────────────────────────
bold "Dry-run publish"

echo ""
npm publish --dry-run 2>&1 || true
echo ""

# ── 6. Confirm ─────────────────────────────────────────
read -r -p "Publish $(bold "v$NEW_VERSION") to npm? [y/N]: " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  warn "Release cancelled by user"
  COMMIT_CREATED=true  # let cleanup handle it
  exit 1
fi

# ── 7. Publish ─────────────────────────────────────────
bold "Publishing to npm"

if ! npm publish; then
  error "npm publish failed!"
  error "Commit and tag are still local. To retry:"
  error "  npm publish"
  error "  git push origin main && git push origin $GIT_TAG"
  exit 1
fi
info "Published v$NEW_VERSION to npm"

# Disable cleanup — package is live, commit+tag must stay
COMMIT_CREATED=false
GIT_TAG=""
ORIGINAL_VERSION=""

# Save tag for push (GIT_TAG is cleared to disable cleanup)
RELEASE_TAG="v$NEW_VERSION"

# ── 8. Push ─────────────────────────────────────────────
bold "Pushing to GitHub"

if ! git push origin main; then
  error "git push failed!"
  error "Package is already published. Push manually:"
  error "  git push origin main && git push origin $RELEASE_TAG"
  exit 1
fi

if ! git push origin "$RELEASE_TAG"; then
  error "git push --tags failed!"
  error "Push tag manually:"
  error "  git push origin $RELEASE_TAG"
  exit 1
fi

info "Pushed commit and tag to GitHub"

# ── Done ────────────────────────────────────────────────
echo ""
bold "Release v$NEW_VERSION complete!"
echo "  npm:  https://www.npmjs.com/package/autonota"
echo "  tag:  v$NEW_VERSION"
