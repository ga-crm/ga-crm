#!/usr/bin/env bash
# Runs on the VPS, as the deploy user (gacrm), from .github/workflows/deploy-staging.yml.
# Unpacks a release next to the previous ones, migrates, switches `current` to it and restarts the
# API; if the API does not answer its health check, `current` goes back to the previous release.
#
# Layout under /opt/ga-crm (written by deploy/setup-server.sh):
#   .env                       the only configuration; never in git
#   docker-compose.yml, infra/ PostgreSQL, Valkey, MinIO (refreshed from each release)
#   incoming/<sha>.tgz         archives uploaded by the workflow
#   releases/<sha>-<time>/     backend/, frontend/, deploy/, and a link to ../../.env
#   current -> releases/...    what systemd (API) and nginx (web app) serve
set -euo pipefail

SHA="${1:?usage: remote-deploy.sh <git sha>}"
APP_DIR="${APP_DIR:-/opt/ga-crm}"
KEEP_RELEASES=5

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nDEPLOY FAILED: %s\n' "$*" >&2; exit 1; }

[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || fail "not a git sha: $SHA"
ARCHIVE="$APP_DIR/incoming/$SHA.tgz"
# A new folder every time, so running the same commit again never touches the live one
RELEASE="$APP_DIR/releases/$SHA-$(date -u +%Y%m%d%H%M%S)"

cd "$APP_DIR"
# One deploy at a time, even when someone also runs it by hand
exec 9>"$APP_DIR/.deploy.lock"
flock -n 9 || fail "another deploy is running"

[[ -f "$ARCHIVE" ]] || fail "missing $ARCHIVE"
[[ -f .env ]] || fail "$APP_DIR/.env does not exist; run deploy/setup-server.sh first (deploy/README.md)"
# 640: gacrm writes it, the API user (group gacrm) reads it, nobody else
[[ "$(stat -c %a .env)" == 640 ]] || fail ".env must be mode 640: chmod 640 $APP_DIR/.env"
# The API refuses unsafe settings in production; checking here stops before anything changes
grep -qx 'NODE_ENV=production' .env || fail ".env must say NODE_ENV=production"
if grep -qE '^[A-Z0-9_]+=__GENERATE__$' .env; then
  fail ".env still has __GENERATE__ values; run node scripts/setup-env.mjs"
fi

env_value() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2-; }
API_PORT="$(env_value API_PORT)"
API_PORT="${API_PORT:-4200}"

# A deploy that stops half-way (any exit but success) leaves no release behind to take a slot
# among the kept ones; a release that `current` points at is never removed
cleanup_failed() {
  local status=$?
  if [[ $status -ne 0 && -d "$RELEASE" &&
    "$(readlink -f "$APP_DIR/current" 2>/dev/null)" != "$(readlink -f "$RELEASE")" ]]; then
    rm -rf "$RELEASE"
  fi
}
trap cleanup_failed EXIT

log "Unpacking $SHA"
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
rm -f "$ARCHIVE"
# The API reads the .env three folders above dist/config, which is the release folder
ln -sfn "$APP_DIR/.env" "$RELEASE/.env"

log "Refreshing the stack files"
cp "$RELEASE/stack/docker-compose.yml" "$RELEASE/stack/.env.example" "$APP_DIR/"
mkdir -p "$APP_DIR/scripts" "$APP_DIR/infra"
cp "$RELEASE/stack/scripts/setup-env.mjs" "$APP_DIR/scripts/"
cp -R "$RELEASE/stack/infra/." "$APP_DIR/infra/"

log "Installing API packages"
# --ignore-scripts: no package of the API needs an install script, and none gets to run one here
(cd "$RELEASE/backend" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)

log "Starting PostgreSQL, Valkey and MinIO"
docker compose --project-directory "$APP_DIR" --env-file "$APP_DIR/.env" up -d --wait postgres valkey minio

# Before the switch: a failed migration leaves the running release untouched.
# Migrations only add; a rollback below does not undo them.
log "Migrating the database"
(cd "$RELEASE/backend" && node dist/core/db/migrate.js)

PREVIOUS="$(readlink "$APP_DIR/current" 2>/dev/null || true)"

switch_to() {
  ln -sfn "$1" "$APP_DIR/current.next"
  mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"
  sudo /usr/bin/systemctl restart ga-crm-api
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS -m 3 "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}

log "Switching to $(basename "$RELEASE")"
switch_to "$RELEASE"
if ! healthy; then
  sudo /usr/bin/journalctl -u ga-crm-api -n 40 --no-pager || true
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    log "Health check failed; going back to $(basename "$PREVIOUS")"
    switch_to "$PREVIOUS"
    healthy || fail "the previous release does not answer either"
  fi
  fail "the API did not answer http://127.0.0.1:$API_PORT/api/v1/health"
fi

log "Cleaning up"
# Archives of deploys that stopped before unpacking
find "$APP_DIR/incoming" -name '*.tgz' -mtime +7 -delete
# Newest first; keep a few for a manual rollback, and never the live one
LIVE="$(readlink -f "$APP_DIR/current")"
ls -1dt "$APP_DIR"/releases/*/ | tail -n +"$((KEEP_RELEASES + 1))" | while read -r old; do
  [[ "$(readlink -f "$old")" == "$LIVE" ]] || rm -rf "$old"
done

log "Deployed $SHA"
