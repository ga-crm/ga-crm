---
name: ga-crm-verify
description: How to run, test and verify the GA CRM app, including Docker PostgreSQL, migrations, Swagger, demo accounts and browser checks. Use whenever you need to start the app, run tests, reset data, confirm a change works, or debug why the server, database or sign-in fails in this repo (chạy app, chạy test, kiểm tra, lỗi cổng, lỗi đăng nhập, Swagger).
---

# GA CRM: run and verify

The API is `backend` (NestJS + TypeORM + PostgreSQL 18).

## Start

Database: `npm run db:up` from the repo root (PostgreSQL on port 5433, Valkey (the Redis fork) on 6380 and MinIO (S3 API, chat files) on 9100; waits for the healthy state). Tables: `npm run db:migrate`; `npm run seed` also migrates first. Servers: use `preview_start` with `api` then `frontend` from `.claude/launch.json`; the user runs `npm run dev:api` and `npm run dev:web` in two terminals.

Wait for the API instead of restarting it:

```bash
curl -s -m 80 --retry 25 --retry-connrefused --retry-delay 3 http://localhost:4200/api/v1/health
```

Addresses: API `http://localhost:4200/api/v1`, Swagger `/docs`, app `http://localhost:5173` (Vite proxies `/api` to 4200; `API_TARGET` overrides it). Port 3000 belongs to another project (`aiwany`) and 5432 to the user's own PostgreSQL, so leave both alone. If Docker Desktop stopped, tests fail with `ECONNREFUSED`: `open -a Docker`, wait for `docker info`, then `npm run db:up`.

## Checks to run before calling work done

Use absolute paths or `cd` in the same command, because the shell's working directory can drift between calls.

```bash
cd /Users/ray/Desktop/GA-CRM && npm test
cd /Users/ray/Desktop/GA-CRM/backend && npm run typecheck && npm run lint
cd /Users/ray/Desktop/GA-CRM/frontend && npx tsc -b --force && npm run lint && npx vite build
cd /Users/ray/Desktop/GA-CRM && npm run docs:rules
```

`npm test` runs the API's unit tests, its integration / e2e suites and the frontend tests. The integration suites drop and recreate `ga_crm_test` from the migrations (`test/support/database.ts` refuses any name not ending in `_test`), so they never touch dev data. They check stored rows through `test/support/collections.ts`, a small Mongo-like shim over SQL: a new table a suite reads needs a line in its `TABLES` map. The per-IP and per-user throttlers are off under `NODE_ENV=test`; sign-in counters and locks stay on. Use `--force` for the frontend type-check because incremental caches have hidden errors before (`requirement/25`), and delete any stray `*.tsbuildinfo` afterwards, except `backend/tsconfig.build.tsbuildinfo` while a watch runs.

A transaction is one connection: never run queries of one `TenantDb.run` in parallel with `Promise.all`; `pg` warns now and will refuse in version 9.

## Browser checks

Tests do not prove the UI works, so for any visible change look at it in the built-in browser at 1280 px and 375 px (`resize_window`), and reset the viewport afterwards.

- Use the throwaway pair `api-check` (port 4201, database `ga_crm_check`) and `web-api-check` (port 5174, `http://127.0.0.1:5174`), so the user's session and dev data stay untouched (`localhost` cookies are shared across ports). Create or refresh its data first; this drops only `ga_crm_check`:

  ```bash
  cd /Users/ray/Desktop/GA-CRM && PG_DB=ga_crm_check npm run seed:reset
  ```

  `api-check` writes chat files to its own bucket `ga-crm-check`, never `ga-crm`. Afterwards stop both previews and drop it: `docker exec ga-crm-postgres psql -U crm_owner -d postgres -c 'DROP DATABASE ga_crm_check WITH (FORCE)'`.
- Never run two `backend` watchers at once on the same build output; stop one preview before starting another API.
- With `DEV_ACCOUNT_SWITCHER=true` in `.env` (restart the API after changing it), the header and the sign-in page offer "Đổi tài khoản": pick any account of any GA, no password. Use it to move between roles instead of signing in again; tests force it off unless a suite sets it.
- Accounts: after `npm run seed`, every demo account signs in with `Demo@2026`: `platform@gacrm.local`, and `<role>@gaN.gacrm.local` (`head`, the one GA director with agent code `00N00001`, then `admin`, `bm`, `um`, `fc`, `fc2`, `fc3`, `fc4`, `um2`). N is one of five regional GAs: 1 `GA-HN` Hà Nội, 2 `GA-HCM` Hồ Chí Minh, 3 `GA-MT` Miền Trung, 4 `GA-MN` Miền Nam, 5 `GA-MB` Miền Bắc (`DEMO_TENANTS` in `backend/src/seed/demo-data.ts`). Tests compare GA 1 with GA 2 (TEN-7).
- The user also tries the app and may have changed dev data; demo accounts can be disabled or have extra roles. Check before assuming a bug, and do not revert their changes.
- After a layout change, measure rather than eyeball: `document.documentElement.scrollHeight - innerHeight` must be 0 from 768 px up, and a modal's `getBoundingClientRect().height` must match before and after submitting an empty form.
- After a UI change on a list, reload it with filters and a dialog open, and confirm the state returns.
- Sign-in is limited to 60 per minute per IP. Wrong passwords count 5 per minute per account and 50 per 15 minutes per IP, and 10 in a row from one IP lock that account and IP for 15-60 minutes. Read `Retry-After`; `npm run seed` clears `login_attempts`. Switch accounts with an in-page `fetch` to save attempts.
- Buttons that call outside services (AI key test, AI model list after a key is saved) send data to real providers: test those paths through the API with fakes, not by clicking.
- The session cookie is shared across ports on `localhost`, so signing in on Swagger replaces the app's session.
- In Swagger, set the request body with `form_input`; select-all and typing merges into the old text and produces a 400 `invalid_input` without `issues`.
- Realtime: the API logs `Socket for user <id>` at debug level for each admitted socket. To see an event cross Redis, run `docker exec ga-crm-valkey valkey-cli monitor` and look for `publish "socket.io#/#user:<id>#"`. Integration tests use bucket `ga-crm-test` on MinIO and Redis database 15 for presence (so Valkey must be up; the presence suite flushes that database) and the in-process Socket.IO adapter; `test/realtime.e2e-spec.ts` connects with `socket.io-client` after `app.listen(0)`.
- Expected console noise: 401 from `/me` while signed out, connection refused while the API is still starting.

## Reset dev data

`npm run seed:reset` drops the dev database `ga_crm`, recreates it from the migrations and seeds it; the roles stay. Everything the user entered is lost, so run it only when they say yes, and stop the preview servers first. Never use `docker compose down -v`: it deletes the Postgres and MinIO volumes, that is every piece of dev data and every uploaded file. Clean up after any test that changes dev data, and report what was left behind.
