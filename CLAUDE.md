# GA CRM v2 - Rules for AI agents

Start at `docs/HANDOFF.md`, and use the `ga-crm-*` skills in `.claude/skills/`. Read the relevant part of `requirement/` (spec v2.1, one file per topic) before changing behaviour; `docs/requirements/INDEX.md` maps it. Rule IDs (LEAD-12, USER-6...) are the business contract: cite them in code comments and test names. `docs/decisions.md` records where this repo deliberately differs from the spec; it wins over the spec on those points.

Non-negotiable:

1. Tenant isolation: every business table has `tenant_id` and a `FORCE` row-level security policy on `app_tenant()`, and code reaches it only through `TenantDb.run(scope, ...)`; cross-tenant paths use `PlatformDb.run(reason, ...)` with a named reason. Queries filter by the `Scope`; `CROSS_TENANT` is only for sign-in, invite lookup and audited platform reads. A record of another tenant returns 404. Tests must prove GA-1 cannot read GA-2.
2. Scope is derived on the server, never from client input.
3. Marketing sees Success data masked only. Line managers see lead phones masked only.
4. Audit every create, update, assign, import, export, client view and AI read, in the same transaction as the change. `meta` never holds secrets.
5. PDP: never store ID card numbers, bank account numbers or health data from Success imports. AI never receives real identities.
6. Natural keys are strings: client code, policy number, application number and agent code keep leading zeros.
7. All UI text lives in `frontend/src/i18n/vi.json`. Code, comments, skills, this file and commit messages are in English. Project records in `docs/` are in Vietnamese because the project owner reads them.
8. Errors leave the API as `{ error: <code>, issues?: [...] }`. Every code in `backend/src/common/errors.ts` needs a message in `vi.json`; a test enforces this.
9. Every route is private unless marked `@Public()`. Permissions are checked by the API even when the UI hides the action.
10. UI follows `requirement/desigin/desigin.md`: use the tokens in `frontend/src/index.css` and the components in `frontend/src/components/ui.tsx`, which are built on shadcn/ui (`frontend/src/components/shadcn`, Radix). Reach for a shadcn component before writing a widget by hand. Blue acts, bands separate sections, no shadows, no pills, no letter-spacing.

Way of working:

- Build vertical slices: schema, service, API, UI, tests. Do not start a new slice while tests fail.
- Ask the Product Owner when a business rule is unclear. Do not invent insurance rules.
- At the end of a session, update `docs/HANDOFF.md`, `docs/ROADMAP.md` and `docs/decisions.md`, then run `npm run docs:rules`.
- Code reaches `main` through a pull request from a branch; CI (`.github/workflows/ci.yml`) must be green. Run `npm run check` before pushing (the pre-push hook does it once `npm run hooks:install` has run). Never commit to `staging` or merge it into `main`: it is generated from `main` by "Promote to staging" (`deploy/README.md`).
- Commands: `npm run dev:api`, `npm run dev:web`, `npm test`, `npm --prefix backend run typecheck`, `npm --prefix backend run lint`, `npm --prefix frontend run lint`, `npm run seed`. Never run `npm run seed:reset` on someone's data without asking: it drops the database.
- `DEV_ACCOUNT_SWITCHER=true` in `.env` turns on the account switcher (header and sign-in page) for testing roles; the API refuses to start with it on in production and production builds never show it.
- The API is `backend` (NestJS, TypeORM 1.x, PostgreSQL 18; schema changes are hand-written SQL migrations, no Drizzle).
- The API is ESM: relative imports end in `.js`. Use `import type` for types in decorated signatures.
