# 27. Xây và bảo trì bằng AI coding agent

## 27.1 File quy tắc của repo (đặt `CLAUDE.md` / `AGENTS.md` ở gốc repo, viết tiếng Anh)
```markdown
# GA CRM v2.1 - rules for AI agents
Read docs/spec (this spec, one file per topic) before any change. Rule ids (LEAD-14, CUS-6, IMP-26...) are the contract; cite them in code comments and tests.

Non-negotiable:
1. Tenant isolation: every business document has tenantId; use repositories (packages/db) only. A test must prove GA-1 cannot read GA-2.
2. Hierarchy scope comes from the server (Scope), never from client input. "Visible" and "owned" are different (clients: visibleAgentCodes vs ownerAgentCodes).
3. Marketing sees Success data masked only. Managers of the line see lead phones masked.
4. Audit every change, assignment, import, export, client view and AI data read, in the same transaction.
5. PDP: never store ID numbers or bank details; no health data from Success imports; AI never receives identities.
6. Keys are strings and keep leading zeros: client code exactly 10 digits (also when typed by hand), policy no 9 digits, application no 4-20, agent code digits.
7. Never hard-delete a record other records reference (users, agents, list values, programs, campaigns with leads): disable / archive / hide. Disabling or archiving a user deletes their sessions and sign-in credentials.
8. GA-owned fields (client phone, insured name/dob/gender and term on program rows) are never written by imports.
9. UI text in packages/i18n (Vietnamese); code, comments, docs, commits in English. Validation errors are shown under the field.
10. Shared Zod schemas in packages/schemas for every request, response and import row.
11. AI calls only through packages/ai; never hard-code model ids in UI.

Working style:
- Vertical slices (schema, service, API, UI, tests). Do not start a new slice with failing tests.
- Update the spec (rules, API, schema) in the same PR as a behaviour change.
- Commands: pnpm dev | pnpm test | pnpm test:e2e | pnpm typecheck (clean, no incremental cache) | pnpm lint | pnpm db:migrate | pnpm seed
- Ask the product owner when a business rule is unclear. Do not invent insurance rules.
```

## 27.2 Quy ước giúp AI bảo trì dễ
- **Mã quy tắc trong code**: `// LEAD-14: interest locked for agents once final` cạnh chỗ kiểm tra; tên test chứa mã.
- **Mỗi domain một module cùng hình dạng**: `schemas.ts` (Zod), `service.ts` (logic nghiệp vụ thuần nhận Scope), `repository.ts`, `routes.ts` (handler mỏng), `ui/` (màn hình), `*.test.ts`.
- **Mã lỗi** là hằng trong `packages/schemas/errors.ts`; catalogue i18n phải có thông báo cho mọi mã (có test kiểm tra).
- **Fixture**: một seed với 2 GA và cây đầy đủ, Danh mục mặc định, 3 chương trình; factory cho lead, khách (gồm khách nhập tay), hợp đồng; file Excel mẫu; provider AI giả ghi lại request (để kiểm tra ẩn danh).
- **ADR** trong `docs/adr/` cho quyết định (ví dụ "lưu sẵn visibleAgentCodes / ownerAgentCodes", "không xóa cứng người dùng", "truy xuất lai", "BullMQ").
- **Nhật ký quyết định của chủ sản phẩm** trong `docs/decisions.md` kèm ngày (file 28 là điểm khởi đầu).
- **File bàn giao** `docs/HANDOFF.md` cập nhật cuối mỗi phiên làm việc: trạng thái, đã xây gì, việc mở, bẫy.
- **PR nhỏ** có test; CI chạy type-check sạch, lint, unit, tích hợp, E2E smoke, test lộ PII của AI.
- **Prompt là code**: system prompt trong `packages/ai/prompts/*.ts`, có version, được bộ hồi quy AI bao phủ; hướng dẫn của GA là dữ liệu.

## 27.3 Gợi ý những prompt đầu tiên cho dự án mới
1. "Set up the monorepo per docs/spec/02 with Next.js, MongoDB (Mongoose + tenant plugin), Better Auth, Zod schemas, i18n (vi), Vitest and Playwright. Add the schema-guard test (TEN-2) and the seed (2 GAs, full hierarchy, default lead options and programs)."
2. "Implement files 04 (roles, permissions) and 06 (users, invitations, disable / archive without hard delete) with API 17.4 and tests 6-11 of file 23."
3. "Implement the agent tree (file 07) and the 01_Agents import (files 12, 19) with tests 12 and 28-29."
4. "Implement file 05 Danh mục (lead options, programs) with API 17.5 and tests 13-18."
5. "Implement leads (files 08-09) with API 17.7, screens 16.3-16.5 and tests 19-27, 32."
6. "Implement customers (file 10): client 360, manual clients and policies (10-digit client code), client ownership and assignment, with API 17.8 and tests 34-45."
7. Tiếp tục theo thứ tự slice ở file 01, mục 1.7.
