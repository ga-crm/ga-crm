#!/usr/bin/env bash
# Runs on the VPS, as the deploy user, from .github/workflows/deploy-staging.yml.
# Unpacks a release next to the previous ones, migrates, switches `current` to it and restarts the
# API; if the API does not answer its health check, `current` goes back to the previous release.
#
# Layout under /opt/ga-crm (deploy/README.md):
#   .env                 the only configuration, written once by hand; never in git
#   docker-compose.yml   PostgreSQL, Valkey, MinIO (refreshed from each release)
#   infra/               first-boot scripts of PostgreSQL
#   releases/<sha>/      backend/, frontend/, a link to ../../.env
#   current -> releases/<sha>   what systemd (API) and nginx (web app) serve
set -euo pipefail

SHA="${1:?usage: remote-deploy.sh <git sha>}"
APP_DIR="${APP_DIR:-/opt/ga-crm}"
ARCHIVE="$APP_DIR/incoming/$SHA.tgz"
RELEASE="$APP_DIR/releases/$SHA"
KEEP_RELEASES=5

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nDEPLOY FAILED: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR"
[[ -f "$ARCHIVE" ]] || fail "missing $ARCHIVE"

log "Unpacking $SHA"
rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
# The API reads the .env three folders above dist/config, which is the release folder
ln -sfn "$APP_DIR/.env" "$RELEASE/.env"

# First, so the very first deploy leaves .env.example and setup-env.mjs ready for step 4
log "Refreshing the stack files"
cp "$RELEASE/stack/docker-compose.yml" "$RELEASE/stack/.env.example" "$APP_DIR/"
mkdir -p "$APP_DIR/scripts" "$APP_DIR/infra"
cp "$RELEASE/stack/scripts/setup-env.mjs" "$APP_DIR/scripts/"
cp -R "$RELEASE/stack/infra/." "$APP_DIR/infra/"

[[ -f .env ]] || fail "$APP_DIR/.env does not exist yet; see deploy/README.md, step 4"
# The API refuses unsafe settings in production; checking here stops before anything changes
grep -qx 'NODE_ENV=production' .env || fail ".env must say NODE_ENV=production"
if grep -qE '^[A-Z0-9_]+=__GENERATE__$' .env; then
  fail ".env still has __GENERATE__ values; run node scripts/setup-env.mjs"
fi

env_value() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2-; }
API_PORT="$(env_value API_PORT)"
API_PORT="${API_PORT:-4200}"

log "Installing API packages"
(cd "$RELEASE/backend" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

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

log "Switching to $SHA"
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
rm -f "$ARCHIVE"
# Newest first; keep a few for a manual rollback (deploy/README.md)
ls -1dt "$APP_DIR"/releases/*/ | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf

log "Deployed $SHA"
