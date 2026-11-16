---
name: ga-crm-feature
description: Recipe for building a feature or vertical slice in GA CRM across NestJS, PostgreSQL (TypeORM) and React, including tenant isolation with row-level security, migrations, audit, permissions, error codes, Swagger and tests. Use whenever the user asks to add or change a module, endpoint, table or business rule in this repo (for example agent tree, leads, clients, imports, reports, MFA, thêm tính năng, làm module, xây API), even if they only mention one layer.
---

# GA CRM: building a feature

Build one vertical slice at a time: schema, service, API, UI, tests. Do not start a new slice while tests fail. Use the `ga-crm-context` skill to find the rules first, and read the original spec text for them.

## API

Modules live in `backend/src/modules/<name>/`; `campaigns`, `work` and `reports` are recent examples to copy. The API is ESM: relative imports end in `.js`, and types used in decorated signatures need `import type`.

**Schema.** Every change is a hand-written SQL migration class in `src/migrations/`, registered in order in `migrations/index.ts` (no Drizzle, no schema sync). A business table has `tenant_id`, starts its indexes with it (TEN-4) and gets forced row-level security, because that is what makes a forgotten tenant filter return nothing instead of leaking data (TEN-1, TEN-2):

```sql
CREATE TABLE things (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id  uuid NOT NULL REFERENCES tenants (id),
  code       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX things_code_key ON things (tenant_id, code);
ALTER TABLE things ENABLE ROW LEVEL SECURITY;
ALTER TABLE things FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON things
  USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON things TO crm_app, crm_platform;
```

Natural keys from DLVN are `text` and keep leading zeros (DATA-1). A table without `tenant_id` needs a reason in the exempt list of the TEN-2 test in `test/auth.e2e-spec.ts`, and forced RLS with no policy so only `crm_platform` reaches it. Add an entity to `core/db/entities.ts` only when the repository API helps; raw SQL through `rowsOf` is fine. Run `npm run db:migrate` for the dev database.

**Service.** Take a `Scope`, never a tenant from the client, and do all reads and writes of one operation in one `TenantDb.run`, which opens a transaction pinned to the tenant:

```ts
async get(actor: Actor, id: string) {
  const scope = this.scopeOf(actor);
  if (!isId(id)) throw notFound();
  return this.tenantDb.run(scope, async (db) => {
    const [thing] = await rowsOf<Thing>(db, `SELECT ... FROM things WHERE tenant_id = $1 AND id = $2`, [scope.tenantId, id]);
    if (!thing) throw notFound(); // TEN-3: another tenant's record looks missing, so 404 rather than 403
    return thing;
  });
}
```

- Still filter by `tenant_id` in SQL: RLS is the safety net, the filter keeps plans good. Escape search input with `escapeLike` and use `ILIKE ... ESCAPE`. Compose optional conditions with `sql` / `and` from `core/persistence/fragment.ts`.
- Pass the `db` of the transaction to every service you call (`outer` parameters), and never run its queries in parallel: one transaction is one connection.
- `rowsOf` also handles `UPDATE/DELETE ... RETURNING`. `date` columns come back as `Date` from raw SQL (cast `::text` for `YYYY-MM-DD`), `bigint` as strings (convert with `Number`).
- Paginate as `page` / `pageSize` (default 25, max 50) by extending `PageQueryDto`, returning `{ items, page, pageSize, total }`. Validate ids with `isId` or `IdPipe` (UUID v7; `newId()` creates one in code).
- `PlatformDb.run(reason, ...)` is reserved for sign-in, invite and token lookups, the scheduler and audited platform reads (TEN-6). A new reason goes in its `CrossTenantReason` list with a comment.
- Calls to outside services happen after the transaction closes.

**Writes and audit.** Audit in the same transaction as the change (AUD-3), and never put secrets in `meta` (AUD-4):

```ts
try {
  return await this.tenantDb.run(scope, async (db) => {
    const [thing] = await rowsOf<{ id: string }>(db, `INSERT INTO things (tenant_id, code) VALUES ($1, $2) RETURNING id`, [scope.tenantId, dto.code]);
    await this.audit.record({ tenantId: scope.tenantId, userId: actor.id, action: AuditAction.Create, entity: 'thing', entityId: thing.id }, db);
    return thing;
  });
} catch (error) {
  return mapDuplicateKey(error); // Add the unique index to UNIQUE_ERRORS when it has its own error code
}
```

Lock a row you read and then change with `FOR UPDATE`, so two requests cannot both act on the same state.

**Realtime.** To tell browsers about a committed change, queue it inside the transaction: `afterCommit(db, () => this.realtime.toUsers(userIds, RealtimeEvent.X))` (`core/persistence/after-commit.ts`, `modules/realtime`). It runs only after the commit and is dropped on rollback. Payloads carry ids only; the browser reads the data through REST, so masking stays in one place. A new event goes in `RealtimeEvent` and gets a listener in `frontend/src/lib/realtime.ts`. Files go through `ObjectStorage` (`core/storage`), keyed `t/<tenantId>/...`; never call S3 inside a transaction (upload, then insert the row; remove the object if the insert fails), stream downloads through the API after a permission check, and decide the type from the bytes (`chat/chat-files.ts`), never from the name. Chat lives in `modules/chat`: post a SYSTEM message through `ChatService` for membership changes, never write `messages` directly, and keep chat out of per-message audit (decisions.md 14/11/2026). Presence (who is online, daily active users) lives in `modules/presence` on Redis bitmaps indexed by `users.member_no`; read it through `PresenceService` / `ActivityService`, never by new keys of your own. Global REST guards skip non-HTTP contexts, so a gateway message handler checks what it needs itself. A change that ends access (sign-out, disabling, suspending) calls `realtime.recheckUsers` / `recheckTenant` the same way, so open sockets close at once.

**Passwords.** Any path that sets a password calls `assertStrongPassword`, and looks up its token first, before the expensive hash. Secrets stored at rest go through `common/secret-box.ts`.

**Errors.** Throw `ApiException(status, ErrorCode.X)`. A new code goes in `backend/src/common/errors.ts` and needs a message in `frontend/src/i18n/vi.json`; a test fails otherwise. Take the code and wording from `requirement/20-ma-loi.md`.

**Controller.** Keep handlers thin. Routes are private unless marked `@Public()`.

```ts
@ApiTags('Things')
@ApiCookieAuth(SESSION_COOKIE)
@RequirePermissions(Permission.ThingsManage) // or @RequireRoles(Role.GaHead)
@Controller('things')
```

Paths and payloads follow `requirement/17-api.md`. New permissions go in `common/rbac.ts` with their defaults (PERM-2) and in `vi.json`, and existing tenants need a migration for them. Every DTO property needs `@ApiProperty` so Swagger stays usable, and class-validator decorators, because `forbidNonWhitelisted` rejects anything undeclared. Register the module in `app.module.ts`.

**Comments.** Cite the rule next to the check, in English: `// LEAD-14: interest locked once final`. This is also what feeds the rule index.

## Frontend

Follow the `ga-crm-ui` skill. Use TanStack Query for data and React Hook Form with Zod for forms. Every query key and request belongs in `lib/queries.ts` and passes the `signal`; screens call `useQuery(queries.x(params))`, invalidate through `keys`, and lists add `usePrefetchNextPage` and `useListSearch`. A sign-in or sign-out goes through `setSessionUser`, so one person's data never stays in the cache for the next. All text goes in `vi.json`. Hide what the user cannot do with `lib/nav.ts` and `Allow`, knowing that the API is what actually enforces it (PERM-4).

## Imports

Every import runs through `modules/imports`: the browser parses the file (`lib/spreadsheet.ts`) and sends only template columns. To add a sheet, add its columns to `templates.ts` (this also generates the downloadable template, IMP-11), add its cell parsing, and write a pure plan function like `agent-plan.ts`. Validation and commit both run that function, so the preview cannot drift from what is written. Offer both ways in: a form and a file with a template. Test the plan with unit tests and the flow with `test/imports.e2e-spec.ts`.

## Tests

Add e2e cases to `backend/test/`, named with the rule ID: `startApp()` builds a fresh `ga_crm_test` from the migrations (pass a function to replace providers, such as a fake outside client), then `seedDemoData` adds 2 GAs with a full hierarchy; `stopApp` in `afterAll`. Unit-test pure rule files next to them (`*.spec.ts`). Cover the required scenarios in `requirement/23-kiem-thu.md`, and always include a case proving GA-1 gets 404 for GA-2's records (TEN-7). Use the `ga-crm-verify` skill to run everything.

## Finish

Update the records as described in `ga-crm-context`.
