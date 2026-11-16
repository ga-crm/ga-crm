---
name: ga-crm-context
description: Orient yourself in the GA CRM project and look up its requirements. Use at the start of any session on this repo, whenever the user says to continue, asks what is done or what is next (tiếp tục, làm tiếp, phiên trước, tiến độ, còn thiếu gì), asks about a business rule or rule ID such as LEAD-12, USER-6 or IMP-26, or asks where something is specified. Also use at the end of a session to update the handoff, roadmap and decisions.
---

# GA CRM: context and project records

## Start of a session

Read these in order and stop as soon as you have enough:

1. `docs/HANDOFF.md`: current state, next step, known traps.
2. `docs/ROADMAP.md`: what each release slice still needs.
   `docs/viec-con-lai.md` lists the work not done yet, in the order to do it.
3. `docs/decisions.md`: where the repo deliberately differs from the spec. It wins over the spec on those points, so check it before "fixing" something to match the spec.
4. `docs/open-questions.md`: decisions waiting on the Product Owner. Do not guess these; insurance rules in particular must not be invented.

## Looking up requirements

The spec in `requirement/` is v2.1: about 250 KB in 28 topic files (`00-thuat-ngu.md` to `28-thay-doi-so-voi-v2.0.md`), so avoid reading it whole. Spec 2.0 has been removed; `28-thay-doi-so-voi-v2.0.md` says what changed since it, and rule numbers from 2.0 are obsolete.

- By rule ID or domain: open `docs/requirements/rules/<PREFIX>.md`. It holds the verbatim rules with a source location and where the code cites them.
- By topic: `docs/requirements/INDEX.md` maps every section heading to `requirement/<file>:<line>`. Read just that range.
- Not covered by rule IDs (API tables, schemas, error codes, test scenarios): `requirement/16` has screens, `17` the API, `18` the data schema (written for MongoDB; the PostgreSQL tables are in `backend/src/migrations/`), `19` the import templates, `20` error codes, `22` NFRs, `23` the required tests and `26` open questions. Use the section map to find the lines.
- Before implementing, always read the original text. The index is a map, and "cited in code" does not mean a rule is complete.

`docs/requirements/` is generated, so never edit it by hand. After changing the spec or adding rule citations in code, run `npm run docs:rules`.

## End of a session

Records only help the next session if they stay true, so before finishing work that changed something:

- `docs/HANDOFF.md`: rewrite the current state and next step; add any new trap. It describes now, not a history.
- `docs/ROADMAP.md`: update the status of items you finished or started.
- `docs/viec-con-lai.md`: remove items you finished, add new ones in priority order.
- `docs/decisions.md`: add every new deviation from the spec, with its date and reason.
- `docs/open-questions.md`: add new questions; move answered ones into decisions.
- Run `npm run docs:rules`.
- `docs/` files read by the project owner are in Vietnamese; `CLAUDE.md`, skills and code comments are in English.
