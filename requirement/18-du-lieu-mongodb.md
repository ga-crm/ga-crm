# 18. Schema dữ liệu (MongoDB)

## 18.1 Nguyên tắc mô hình hóa
- **Một database, collection dùng chung, `tenantId` trên mọi document nghiệp vụ** (TEN-1). Mọi index phức hợp bắt đầu bằng `tenantId`.
- **Nhúng những gì đọc cùng nhau và có giới hạn** (dòng sản phẩm và phần chia đại lý trong hợp đồng; vai trò trong người dùng; liên kết đại lý trong khách hàng); **tham chiếu những gì tăng không giới hạn** (ghi chú, lịch sử, góp ý, việc, tin nhắn, audit).
- **Lưu sẵn khóa scope** để mỗi truy vấn có scope là một `$in` có index:
  - `leads.assignedAgentCode` (chủ sở hữu);
  - `policies.currentAgentCodes[]` (đại lý có liên kết hiện hành);
  - `clients.visibleAgentCodes[]` = đại lý của mọi `agentLinks` (mọi nguồn) → dùng cho **thấy**;
  - `clients.ownerAgentCodes[]` = đại lý của `agentLinks` có nguồn cho sở hữu (mọi nguồn trừ `CLIENTS_SHEET_SCOPE`) → dùng cho **sở hữu** và "Khách hàng của" [Cooked].
  - Cả hai được tính lại bởi service `recomputeClientScope(clientCodes)` sau nhập file, nhập tay, phân công, liên kết / hủy liên kết lead, giao lại lead.
  - Điều kiện scope = `{ <trường>: { $in: scope.visibleAgentCodes } }` với `visibleAgentCodes` = mã của mình + tuyến dưới (từ `agents.ancestors`, cache Redis theo tenant + đại lý, xóa cache khi cây đổi). Reach TENANT = không lọc theo chủ sở hữu.
- **Khóa tự nhiên là chuỗi** với unique index trong tenant. `_id` của document CRM: ObjectId.
- **Thời điểm**: `createdAt`, `updatedAt` (Date, UTC); ngày lịch dạng `"YYYY-MM-DD"`.
- **Validation**: Zod ở biên API + `$jsonSchema` của MongoDB trên collection quan trọng (leads, clients, policies, users, auditEvents). `clientCode` validator `^\d{10}$` [QĐ 11/2026].
- **Transaction**: ghi nhiều document phải nguyên tử (phân công + lịch sử + việc + audit; thêm khách + hợp đồng; ghi nhập file theo sheet) dùng transaction MongoDB.
- **Không xóa cứng bản ghi đang được tham chiếu** (DATA-8): người dùng, đại lý, giá trị danh mục, chương trình, chiến dịch có lead dùng trạng thái / cờ `active`.
- **Migration**: script có version (`packages/db/migrations/NNNN_name.ts`) ghi vào `_migrations`; index khai báo trong code và đồng bộ khi deploy.

Ký hiệu: `trường: Kiểu` (`?` tùy chọn, `[]` mảng). Index: `U` = unique.

## 18.2 Nền tảng và định danh
**tenants**
```
_id, gaCode: string (U, viết hoa), name, status: "active"|"suspended", plan, limits: {maxUsers, aiTokensPerMonth, storageMb}, logoKey?, createdAt, updatedAt
```
**tenantSettings** (một mỗi tenant)
```
tenantId (U), version: number, grants: { ADMIN: Permission[], MARKETING: [], GAD: [], BM: [], UM: [], FC: [] },
lists: { lostReasons: ListItem[], needs: [], phoneSources: [], regions: [], campaignTypes: [] },   // ListItem = {code, labelVi, sort, active}
leadRules: { contactDeadlineHours: 48, contactedInTimeHours: 24, managersMayReassign: false, consentForTelesales: true, autoAssign?: {...} },
notifications: { quietHours: {from:"21:00", to:"07:30"}, digest: boolean }, updatedBy, updatedAt
```
**leadOptions** (Danh mục lead) [Cooked]
```
_id, tenantId, kind: "interest"|"care_status"|"source", code, label, isOpportunity: boolean, isFinal: boolean, active: boolean, sortOrder, builtIn: boolean, createdAt
Index: U {tenantId, kind, code}
```
**insurancePrograms** (Danh mục chương trình bảo hiểm) [Cooked]
```
_id, tenantId, code, label, productRole: "Chính"|"Bổ trợ", productCode?, active: boolean, sortOrder, createdAt
Index: U {tenantId, code}
```
**users** (user của Better Auth, mở rộng)
```
_id, tenantId?: ObjectId (null = Platform Admin), email (U, chữ thường), name, emailVerified, image?,
roles: Role[], agentCode?: string, status: "INVITED"|"ACTIVE"|"DISABLED"|"ARCHIVED", archivedAt?, archivedBy?, archiveReason?,
lastLoginAt?, mfaEnabled, notificationPrefs?, createdAt, updatedAt
Index: U {email}; U {tenantId, agentCode} (partial: agentCode tồn tại và status ≠ ARCHIVED); {tenantId, status}
```
**sessions, accounts, verifications, twoFactors**: collection của Better Auth (`accounts.password` = hash). Khi khóa / lưu trữ: xóa session, account (mật khẩu, SSO), twoFactor, pushSubscriptions của người dùng (USER-10).
**invitations**: `_id, tenantId, userId, tokenHash (U), expiresAt, acceptedAt?, createdBy, createdAt`.

## 18.3 Cây đại lý
**agents**
```
_id, tenantId, agentCode, name, nameNorm, rank: "SUM"|"BM"|"UM"|"SA"|"FC", managerCode?, ancestors: string[] (gốc..quản lý trực tiếp), depth,
status: "Đang hoạt động"|"Ngưng hoạt động", gender?, dob?, phone?, startDate?, endDate?, officeCode?, managerFixed: boolean, updatedByImportId?, lastSeenAt?, createdAt, updatedAt
Index: U {tenantId, agentCode}; {tenantId, ancestors}; {tenantId, managerCode}; {tenantId, nameNorm}
```

## 18.4 Lead và dữ liệu CRM
**campaigns**
```
_id, tenantId, name (U trong tenant), type, channel?, startDate?, endDate?, budgetVnd?, ownerUserId?, status: PLANNED|ACTIVE|ENDED, notes?, eventAt?, location?,
publicForm?: {slug (U toàn hệ thống), enabled, fields[], consentText, autoAssign?}, createdAt, updatedAt
```
**campaignMembers**: `tenantId, campaignId, leadId, status: INVITED|REGISTERED|ATTENDED|NO_SHOW, updatedBy, updatedAt` — U {tenantId, campaignId, leadId}.

**leads**
```
_id, tenantId, externalId?, fullName, nameNorm, phone (0xxxxxxxxx), email?, gender?, dob?, age?, ageBand?, province?, region?, need?,
source (mã trong leadOptions.source), phoneSource?, campaignId?, leadDate: "YYYY-MM-DD", registeredAt?, productInterest?, productSecondary?, valueVnd?, refLink?, extraInfo?,
stage: LeadStage, interest?: string (mã trong leadOptions.interest), careStatus?: string (mã trong leadOptions.care_status), lostReason?, progressNote?, messageStatus?,
origin: "GA"|"IMPORT"|"FC_OWN"|"PUBLIC_FORM"|"REFERRAL",
assignedAgentCode?, assignedBy?, assignedAt?, assigneeSeenAt?, assigneeViewedAt?, lastCommentAt?, lastCommentBy?,
firstContactAt?, lastContactAt?, nextActionAt?, consentMarketing: boolean, consentAt?, consentSource?: "CRM_FORM"|"IMPORT"|"PUBLIC_FORM",
clientCode?, applicationNo?, policyNo?, linkStatus: "NONE"|"CONFIRMED", linkedBy?, linkedAt?, referredByClientCode?,
createdBy, createdAt, updatedAt /* thời điểm đổi DỮ LIỆU gần nhất: điều khiển quy tắc nhập file lead; góp ý không chạm */, lastImportId?, deletedAt?, deletedBy?
Index: U {tenantId, phone}; {tenantId, assignedAgentCode, careStatus}; {tenantId, leadDate}; {tenantId, assignedAt}; {tenantId, campaignId}; {tenantId, nameNorm};
       {tenantId, clientCode} (partial, U khi linkStatus=CONFIRMED); Atlas Search trên fullName
```
**leadHistory**: `_id, tenantId, leadId, field: stage|interest|careStatus|assignee|fullName|phone|dob|region|province|email|consent|applicationNo|policyNo|source|campaign|link, oldValue?, newValue?, note?, importId?, changedBy, changedAt` — {tenantId, leadId, changedAt}; {tenantId, field, newValue, changedAt}. "Lịch sử phụ trách" (LEAD-28) tính từ các dòng `assignee` + `interactions`.

**interactions** (ghi chú và liên hệ; lead và khách hàng)
```
_id, tenantId, agentCode?, leadId?, clientCode?, type: "NOTE"|"CALL"|"ZALO"|"MEETING"|"SEMINAR", outcome?, note, occurredAt, source: "APP"|"IMPORT"|"FORM",
attachments?: [{key, name, size, mime}], editedAt?, createdBy, createdAt
Bất biến: có leadId hoặc clientCode.
Index: {tenantId, leadId, occurredAt}; {tenantId, clientCode, occurredAt}; {tenantId, agentCode, type, occurredAt}
```
**comments**: `_id, tenantId, leadId?, clientCode?, authorUserId, body, mentions?: userId[], createdAt` — {tenantId, leadId, createdAt}.
**tasks**: `_id, tenantId, leadId?, clientCode?, agentCode?, title, dueAt, status: OPEN|DONE|CANCELLED, source: APP|AUTO_ASSIGN|NEXT_ACTION|SIGNAL, doneAt?, doneBy?, createdBy, createdAt` — {tenantId, leadId}; {tenantId, agentCode, status, dueAt}.
**familyLinks**
```
_id, tenantId, clientCode, relatedClientCode?, fullName?, birthDay?, birthMonth?, birthYear?, gender?, relation: SPOUSE|CHILD|PARENT|SIBLING|OTHER, note?, leadId?, createdBy, createdAt, updatedAt
Index: {tenantId, clientCode}; {tenantId, relatedClientCode}; U {tenantId, clientCode, relatedClientCode} (partial)
```

## 18.5 Dữ liệu khách hàng và Success
**clients**
```
_id, tenantId, clientCode (đúng 10 chữ số), name, nameNorm,
phone?  /* trường GA tự quản lý, nhập file không ghi / xóa */,
tier?, activePolicies?, lapsedPolicies?, dob?, gender?, maritalStatus?, loyaltyPoints?, usesDconnect?, dconnectLastLoginAt?, idUpdated?, ekycRegistered?, ekycRegisteredAt?,
birthDayMonth?: "dd/mm", birthMonth?: number (suy ra), ageBand?,
agentLinks: [{agentCode, source: POLICY_HOLDER|POLICY_INSURED|APPLICATION|CLIENTS_SHEET|CLIENTS_SHEET_SCOPE|MANUAL|LEAD_LINK, createdAt}]  /* tối đa một MANUAL */,
visibleAgentCodes: string[], ownerAgentCodes: string[] (18.1),
origin: "IMPORT"|"MANUAL", createdBy?, lastImportId?, lastSeenAt?, createdAt, updatedAt
Index: U {tenantId, clientCode}; {tenantId, visibleAgentCodes}; {tenantId, ownerAgentCodes}; {tenantId, nameNorm}; {tenantId, phone}; {tenantId, birthMonth}; {tenantId, tier}
```
**policies**
```
_id, tenantId, policyNo (9 chữ số), holderClientCode, insuredClientCode?, servicingAgentCode?, holderName, holderNameNorm, insuredName, insuredNameNorm,
status, effectiveDate, maturityDate, premiumFrequency, premiumDueDate?, plannedPremiumVnd?, basePremiumVnd, unpaidPremiumVnd?, aplDebtVnd?, hasBeneficiary?,
agents: [{agentCode, splitPercent?, isServicing, startedAt, endedAt?, lastImportId?, lastSeenAt?}], currentAgentCodes: string[],
clients: [{clientCode, role: PO|LI|BEN, source: POLICY|PRODUCT, endedAt?, lastImportId?}],
products: [{productCode, insuredCode: string ("" = LI chính / người chỉ có tên), productName?, productRole: "Chính"|"Bổ trợ", sumAssuredVnd?, annualPremiumVnd?, plan?, startDate?, status?,
            insuredName?, insuredDob?, insuredGender?, termYears?  /* 4 trường GA tự quản lý */, programCode?, lastImportId?}],
origin: "IMPORT"|"MANUAL", createdBy?, lastImportId?, lastSeenAt?, createdAt, updatedAt
Bất biến: không trùng (productCode, insuredCode) trong products.
Index: U {tenantId, policyNo}; {tenantId, currentAgentCodes}; {tenantId, "clients.clientCode"}; {tenantId, "products.productCode"}; {tenantId, premiumDueDate}; {tenantId, maturityDate}
```
**applications**: `_id, tenantId, applicationNo, policyNo?, agentCode, clientCode?, holderName, holderNameNorm, createdDate, receivedDate?, status, issuedDate?, productCode?, apeVnd?, lastImportId?, lastSeenAt?` — U {tenantId, applicationNo}; {tenantId, agentCode, createdDate}; {tenantId, clientCode}.
**successActivities**: `_id, tenantId, activityId, agentCode, leaderCode?, officeCode?, programCode?, programMonth?, activityType, subActivityTitle?, recordMode?, startedAt, endedAt?, durationSeconds?, status, customerId?, customerName?, customerPhone?, activityMethod?, callType?, callOutcome?, callPhoneHash?, contentNote?, locationName?, activityDate, phoneKey?, lastImportId?, lastSeenAt?` — U {tenantId, activityId}; {tenantId, agentCode, activityDate}.
**productionMonthly**, **activityMovements**, **activityTargets**, **agentMonthly** — cột theo từ điển dữ liệu của mẫu (**OPEN**, IMP-33).
**products** (toàn DLVN, không có tenantId): `_id, productCode (U), productName, productRole?, category?, minEntryAge?, maxEntryAge?, maxCoverAge?, gender?, waitingPeriod?, keyBenefits?, fitRule?, triggerEvent?, ruleStatus? ("DRAFT"|"APPROVED"), updatedBy, updatedAt`.
**recordChanges**: `_id, tenantId, entity: agent|client|policy|policy_product|application, entityKey, field, oldValue?, newValue?, importId?, changedBy, changedAt` — {tenantId, entity, entityKey, changedAt}. Thay đổi bằng tay trên khách / hợp đồng (MAN-6, POL-4) cũng ghi vào đây với `importId` trống **NEW**.

## 18.6 Nhập dữ liệu
**imports**: `_id, tenantId, userId, agentCode?, kind: SUCCESS|LEADS, fileKey?, fileName, snapshotDate, status, sheetCounts, mapping?, createdAt, committedAt?` — {tenantId, userId, createdAt}; {tenantId, createdAt}.
**importErrors**: `_id, importId, tenantId, sheet, row, column?, code, recordKey?, messageVi, severity: error|warning` — {tenantId, importId, sheet, row}.
**importRows** (vùng đệm, xóa khi ghi; TTL 7 ngày): `_id, importId, tenantId, sheet, rowNo, key, owner?, data, status: OK|REJECTED`.

## 18.7 Audit, thông báo, job
**auditEvents** (chỉ ghi thêm): `_id, tenantId?, userId?, action, entity, entityId?, meta?, ip?, userAgent?, at, prevHash?, hash` — {tenantId, at}; {tenantId, entity, entityId, at}; {tenantId, userId, at}.
**notifications**: `_id, tenantId, userId, type, title, body, link, readAt?, createdAt` (TTL 180 ngày). **pushSubscriptions**: `_id, tenantId, userId, endpoint (U), keys, userAgent, createdAt`. **exportJobs** (TTL). **dsrRequests**: `_id, tenantId, subjectType: lead|client, subjectRef, type: DELETE|EXPORT, status, requestedBy, handledBy?, createdAt, closedAt?`. **dailyAgentStats** (tùy chọn): U {tenantId, agentCode, day}.

## 18.8 AI
**aiSettings**: `tenantId (U), enabled, tiers{FAST,BALANCED,DEEP:{provider,model}}, router{provider,model}, embedding?{provider,model,dims}, monthlyTokenLimit, updatedBy?, updatedAt`.
**aiProviderKeys**: `tenantId, provider, encryptedKey ("iv.ciphertext", AES-256-GCM, AAD = tenantId:provider), last4, updatedBy, updatedAt` — U {tenantId, provider}. Không API nào trả.
**aiAgents**: `_id, tenantId, kind: CUSTOM|ASSISTANT|OPS|COACH, name, description?, enabled, instructions, contexts[], models{tier?}, taskTiers{task?}, config{crmData, tools, quickPrompts[{label,text}]}, kbIds[], sortOrder, createdBy?, createdAt, updatedAt`.
**aiKnowledgeBases**: `_id, tenantId? (null = toàn DLVN), name, description?, category, enabled, createdBy, createdAt, updatedAt`; **tenantKbSubscriptions** `{tenantId, kbId}`.
**aiDocuments**: `_id, tenantId?, kbId, title, productCode?, sourceName?, fileKey?, status: PROCESSING|READY|FAILED, error?, chars, chunks, createdBy, createdAt`.
**aiChunks**: `_id, tenantId?, kbId, documentId, seq, heading?, body, productCode?, embedding: number[], embeddingModel` — {tenantId, documentId}; Atlas Vector Search (lọc tenantId, kbId); Atlas Search trên heading, body (analyzer tiếng Việt bỏ dấu).
**aiConversations**: `_id, tenantId, userId, agentId, context, contextRef?, title, pseudonyms{token:{type, ref, name}}, coach?, score?, createdAt, updatedAt` — {tenantId, userId, updatedAt}.
**aiMessages**: `_id, tenantId, conversationId?, userId, agentId, role, content, task?, provider?, model?, inputTokens, outputTokens, sources?, createdAt` — {tenantId, conversationId, createdAt}; {tenantId, createdAt}.
**aiPrices** (toàn hệ thống): `{provider, model, inputPer1M, outputPer1M, currency, updatedAt}`.

## 18.9 Enum (một nguồn duy nhất trong `packages/schemas`)
| Enum | Giá trị |
|---|---|
| Role | FC, UM, BM, GAD, GA_HEAD, MARKETING, ADMIN, PLATFORM_ADMIN |
| AgentRank | SUM, BM, UM, SA, FC |
| UserStatus | INVITED, ACTIVE, DISABLED, ARCHIVED |
| LeadStage | NEW, CONTACTED, APPOINTMENT, MET, PROPOSAL, SUBMITTED, ISSUED, LOST |
| LeadInterest (hệ thống) | NOT_REACHED, UNDETERMINED, NOT_INTERESTED, LIFE, HEALTH_CARD (+ giá trị GA thêm trong leadOptions) |
| LeadCareStatus (hệ thống) | CARING, WON, DROPPED, NOT_INTERESTED (+ giá trị GA thêm, chỉ là nhãn) |
| LeadOptionKind | interest, care_status, source |
| LeadOrigin | GA, IMPORT, FC_OWN, PUBLIC_FORM, REFERRAL |
| InteractionType | NOTE, CALL, ZALO, MEETING, SEMINAR (liên hệ: CALL, ZALO, MEETING) |
| TaskStatus / TaskSource | OPEN, DONE, CANCELLED / APP, AUTO_ASSIGN, NEXT_ACTION, SIGNAL |
| ClientAgentLinkSource | POLICY_HOLDER, POLICY_INSURED, APPLICATION, CLIENTS_SHEET, CLIENTS_SHEET_SCOPE, MANUAL, LEAD_LINK |
| RecordOrigin | IMPORT, MANUAL |
| FamilyRelation | SPOUSE, CHILD, PARENT, SIBLING, OTHER (ngược CHILD↔PARENT) |
| PolicyRole | PO, LI, BEN |
| ProductRole | Chính, Bổ trợ |
| Gender (nhập tay) | Nam, Nữ |
| CoverageGroup | LIFE, HEALTH, CI, ACCIDENT, MATERNITY, OTHER (lỗ hổng: HEALTH, CI, ACCIDENT) |
| ClientSignal (danh sách) | due, debt, maturity, birthday, lapsed |
| CareSignal (chi tiết) | PREMIUM_DUE, UNPAID, APL, MATURITY, NOT_ACTIVE, LAPSED, BIRTHDAY, GAP, FAMILY_UNCOVERED, NO_DCONNECT |
| CampaignType | ADS, SEMINAR, TELESALES, REFERRAL, SOCIAL_ZALO, EVENT, OTHER |
| SuccessActivityType | CHECKIN, CALL, SOCIAL_POST, MEETING, COACHING, OTHER, PROPOSAL |
| ActionKind (cột R2) | CALL, ZALO, MEETING, SEMINAR, PROPOSAL, SOCIAL_POST, CHECKIN, COACHING, OTHER |
| ImportStatus / SheetStatus | PARSING, VALIDATED, COMMITTED, FAILED / READY, BLOCKED, LATER |
| AuditAction | LOGIN, LOGOUT, LOGIN_FAILED, CREATE, UPDATE, DELETE, ARCHIVE, ASSIGN, LINK, UNLINK, IMPORT, EXPORT, VIEW_CLIENT, CROSS_TENANT_READ, AI_READ, PERMISSION_CHANGE, SETTINGS_CHANGE, DSR |
| AiProvider | GEMINI, DEEPSEEK, QWEN (registry, mở rộng được) |
| AiTier / TaskClass | FAST, BALANCED, DEEP / CHAT, LOOKUP, KNOWLEDGE, ANALYSIS, PLANNING, CREATIVE, ROLEPLAY, EVALUATION |
| AgentKind / AiContext | CUSTOM, ASSISTANT, OPS, COACH / GENERAL, LEAD, CLIENT, LEAD_LIST, CLIENT_LIST |
| KbCategory | PRODUCT, UNDERWRITING, SERVICE, SALES, OTHER |
| Coach | tình huống NO_MONEY, ASK_SPOUSE, DISTRUST, HAS_INSURANCE, NOT_NOW, SAVINGS_BETTER, TOO_YOUNG, CUSTOM · độ khó EASY, MEDIUM, HARD · tiêu chí OPENING, DISCOVERY, EMPATHY, OBJECTION, LANGUAGE, CLOSING |
| Lookups (12_Lookups) | agentStatus: Đang hoạt động, Ngưng hoạt động · clientTier: Thân thiết, Bạc, Vàng, Kim Cương · maritalStatus: Độc thân, Đã kết hôn, Ly hôn · premiumFrequency: Năm, Nửa năm, Quý, Tháng · applicationStatus: Đã phát hành hợp đồng, Đã hủy Hồ sơ YCBH, Đang chờ phát hành hợp đồng, Đang chờ NB hủy hồ sơ YCBH, Đang chờ NB xử lý, Đang chờ Thư thỏa thuận/Bổ sung thông tin · ageBand: <18, 18-29, 30-39, 40-49, 50-59, 60+ · productRole: Chính, Bổ trợ · yes/no: Có, Chưa |

## 18.10 Ánh xạ PoC → v2.1 (chuyển dữ liệu)
| PoC (bảng D1) | v2.1 (MongoDB) |
|---|---|
| tenants | tenants |
| users + user_roles | users (vai trò nhúng). Người dùng PoC đã bị xóa cứng: không khôi phục được (lý do của USER-14) |
| role_permissions | tenantSettings.grants |
| lead_options (Cooked) | leadOptions |
| insurance_programs (Cooked) | insurancePrograms |
| invitations, sessions, accounts, verifications | giữ nguyên (Better Auth) |
| agents (`path` `/a/b/c/`) | agents (`ancestors` = path tách ra, bỏ chính mình) |
| campaigns, campaign_members | campaigns, campaignMembers |
| leads, lead_history, lead_tasks, lead_comments | leads, leadHistory, tasks, comments |
| crm_activities | interactions |
| client_family | familyLinks |
| clients (+ phone Cooked) + client_agents (nguồn CLIENTS_SHEET_SCOPE, MANUAL) | clients (agentLinks nhúng; tính visibleAgentCodes, ownerAgentCodes; origin MANUAL nếu không có lastImportId) |
| policies + policy_agents + policy_clients + policy_products (+ insured_name, insured_dob, insured_gender, term_years Cooked) | policies (nhúng agents, clients, products; tính currentAgentCodes) |
| applications, success_activities, products, record_changes | cùng tên (camelCase) |
| imports, import_errors | imports, importErrors |
| audit_log | auditEvents (bắt đầu chuỗi hash khi chuyển) |
| ai_* | ai* (khóa provider: giải mã bằng secret cũ rồi mã hóa lại, hoặc GA nhập lại; đoạn kiến thức: embedding lại) |
| Mã khách hàng nhập tay không đủ 10 số (Cooked cho phép 1-20 ký tự) | Liệt kê để GA sửa trước khi chuyển; không chuyển bản ghi sai định dạng [QĐ 11/2026] |
