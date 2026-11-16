# 02. Kiến trúc và công nghệ

## 2.1 Nguyên tắc
1. **Tách tenant ngay từ thiết kế**: mọi document nghiệp vụ có `tenantId`; mọi truy vấn đi qua một lớp truy cập dữ liệu tự thêm điều kiện tenant; thiếu `tenantId` là lỗi, bị test và runtime bắt.
2. **Scope do server tính, không bao giờ từ client**: phạm vi theo cây đại lý tính từ người dùng đăng nhập ở mỗi request.
3. **Một schema cho mỗi khái niệm, dùng chung client và server** (Zod).
4. **Việc nặng chạy nền**: nhập dữ liệu, xử lý tài liệu, embedding, snapshot báo cáo, tín hiệu định kỳ chạy bằng job.
5. **AI qua một gateway**: một service AI nội bộ nắm provider, khóa, định tuyến, ẩn danh, ngân sách, log. Code tính năng không gọi SDK mô hình trực tiếp.
6. **Mọi thứ có audit**: mọi thay đổi, phân công, nhập, xuất, lần xem dữ liệu nhạy cảm và lần AI đọc dữ liệu đều ghi sự kiện audit chỉ-ghi-thêm.
7. **Tiếng Việt trước, sẵn sàng dịch**: mọi chuỗi hiển thị nằm trong catalogue (vi mặc định, en sẵn sàng).

## 2.2 Stack
| Lớp | Lựa chọn | Ghi chú |
|---|---|---|
| Ngôn ngữ | TypeScript (strict) | Một monorepo |
| Monorepo | pnpm workspaces + Turborepo | `apps/web`, `apps/worker`, `packages/*` |
| Web app | Next.js (App Router, React 19, Server Components) | UI, BFF và REST API (`app/api/v1/**`) |
| UI | Tailwind CSS + shadcn/ui (Radix) với token DLVN | Mobile-first, PWA (manifest, service worker, web push) |
| Data fetching | TanStack Query | Server Components cho lần hiển thị đầu |
| Form | React Hook Form + Zod resolver | Lỗi hiển thị ngay dưới từng ô (xem 21.3) |
| Bảng | TanStack Table | Phân trang, sắp xếp, lọc phía server |
| Validation | Zod (`packages/schemas`) | Request, response, dòng nhập file, input tool AI |
| Database | MongoDB Atlas (replica set, có transaction) | Region theo quyết định lưu trú dữ liệu (**OPEN**, 22.6). Atlas Search + Atlas Vector Search |
| ODM | Mongoose + plugin tenant (hoặc driver gốc sau repository) | Repository là cửa duy nhất vào dữ liệu |
| Auth | Better Auth (adapter MongoDB): email + mật khẩu, chỉ qua lời mời, session trong MongoDB, TOTP MFA; OIDC SSO cho nhân sự DLVN | |
| Job / queue | BullMQ trên Redis (hoặc Inngest) | Nhập dữ liệu, xử lý tài liệu, embedding, thông báo, lịch định kỳ |
| Cache / rate limit | Redis | Cache scope, rate limit, idempotency key |
| Lưu file | S3 tương thích (AWS S3 / Cloudflare R2), presigned upload | File gốc (vòng đời 90 ngày), tài liệu kiến thức, file xuất |
| Excel | SheetJS (đọc ở trình duyệt; xuất ở server) | Cài từ tarball CDN của SheetJS |
| AI | LangChain JS + LangGraph JS | `@langchain/google-genai`, `@langchain/deepseek`, `@langchain/openai` (endpoint tương thích OpenAI, ví dụ Qwen). Embedding + Atlas Vector Search |
| Quan sát AI | Langfuse (tự host, vì PDP) hoặc LangSmith | Trace prompt đã ẩn danh, chi phí, đánh giá |
| Quan sát hệ thống | OpenTelemetry, Sentry, log JSON | Correlation id theo request và job |
| Kiểm thử | Vitest (unit, tích hợp với mongodb-memory-server), Playwright (E2E), contract test | Provider AI giả cho test |
| CI/CD | GitHub Actions; môi trường preview; migration có version | dev, staging, production |
| Hạ tầng | Vercel hoặc container (Docker) trên AWS / GCP; worker chạy riêng | Phải đáp ứng quyết định lưu trú dữ liệu |

## 2.3 Kiến trúc logic
```
Trình duyệt (PWA, React) ──HTTPS──> Next.js app (apps/web)
                                     ├─ Server Components (trang)
                                     ├─ /api/v1/** route handlers (REST, Zod)
                                     ├─ Auth (Better Auth)
                                     └─ Domain services (packages/domain) ──> Repositories (packages/db) ──> MongoDB Atlas
                                                       │                                                   ├─ Atlas Search
                                                       │                                                   └─ Atlas Vector Search
                                                       ├─> Queue (Redis/BullMQ) ──> Worker: nhập dữ liệu, xử lý tài liệu,
                                                       │                               embedding, thông báo, lịch định kỳ
                                                       ├─> Object storage (S3/R2)
                                                       └─> AI gateway (packages/ai, LangChain/LangGraph) ──> Gemini / DeepSeek / Qwen
```

## 2.4 Cấu trúc repo
```
apps/
  web/            Next.js: app/(auth), app/(app)/..., app/api/v1/...
  worker/         BullMQ worker và lịch định kỳ
packages/
  schemas/        Zod schema + type (request, response, enum, mẫu file nhập, mã lỗi)
  domain/         Service nghiệp vụ theo module (leads, clients, imports, reports, ai...) - thuần, dễ test
  db/             Mongoose model, plugin tenant, repository, index, migration
  auth/           Cấu hình Better Auth, session -> Actor, kiểm tra quyền
  ai/             AI gateway: provider, router, ẩn danh, tool, prompt, RAG, ngân sách
  i18n/           Catalogue (vi.json, en.json), định dạng ngày, tiền, tên
  ui/             Component design system (shadcn, token DLVN)
  import/         Định nghĩa mẫu file, parser ô, validator (dùng chung trình duyệt/server)
  test-utils/     Seed (2 GA demo, cây đầy đủ), provider AI giả, factory
docs/             Đặc tả, ADR, runbook
```

## 2.5 Pipeline mỗi request API
1. Xác thực session → không có / hết hạn: `401 unauthenticated`.
2. Nạp **Actor** từ database (không chỉ từ token): người dùng, tenant, trạng thái, vai trò, mã đại lý, quyền (hợp các quyền của vai trò). Người dùng bị khóa / lưu trữ hoặc tenant bị tạm ngưng → `401`.
3. Dựng **Scope** (`tenantId`, `reach`, `agentCode`, `visibleAgentCodes` (cache), `permissions`, `crossTenant`).
4. Validate input bằng Zod → `400 invalid_input` kèm `issues[]` (mỗi issue có `path` và `code`, để giao diện hiện lỗi đúng ô).
5. Kiểm tra quyền của endpoint → `403 forbidden`.
6. Chạy domain service với Scope; repository thêm điều kiện tenant và điều kiện cây đại lý.
7. Ghi audit cùng transaction với thay đổi.
8. Trả JSON. Lỗi dạng `{ "error": "<code>", "issues"?: [...] }`; client đổi mã lỗi sang tiếng Việt (file 20).

## 2.6 Biến môi trường tối thiểu
`MONGODB_URI`, `REDIS_URL`, `APP_URL`, `AUTH_SECRET`, `AI_KEYS_SECRET` (mã hóa khóa AI của GA; độc lập với `AUTH_SECRET`), `S3_*`, `SENTRY_DSN`, `LANGFUSE_*`, khóa AI dự phòng của nền tảng `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `QWEN_API_KEY` (tùy chọn), `TURNSTILE_SECRET` (form công khai), `EMAIL_*` (email giao dịch, **NEW**), `VAPID_*` (web push, **NEW**).
