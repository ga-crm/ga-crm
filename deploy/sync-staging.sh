#!/usr/bin/env bash
# Builds the staging branch from a commit of main: only the paths in deploy/staging-paths.txt (as
# that commit lists them) go across. Used by .github/workflows/staging.yml and by hand:
#
#   npm run staging:sync -- --dry-run     what would change on staging, nothing is pushed
#   npm run staging:sync                  commit on staging and push it (no deploy; that is the workflow)
#
# It never touches the working tree or switches branch: the tree is put together in a temporary
# index, so it is safe while dev servers run from this checkout. staging is generated; a commit
# made on it by hand keeps its place in the history, but its content is replaced by the next sync.
set -euo pipefail

SOURCE=origin/main
REMOTE=origin
BRANCH=staging
LIST=deploy/staging-paths.txt
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="${2:?--source needs a commit or branch}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

fail() { printf 'SYNC FAILED: %s\n' "$*" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel)"
git fetch --quiet "$REMOTE" || fail "cannot fetch from $REMOTE"

SRC="$(git rev-parse --verify --quiet "$SOURCE^{commit}")" || fail "no such commit: $SOURCE"
PARENT="$(git rev-parse --verify --quiet "refs/remotes/$REMOTE/$BRANCH^{commit}" || true)"
echo "Source: $(git log -1 --format='%h %s' "$SRC")"

# The list of the source commit, not of the working tree: the same input gives the same staging
PATHS="$(git show "$SRC:$LIST" 2>/dev/null)" || fail "$LIST does not exist in $SOURCE"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export GIT_INDEX_FILE="$WORK/index"
git read-tree --empty

count=0
while IFS= read -r path; do
  path="${path%%#*}"
  path="$(printf '%s' "$path" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's:/*$::')"
  [[ -n "$path" ]] || continue
  [[ "$path" != /* && "$path" != *..* ]] || fail "$LIST: '$path' must be a path inside the repository"
  # A typo here would silently drop a folder from staging, so a path that matches nothing stops
  [[ -n "$(git ls-tree -r --name-only "$SRC" -- "$path" | head -n 1)" ]] ||
    fail "$LIST: '$path' does not exist in $SOURCE"
  git ls-tree -r -z "$SRC" -- "$path" | git update-index -z --index-info
  count=$((count + 1))
done <<<"$PATHS"
[[ $count -gt 0 ]] || fail "$LIST lists no path"

TREE="$(git write-tree)"
unset GIT_INDEX_FILE

output() { if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "$1" >>"$GITHUB_OUTPUT"; fi; }

if [[ -n "$PARENT" && "$(git rev-parse "$PARENT^{tree}")" == "$TREE" ]]; then
  echo "Nothing to sync: $BRANCH already holds these files ($(git rev-parse --short "$PARENT"))."
  output "sha=$PARENT"
  output "changed=false"
  exit 0
fi

echo "Changes on $BRANCH (A added, M changed, D removed):"
if [[ -n "$PARENT" ]]; then
  git diff-tree -r --name-status "$PARENT^{tree}" "$TREE" | sed 's/^/  /'
else
  echo "  new branch with $(git ls-tree -r --name-only "$TREE" | wc -l | tr -d ' ') files"
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "Dry run: nothing was committed or pushed."
  exit 0
fi

MESSAGE="Sync from main $(git rev-parse --short "$SRC"): $(git log -1 --format=%s "$SRC")

Source: $SRC
Paths: $LIST"
if [[ -n "$PARENT" ]]; then
  COMMIT="$(git commit-tree "$TREE" -p "$PARENT" -m "$MESSAGE")"
else
  COMMIT="$(git commit-tree "$TREE" -m "$MESSAGE")"
fi

# A plain push: it is refused if someone pushed to staging in the meantime, never forced
git push --quiet "$REMOTE" "$COMMIT:refs/heads/$BRANCH"
git fetch --quiet "$REMOTE" "$BRANCH"
# Keep a local staging branch in step, unless it is checked out or has commits of its own
if LOCAL="$(git rev-parse --verify --quiet "refs/heads/$BRANCH")" && [[ "$LOCAL" == "$PARENT" ]] &&
  ! git worktree list --porcelain | grep -qx "branch refs/heads/$BRANCH"; then
  git update-ref "refs/heads/$BRANCH" "$COMMIT" "$LOCAL"
fi

echo "Pushed $(git rev-parse --short "$COMMIT") to $REMOTE/$BRANCH."
output "sha=$COMMIT"
output "changed=true"
