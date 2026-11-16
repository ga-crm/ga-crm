# 17. Bộ API

## 17.1 Quy ước
- Đường dẫn gốc `/api/v1`. JSON vào / ra, trừ tải file (presigned URL) và stream AI (Server-Sent Events).
- Xác thực: cookie session (Better Auth). Mọi endpoint cần đăng nhập trừ khi ghi **public**. Request thay đổi dữ liệu cần origin hợp lệ (CSRF) và nhận header `Idempotency-Key` tùy chọn (lưu 24 giờ trong Redis) **NEW**.
- Lỗi: HTTP status + `{ "error": "<code>", "issues"?: [{ "path": "a.b", "code": "too_small", "message": "..." }], ...thêm }`. Mã lỗi ở file 20. `400 invalid_input` cho lỗi Zod; `issues[].code` để giao diện hiện lỗi dưới đúng ô.
- Phân trang: `?page=1&pageSize=25` (tối đa 50 trừ khi ghi khác) → `{ items, page, pageSize, total }`.
- Ngày: ngày lịch `YYYY-MM-DD`; thời điểm ISO 8601 có múi giờ khi gửi, UTC `Z` khi trả.
- Mọi response lọc theo tenant và scope. "Quyền" = quyền cần (ngoài đăng nhập); "Scope" = quy tắc dữ liệu áp dụng.
- Rate limit (theo người dùng trừ khi ghi khác): mặc định 600 req/phút; đăng nhập 10/phút theo IP + 5/phút theo tài khoản; form công khai 5/phút theo IP và 3/ngày theo số điện thoại; tin nhắn AI 20/phút.
- Tài liệu OpenAPI 3.1 sinh từ Zod (`zod-to-openapi`) tại `/api/v1/openapi.json` (cần đăng nhập).

## 17.2 Xác thực và người dùng hiện tại
| Method | Path | Quyền | Body / query | Response | Lỗi |
|---|---|---|---|---|---|
| POST | `/auth/sign-in/email` | public | `{email, password}` | cookie session | `invalid_credentials` (401), 429 |
| POST | `/auth/sign-out` | - | - | 204 | |
| POST | `/auth/mfa/verify` **NEW** | - | `{code}` | 204 | `invalid_code` |
| POST | `/auth/password/forgot` **NEW** | public | `{email}` | 204 (luôn) | |
| POST | `/auth/password/reset` **NEW** | public | `{token, password}` | 204 | `invite_invalid` |
| GET | `/me` | - | - | `{ user:{id,email,name,agentCode}, tenant:{id,gaCode,name}|null, roles[], permissions[], reach, settings }` | |
| PATCH | `/me` **NEW** | - | `{name?, notificationPrefs?}` | 204 | |
| GET | `/invites/{token}` | public | - | `{ email, name, tenantName }` | `invite_invalid` (404) |
| POST | `/invites/accept` | public | `{token, password}` (8-128) | cookie session | `invite_invalid` |

## 17.3 Nền tảng (chỉ Platform Admin; mọi lần đọc tenant có audit)
| Method | Path | Body / query | Response | Ghi chú / lỗi |
|---|---|---|---|---|
| GET | `/platform/tenants` | page, q | trang `{id, gaCode, name, status, plan, users, lastActivityAt, aiTokensThisMonth}` | |
| POST | `/platform/tenants` | `{gaCode, name, head:{email, name, agentCode?}}` | `{tenant, head, inviteUrl}` 201 | `ga_code_taken`, `email_taken`; tạo quyền mặc định, cài đặt, Danh mục lead, 3 chương trình, trợ lý AI mặc định |
| PATCH | `/platform/tenants/{id}` **NEW** | `{name?, status?, plan?, limits?}` | 204 | tạm ngưng / kích hoạt |
| GET | `/platform/tenants/{id}/users` | page, q | trang người dùng | `CROSS_TENANT_READ` |
| POST | `/platform/tenants/{id}/users/{userId}/invite` | - | `{inviteUrl}` | `not_invited` |
| GET / POST | `/platform/products` | `{rows: ProductRow[]}` (1-500) | danh sách / `{saved}` | upsert theo productCode, audit |
| CRUD | `/platform/knowledge-bases` **NEW** | | | kho kiến thức toàn DLVN |
| GET/PUT | `/platform/ai-prices` **NEW** | | | giá / 1 triệu token theo provider / mô hình |

## 17.4 Người dùng, phân quyền, cài đặt
| Method | Path | Quyền | Body / query | Response | Lỗi |
|---|---|---|---|---|---|
| GET | `/users` | users.manage | page, q, role?, status? (mặc định không gồm ARCHIVED) | trang `{id, email, name, agentCode, agentName, inTree, status, lastLoginAt, roles[]}` | |
| GET | `/users/{id}` | users.manage | | người dùng | 404 |
| POST | `/users/invite` | users.manage | `{email, name, roles[], agentCode?}` | `{user, inviteUrl}` 201 | `email_taken`, `agent_code_taken`, `agent_code_required`, `forbidden` |
| POST | `/users/{id}/invite` | users.manage | | `{inviteUrl}` | `not_invited`, `forbidden` |
| PATCH | `/users/{id}` | users.manage | `{name?, email?, roles?, agentCode?}` | người dùng | `email_taken`, `agent_code_required`, `agent_code_taken`, `forbidden` |
| POST | `/users/{id}/disable` | users.manage | | 204 (xóa session + thông tin đăng nhập) | `invite_pending`, `cannot_disable_self`, `last_ga_head`, `forbidden` |
| POST | `/users/{id}/archive` | users.manage | `{reason?}` | 204 (xóa session + thông tin đăng nhập, giải phóng mã đại lý) | như trên |
| POST | `/users/{id}/reactivate` | users.manage | | `{inviteUrl}` (về INVITED) | `forbidden`, `agent_code_taken` |
| DELETE | `/users/{id}` | users.manage | (chỉ thu hồi lời mời, USER-14) | 204 | `not_invited`, `user_has_history`, `forbidden` |
| GET | `/permissions` | GA_HEAD | | `{ grants: {ROLE: Permission[]}, catalog }` | |
| PUT | `/permissions` | GA_HEAD | `{ grants: {ADMIN:[], MARKETING:[], GAD:[], BM:[], UM:[], FC:[]} }` | 204 | audit `PERMISSION_CHANGE` |
| GET/PUT | `/settings` **NEW** | GA_HEAD (GET phần cần thiết cho mọi người) | cài đặt tenant (5.2) + `version` | cài đặt | `stale_settings`, audit |
| GET | `/audit` **NEW** | audit.view | page, userId?, action?, entity?, from?, to? | trang sự kiện | |

## 17.5 Danh mục [Cooked]
| Method | Path | Quyền | Body | Response | Lỗi |
|---|---|---|---|---|---|
| GET | `/lead-options` | mọi người trong GA | | `{items:[{id, kind, code, label, isOpportunity, isFinal, active, sortOrder, builtIn}]}` | |
| POST | `/lead-options` | GA_HEAD | `{kind: interest|care_status|source, label (1-60), isOpportunity?, isFinal?}` | dòng 201 | `option_exists`, `invalid_input` |
| PATCH | `/lead-options/{id}` | GA_HEAD | `{label?, isOpportunity?, isFinal?, active?, sortOrder?}` | dòng | `option_exists` |
| DELETE | `/lead-options/{id}` | GA_HEAD | | 204 | `option_built_in`, `option_in_use` |
| GET | `/programs` | mọi người trong GA | | `{items:[{id, code, label, productRole, productCode, active, sortOrder}]}` | |
| POST | `/programs` | GA_HEAD / catalog.manage | `{label, productRole: Chính|Bổ trợ, productCode?}` | dòng 201 | `program_exists`, `invalid_input` |
| PATCH | `/programs/{id}` | GA_HEAD / catalog.manage | `{label?, productRole?, productCode?, active?, sortOrder?}` | dòng | `program_exists` |
| DELETE | `/programs/{id}` | GA_HEAD / catalog.manage | | 204 | `program_in_use` |

## 17.6 Đại lý
| Method | Path | Quyền | Body / query | Response | Lỗi |
|---|---|---|---|---|---|
| GET | `/agents` | - (scope AGT-6) | page, q | trang `{agentCode, name, rank, managerCode, managerName, status}` | |
| GET | `/agents/tree` | - (scope) | | `{items: [{agentCode, name, rank, managerCode, ancestors, depth, status, userId?}]}` | |
| GET | `/agents/{code}` | - (scope) | | đại lý (+ ngày sinh / số điện thoại cho Chủ GA / Admin) | 404 |
| PATCH | `/agents/{code}/manager` | agents.edit_tree | `{managerCode: string|null}` | đại lý | `manager_not_found`, `manager_cycle`; audit |

## 17.7 Lead
| Method | Path | Quyền / scope | Body / query | Response | Lỗi |
|---|---|---|---|---|---|
| GET | `/leads` | scope LEAD-6 | page, q, interest (mã|NONE), care (mã|NONE), stage?, source, campaignId, assignee (mã|NONE), origin?, from, to, overdue=1, isNew=1, newComment=1, sort? | trang LeadRow `{id, fullName, phone (che theo PDP-3), source, phoneSource, region, leadDate, stage, interest, careStatus, assignedAgentCode, agentName, campaignId, campaignName, assignedAt, firstContactAt, lastContactAt, nextActionAt, consentMarketing, isNew, origin, newComment, overdue}` | tìm theo số bị bỏ qua nếu không có leads.manage |
| GET | `/leads/counts` | scope | | `{all, mine, unassigned, overdue, isNew, newComment}` | |
| GET | `/leads/facets` | scope | | `{sources[], campaigns[{id,name}], agents[{code,name}]}` | |
| GET | `/leads/assignees` | leads.manage | q? | `{items: [{agentCode, name, openLeads}]}` | |
| POST | `/leads` | đại lý hoặc leads.manage | `{fullName, phone, source, consent, email?, region?, province?, gender?, dob?, campaignId?, note?, assignedAgentCode?}` | `{id}` 201 | `invalid_phone`, `phone_exists` (409, + leadId nếu thấy), `agent_not_found`, `campaign_not_found`, `forbidden` |
| GET | `/leads/{id}` | scope | | `{lead, assignee, campaign, notes[], contacts[], tasks[], comments[], history[], handovers[{agentCode, name, from, to|null, days, contacts}], linkedClient?, userNames{}, agentNames{}, canWork, canManage, interestLocked}` (đánh dấu đã xem với người được giao) | 404 |
| PATCH | `/leads/{id}` | làm việc (LEAD-7) | `{fullName?, phone?, dob?, region?, province?, email?, consent?, interest?, careStatus?, lostReason?, nextActionAt?, applicationNo?, policyNo?, stage? (NEW), source?*, campaignId?*}` (*leads.manage) | `{id, stage, interest, careStatus}` | `lead_not_yours`, `interest_locked`, `unknown_option`, `lost_reason_required`, `won_needs_numbers`, `invalid_phone`, `phone_exists`, `campaign_not_found`, `forbidden` |
| POST | `/leads/assign` | leads.manage | `{leadIds[1..200], agentCode|null}` | `{assigned}` | `agent_not_found`, `own_lead_locked` (409), 404 |
| POST | `/leads/{id}/activities` | làm việc | `{type: CALL|ZALO|MEETING, note, outcome?, occurredAt?}` | `{id}` 201 | `lead_not_yours` |
| POST | `/leads/{id}/notes` | làm việc | `{body}` (1-4000) | `{id}` 201 | `lead_not_yours` |
| PATCH/DELETE | `/leads/{id}/notes/{noteId}` **NEW** | tác giả, ≤ 24 giờ | `{body}` | 204 | `forbidden` |
| POST | `/leads/{id}/tasks` | làm việc | `{title, dueAt}` | `{id}` 201 | |
| PATCH | `/leads/{id}/tasks/{taskId}` | làm việc | `{title?, dueAt?, done?}` | `{id}` | 404 |
| POST | `/leads/{id}/comments` | scope (thấy lead) | `{body}` (1-2000) | `{id}` 201 | |
| GET | `/leads/{id}/link-suggestions` **NEW** | làm việc | q? | `{items: [{clientCode, name, score, reasons[], policies[], applications[]}]}` | |
| POST | `/leads/{id}/link` **NEW** | làm việc | `{clientCode, applicationNo?}` | 204 | `client_already_linked`, 404 |
| DELETE | `/leads/{id}/link` **NEW** | làm việc | `{reason}` | 204 | |
| DELETE | `/leads/{id}` **NEW** | leads.manage | `{reason, mode: SOFT|PDP}` | 204 | audit |
| POST | `/leads/merge` **NEW** | leads.manage | `{keepId, mergeId}` | 204 | |

## 17.8 Khách hàng và hợp đồng
| Method | Path | Quyền / scope | Body / query | Response | Lỗi |
|---|---|---|---|---|---|
| GET | `/clients` | scope CUS-5 | page, q (tên / mã / SĐT), tier, signal (due|debt|maturity|birthday|lapsed), agents (danh sách mã, mỗi mã trong scope, tối đa 200; lọc theo **sở hữu**) | trang `{clientCode, name, phone, tier, ageBand, gender, activePolicies, nextDue, agentNames, manual, due, debt, maturity, birthday, lapsed}` | |
| GET | `/clients/counts` | scope | agents? | `{all, due, debt, maturity, birthday, lapsed}` (0 khi không có) | |
| GET | `/clients/search` | scope | q | `{items: [{clientCode, name, ageBand, gender}]}` (tối đa 10) | |
| POST | `/clients` [Cooked] | reach ≠ NONE | `{clientCode (10 số), name, phone?, tier?, dob?, ageBand?, gender?: Nam|Nữ, maritalStatus?, loyaltyPoints?, usesDconnect?, dconnectLastLoginAt?, ekycRegistered?, ekycRegisteredAt?, idUpdated?, agentCode?, policies?: Policy[] (≤ 10)}` | `{clientCode}` 201 | `invalid_input`, `client_exists` (409, + clientCode nếu đã thấy), `agent_required`, `agent_not_found`, `invalid_phone`, `policy_exists`, `unknown_program`, `program_repeated`, `forbidden` |
| POST | `/clients/assign` [Cooked] | GA_HEAD / clients.assign | `{clientCodes[1..200] (10 số), agentCode|null}` | `{assigned}` | `agent_not_found`, 404 |
| GET | `/clients/{code}` | scope | | `{client, policies[{...policy, roles[], agents[{agentCode,name,splitPercent,isServicing}], products[{...,category,group, insuredName, insuredDob, insuredGender, termYears}]}], coverage, family[CLIENT|MEMBER], applications[], notes[], activities[], history[], signals[], linkedLead?, userNames{}, clientNames{}, canEdit, manual}`; ghi VIEW_CLIENT | 404 |
| PATCH | `/clients/{code}` [Cooked] | sở hữu (CUS-6) | các trường của POST trừ `clientCode`, `agentCode`, `policies`; vắng = giữ, `null` = xóa | khách | `client_not_yours`, `invalid_phone`, `invalid_input` |
| POST | `/clients/{code}/policies` [Cooked] | sở hữu | Policy `{policyNo (9 số), status, effectiveDate, maturityDate, premiumFrequency, basePremiumVnd, premiumDueDate?, plannedPremiumVnd?, unpaidPremiumVnd?, aplDebtVnd?, hasBeneficiary?, insuredClientCode?, insuredName?, agentCode?, products?: [{insuredName?, insuredDob?, insuredGender?, programCode, sumAssuredVnd?, termYears?, status?, annualPremiumVnd?, productRole, startDate?}] (≤ 20)}` | `{policyNo}` 201 | `policy_exists`, `unknown_program`, `program_repeated`, `agent_required`, `agent_not_found`, `client_not_yours`, 404 |
| PATCH | `/clients/{code}/policies/{policyNo}` [Cooked] | sở hữu | Policy trừ `policyNo`, `agentCode` (thay toàn bộ products) | 204 | như trên, 404 (không phải hợp đồng của khách này) |
| POST | `/clients/{code}/family` | sở hữu | `{relation, note?, relatedClientCode}` hoặc `{relation, note?, fullName, gender?, birthDay?, birthMonth?, birthYear?}` | `{id}` 201 | `client_not_yours`, `same_client`, `already_client`, 404 |
| PATCH | `/clients/{code}/family/{id}` | sở hữu | `{relation?, note?, fullName?, gender?, birthDay?, birthMonth?, birthYear?}` | 204 | |
| DELETE | `/clients/{code}/family/{id}` | sở hữu | | 204 | |
| POST | `/clients/{code}/family/{id}/lead` | sở hữu | `{leadId}` hoặc **NEW** `{create:{phone, consent}}` | 204 / `{leadId}` | 404 |
| POST | `/clients/{code}/notes` | sở hữu | `{body}` | `{id}` 201 | `client_not_yours` |
| POST | `/clients/{code}/activities` | sở hữu | `{type: CALL|ZALO|MEETING, note, outcome?, occurredAt?}` | `{id}` 201 | |
| POST | `/clients/{code}/tasks` **NEW** | sở hữu | `{title, dueAt, signal?}` | `{id}` 201 | |
| POST | `/clients/{code}/comments` **NEW** | scope | `{body}` | `{id}` 201 | |
| GET | `/portfolio/*` **NEW** | MARKETING / GA_HEAD | view đã che (PDP-4) | tổng hợp, đã che | |

## 17.9 Chiến dịch và form công khai **NEW**
| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/campaigns` | mọi người thấy lead | kèm số lead |
| POST / PATCH | `/campaigns`, `/campaigns/{id}` | campaigns.manage | CMP-1; không xóa chiến dịch có lead (kết thúc) |
| GET | `/campaigns/{id}/stats` | scope | CMP-3 |
| POST | `/campaigns/{id}/members` | campaigns.manage | `{leadIds[], status}` |
| PATCH | `/campaigns/{id}/members/{leadId}` | campaigns.manage / người được giao | `{status}`; ATTENDED ghi liên hệ SEMINAR |
| GET | `/public/forms/{slug}` | public | định nghĩa form (tên GA, chiến dịch, trường, nội dung đồng ý) |
| POST | `/public/forms/{slug}` | public, Turnstile | `{fullName, phone, consent:true, email?, province?, need?, turnstileToken}` → 201 `{ok}` (không tiết lộ trùng) |

## 17.10 Nhập dữ liệu
| Method | Path | Quyền | Body | Response | Lỗi |
|---|---|---|---|---|---|
| GET | `/imports` | imports.upload (của mình) / imports.view_all | page | trang lần nhập | |
| POST | `/imports` | imports.upload (13_Leads: leads.import) | `{fileName, snapshotDate, kind: SUCCESS|LEADS, sheets:[{name, headers[]}], mapping? (lead: ghép cột + ghép đại lý)}` | `{id, plan, uploadUrl?}` | |
| POST | `/imports/{id}/rows` | chủ lần nhập | `{sheet, rows:[{r, c:[ô...]}]}` (≤ 500 dòng, ≤ 40 ô, ô = chuỗi ≤ 2000 | số | null) | `{staged, rejected}` | `import_not_open`, `sheet_not_ready` |
| PUT | `/imports/{id}/file` | chủ lần nhập | (xác nhận đã tải lên) | 204 | bỏ qua khi có cột cấm |
| POST | `/imports/{id}/validate` | chủ lần nhập | | `{sheetCounts, errorsTotal}` | `import_not_open` |
| POST | `/imports/{id}/commit` | chủ lần nhập | | `{sheetCounts}` (hoặc `{jobId}` với file lớn) | `import_not_validated` |
| GET | `/imports/{id}` | chủ / view_all | | lần nhập kèm số liệu từng sheet | 404 |
| GET | `/imports/{id}/errors` | chủ / view_all | page (≤ 500), sheet? | trang `{sheet, row, column, code, recordKey, messageVi, severity}` | |
| GET | `/imports/{id}/rejected` | chủ / view_all | page, sheet? | bản ghi bị từ chối gom theo dòng | |
| GET | `/imports/{id}/report.xlsx` **NEW** | chủ / view_all | | báo cáo lỗi Excel | |
| GET | `/imports/templates/{kind}.xlsx` | imports.upload | | file mẫu | |

## 17.11 Báo cáo và xuất
| Method | Path | Quyền / scope | Query | Response |
|---|---|---|---|---|
| GET | `/reports/conversion` (R1) | scope | from, to | `{items:[{agentCode, agentName, managerName, total, contacted, timedContacts, contactedIn24h, overdue, byInterest{mã: n}, caring, won, dropped}], interests: LeadOption[]}` |
| GET | `/reports/activities` (R2) | scope (leads.manage → tenant) | from, to | `{from, to, items:[{agentCode, name, managerName, counts{CALL,ZALO,MEETING,SEMINAR,PROPOSAL,SOCIAL_POST,CHECKIN,COACHING,OTHER}, total, fromCrm, fromSuccess, won}]}` |
| GET | `/reports/funnel` (R3) **NEW** | scope / reports.view_all | from, to, groupBy=source|campaign|phoneSource | dòng theo giai đoạn, tỉ lệ, chi phí |
| GET | `/reports/activity-targets` (R4) **NEW** | scope | period | dòng |
| GET | `/reports/pipeline` (R5) **NEW** | scope | | dòng đội × giai đoạn, APE dự kiến |
| GET | `/reports/production` (R6) **NEW** | scope | period | dòng |
| GET | `/reports/care` (R7) **NEW** | scope | | dòng |
| GET | `/reports/handovers` (R8) **NEW** | scope | from, to | dòng |
| POST | `/exports` **NEW** | exports.data | `{type, filters}` | `{jobId}`; GET `/exports/{jobId}` → `{status, url?}` (link ký, 15 phút) |

## 17.12 Việc cần làm, lịch, thông báo **NEW**
| Method | Path | Ghi chú |
|---|---|---|
| GET | `/tasks` | của tôi (quản lý: của đội): `status`, `dueFrom`, `dueTo`, `leadId?`, `clientCode?` |
| POST / PATCH | `/tasks`, `/tasks/{id}` | việc cá nhân và việc của khách hàng |
| GET | `/today` | dữ liệu TASK-5 |
| GET | `/calendar.ics?token=` | feed ICS riêng |
| GET | `/notifications` | page, unreadOnly |
| POST | `/notifications/read` | `{ids[] | all:true}` |
| POST | `/push/subscriptions` | đăng ký web push |

## 17.13 AI
| Method | Path | Quyền | Body / query | Response | Lỗi |
|---|---|---|---|---|---|
| GET | `/ai/agents` | ai.use | context? | `{enabled, items:[{id, kind, name, description, contexts[], quickPrompts[]}]}` (tạo mặc định ở lần gọi đầu) | |
| GET | `/ai/conversations` | ai.use (của mình) | context?, ref? | `{items:[{id, agentId, context, contextRef, title, updatedAt}]}` (30 mới nhất) | |
| POST | `/ai/conversations` | ai.use | `{agentId, context, contextRef?, coach?:{scenario, difficulty, persona?, product?, custom?, leadId?}}` | `{id}` 201 | `ai_agent_unavailable`, `invalid_input`, 404 |
| GET | `/ai/conversations/{id}` | chủ | | `{conversation, names{token: tên}, messages[...]}` | 404 |
| DELETE | `/ai/conversations/{id}` | chủ | | 204 | |
| POST | `/ai/conversations/{id}/messages` | chủ | `{text (1-4000), task?}` | `text/event-stream`: `meta {task, tier, provider, model, routedBy, sources[]}`, `delta {text}`, `tool {name}`, `done {id, names{}, usage}`, hoặc `error {error}` | trước stream: `ai_disabled` (403), `ai_budget_exceeded` (429), `ai_agent_unavailable`, `ai_practice_finished` (409); trong stream: `ai_provider_missing`, `ai_key_invalid`, `ai_model_unavailable`, `ai_rate_limited`, `ai_provider_error` |
| POST | `/ai/conversations/{id}/score` | chủ (COACH) | | `{score}` | `ai_practice_too_short`, `ai_bad_output` (502) |
| GET / PUT | `/ai/admin/settings` | ai.manage | `{enabled, tiers{FAST,BALANCED,DEEP:{provider,model}}, router, embedding?, monthlyTokenLimit}` | kèm `usedThisMonth`, `providers:[{provider, label, ready, keySource, last4, keyUpdatedAt, keyUnreadable, models[]}]` | audit |
| PUT / DELETE | `/ai/admin/keys/{provider}` | ai.manage | `{apiKey}` (8-500) | `{ok, last4}` / 204 | audit (chỉ last4) |
| GET | `/ai/admin/keys/{provider}/models` | ai.manage | | `{items: string[]}` | `ai_provider_missing`, `ai_key_invalid` |
| POST | `/ai/admin/keys/{provider}/test` | ai.manage | | `{ok, model}` | `ai_key_invalid`, `ai_model_unavailable`, `ai_rate_limited`, `ai_provider_error` |
| GET / POST / PATCH / DELETE | `/ai/admin/agents[/{id}]` | ai.manage | `{kind, name, description?, enabled, instructions, contexts[], models{}, taskTiers{}, kbIds[], config{crmData, tools, quickPrompts[]}, sortOrder?}` | | audit |
| GET / POST / PATCH / DELETE | `/ai/admin/kbs[/{id}]` | ai.manage | `{name, description?, category, enabled}` | | xóa kho xóa tài liệu, đoạn, liên kết |
| GET / POST | `/ai/admin/kbs/{id}/documents` | ai.manage | `{title, productCode?, sourceName?, text}` (≤ 400k ký tự) hoặc **NEW** `{fileKey}` | `{id, chunks}` / `{id, status: PROCESSING}` | |
| PATCH / DELETE | `/ai/admin/documents/{id}` | ai.manage | `{title, productCode?}` | 204 | |
| GET | `/ai/admin/search` | ai.manage | q | `{items:[{id, title, kb, category, heading, body, productCode}]}` | |
| GET | `/ai/admin/usage` | ai.manage | month (YYYY-MM, giờ VN, nửa mở) | `{month, byUser[], byAgent[], byModel[], byTask[]}` mỗi dòng `{key, name?, inputTokens, outputTokens, answers, cost? (NEW)}` | |

## 17.14 Webhook và tích hợp (sau này) **NEW**
- Webhook ra theo tenant (lead.created, lead.assigned, lead.won, client.assigned, import.committed) ký HMAC, thử lại có backoff.
- API nhận lead cho nền tảng quảng cáo (API key theo tenant, phạm vi `leads:create`), cùng quy tắc như form công khai.
