#!/usr/bin/env bash
# The quick checks before code leaves this machine: types, lint and unit tests of both halves.
# Run by .githooks/pre-push (turn it on once with `npm run hooks:install`), or by hand:
#   npm run check
# The integration tests are not here: they need the local database and take minutes; CI runs them
# on every pull request and push to main.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
started=$(date +%s)

step() { printf '\n==> %s\n' "$*"; }

step "Backend: types"
npm --prefix backend run --silent typecheck
step "Backend: lint"
npm --prefix backend run --silent lint -- --quiet
step "Backend: unit tests"
npm --prefix backend test --silent -- --reporter=dot

step "Frontend: types"
# --force: an incremental cache has hidden type errors before (requirement/25)
(cd frontend && npx tsc -b --force)
step "Frontend: lint"
npm --prefix frontend run --silent lint
step "Frontend: tests"
npm --prefix frontend test --silent -- --reporter=dot

step "Rule index"
npm run --silent docs:rules:check

printf '\nAll checks passed in %ss.\n' "$(($(date +%s) - started))"
