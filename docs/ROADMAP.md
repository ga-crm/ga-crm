# Lộ trình triển khai

Theo thứ tự xây ở mục 1.7 của đặc tả v2.1 ([requirement/01-boi-canh-va-pham-vi.md](../requirement/01-boi-canh-va-pham-vi.md)). Không bắt đầu lát cắt mới khi test của lát cắt trước chưa đạt hết.

Từ 09/11/2026 dự án theo đặc tả v2.1. Bản v2.1 thêm Danh mục vào lát cắt 2, Lịch sử phụ trách vào lát cắt 3, và đổi luồng khóa / lưu trữ người dùng, nên hai lát cắt này mở lại.

Ký hiệu: **Xong** · **Một phần** · **Chưa làm**

Việc chưa làm, xếp theo thứ tự ưu tiên: [viec-con-lai.md](viec-con-lai.md).

| # | Lát cắt | Trạng thái |
|---|---|---|
| 1 | Nền tảng: repo, CI, môi trường, xác thực, tenant, kiểm toán, i18n, design system | Một phần |
| 2 | Tenant, người dùng, lời mời, RBAC, cây đại lý, Danh mục | Xong phần lõi (danh sách phụ có 3/5 từ 14/11; Cài đặt GA còn logo, lịch làm việc) |
| 3 | Lead: tạo, danh sách, chi tiết, trạng thái, phân công, lịch sử phụ trách, góp ý, ghi chú, việc cần làm, nhập file lead | Xong (3b xóa và gộp, 3c kanban, sửa ghi chú, bộ lọc đã lưu). Còn đính kèm ghi chú (cần chỗ lưu file) |
| 4 | Nhập Success 02-05, 07; khách hàng; nhập tay khách hàng / hợp đồng; danh mục chương trình; gia đình; cơ hội chăm sóc; phân công khách hàng | Xong phần lõi (4a-4d); việc trên khách và "Tạo việc" từ tín hiệu xong ở 6c. Báo tín hiệu mới mỗi sáng xong ở 6d; góp ý trên khách hàng và @nhắc tên xong ngày 11/11 |
| 5 | Liên kết lead - khách hàng, tự chuyển giai đoạn từ dữ liệu nhập, chiến dịch, hội thảo, form công khai | Xong (5a-5c). Còn tự phân công lead từ form (LEAD-27) |
| 6 | Báo cáo R1-R7 và xuất, "Hôm nay", lịch, thông báo | Xong phần lõi (6a-6d). R4, R6 chờ cột sheet; web push và email tóm tắt chờ PWA / dịch vụ email |
| 7 | AI: provider, khóa, router, trợ lý, kho kiến thức, luyện tập | Một phần: xong 7a |
| 8 | Gói dịch vụ / giới hạn, console nền tảng, yêu cầu chủ thể dữ liệu, gia cố, kiểm thử tải, ra mắt | Một phần: xong 8a |

## Việc phát sinh từ câu trả lời 14/11/2026

| Việc | Từ câu | Trạng thái |
|---|---|---|
| Trạng thái trực tuyến kèm thời gian: "trực tuyến từ 08:15", "hoạt động 12 phút trước" | K5 | Xong 14/11/2026 |
| Danh mục: "Thêm nhiều giá trị" (dán danh sách mỗi dòng một giá trị, hoặc tải file) cho các danh sách phụ của Cài đặt GA | D | Xong 14/11/2026: Nguồn SĐT, Lý do chốt xịt (Khu vực bỏ 26/11/2026); còn Nhu cầu chi tiết, Loại chiến dịch |
| Nhập file từ 2.000 dòng theo từng lô, lô lỗi không chặn lô khác, báo dòng lỗi; dưới 2.000 dòng giữ tất cả hoặc không có gì | I | Xong 14/11/2026 (ghi nền trong tiến trình API, lô 500 dòng, tiến độ qua WebSocket; chuyển sang hàng đợi BullMQ ở giai đoạn 3) |
| Quản lý tuyến (GAD, BM, UM) phân công lại lead trong tuyến của mình | 4 | Xong 14/11/2026 (quyền `leads.assign_line`) |
| Nhắc Chủ GA "còn N lead / khách của người đã nghỉ" khi lưu trữ người dùng, kèm lối tắt phân công lại | 12e | Xong 14/11/2026 |
| Xóa hợp đồng nhập tay trong 7 ngày sau khi nhập, có audit (POL-7) | 12b | Xong 14/11/2026 |
| Gợi ý chương trình bảo hiểm từ 11_Products | 12c | Cùng lát 8c |

## Chuyển kiến trúc sang `backend` (PostgreSQL)

Thiết kế ở [thiet-ke-he-thong.md](thiet-ke-he-thong.md), cách chuyển ở decisions.md mục 2026-11-12. Từ 12/11/2026 dự án chạy trên API mới (PostgreSQL); bản cũ trên MongoDB đã dừng, rồi xóa ngày 16/11/2026. Từ 16/11/2026 API mới nằm ở `backend/` (trước đó là `backend`).

| Giai đoạn | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | PostgreSQL 18 trong Docker, role `crm_app` / `crm_platform`, TypeORM, migration, RLS, `TenantDb` / `PlatformDb`, outbox, test cô lập tenant | Xong | 10 test tích hợp |
| 1 | Chuyển tenants, users, auth (session, MFA, lời mời), agents, audit, platform; seed demo; test e2e chép từ bản cũ (MongoDB) | Xong | 95 test tích hợp và e2e; frontend hiện tại đăng nhập được với `backend` |
| 1 | Nhập cây đại lý từ Excel (thuộc module imports) | Xong | Cùng lúc với imports |
| 2 | Chuyển leads, ghi chú / liên hệ, góp ý, việc của lead, danh mục lead, xóa và gộp lead, thông báo, module `access`; tìm kiếm trigram | Xong | 165 case tích hợp / e2e; giao diện Lead chạy được với `backend` |
| 2 | Chuyển clients (danh sách, 360°, nhập tay, phân công, gia đình, chăm sóc, chương trình, liên kết lead) | Xong | 194 case tích hợp / e2e; màn hình Khách hàng chạy được với `backend` |
| 2 | Chuyển imports (Success, lead, cây đại lý, hoạt động Success) và bật lại mọi test đang chờ | Xong | 277 case tích hợp / e2e; nhập và lịch sử nhập chạy được với `backend` |
| 2 | Chuyển campaigns (chiến dịch, hội thảo, form công khai) | Xong | 288 case tích hợp / e2e; màn hình Chiến dịch và form `/f/:slug` chạy được với `backend` |
| 2 | Chuyển work (việc cần làm, Hôm nay, lịch, link ICS, nhắc việc) và bật test `notifications` | Xong | 305 case tích hợp / e2e; Hôm nay, Việc cần làm, Lịch chạy được với `backend` |
| 2 | Chuyển seed showcase (dữ liệu demo đầy đủ) và bật test `seed` | Xong | 316 case tích hợp / e2e; `npm --prefix backend run seed` cho mọi màn hình đã chuyển có dữ liệu |
| 2 | Chuyển reports (R1, R2, R3, R5, R7, R8, ghi nhận xuất) và bật test `reports` | Xong | 326 case tích hợp / e2e; màn hình `/reports` chạy được với `backend` |
| 2 | Chuyển ai (cài đặt, khóa nhà cung cấp, model) và bật test `ai-settings`, case giới hạn token AI | Xong | 335 case tích hợp / e2e, không còn `todo`; màn hình Trợ lý AI chạy được với `backend`. Hết giai đoạn 2 |
| 2 | Đổi mặc định sang API mới: frontend gọi cổng 4200, `npm run dev:api` / `seed` / `seed:reset` ở thư mục gốc chạy API mới; dừng bản cũ (MongoDB) | Xong | 12/11/2026. Bản cũ chỉ còn để tra cứu |
| 3 | Redis, BullMQ, worker; nhập, xuất, nhắc việc, thông báo, báo cáo chạy nền; S3 | Chưa làm | |
| 4 | WebSocket (thông báo, kanban, presence) | Đang làm | Trang chủ có thẻ số liệu và biểu đồ Highcharts tự cập nhật (`dashboard.changed`) xong 14/11/2026. Lát C0 xong 14/11/2026: Socket.IO, Valkey, chuông cập nhật ngay, ngắt socket khi thu hồi phiên. Lát C1 xong cùng ngày: trạng thái trực tuyến và DAU / WAU / MAU bằng Redis bitmap. C2, C3 xong cùng ngày: chat 1:1, chat nhóm, Chủ GA tra cứu có audit. C4 xong cùng ngày: file và ảnh (S3 / MinIO), tìm kiếm, thông báo tin chưa đọc. Còn kanban realtime; xem [thiet-ke-chat-realtime.md](thiet-ke-chat-realtime.md) |
| 5 | Load test k6, observability, diễn tập khôi phục; xóa hẳn `backend/` và volume MongoDB | Một phần | Đã xóa `backend/`, dịch vụ, container và volume MongoDB ngày 16/11/2026. Còn load test, observability, diễn tập khôi phục |

## Lát cắt 1: chi tiết

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Repo, môi trường, MongoDB Docker (replica set) | Xong | |
| Đăng nhập, session cookie, đăng xuất, `/me` | Xong | USER-16 phần cơ bản, USER-17 trừ idle timeout |
| Plugin chặn truy vấn thiếu tenant, schema guard | Xong | TEN-2 |
| Kiểm toán chỉ ghi thêm, chuỗi băm, cùng transaction | Một phần | Chưa có tài khoản DB chỉ insert/find (AUD-1) |
| Mã lỗi và thông báo tiếng Việt | Một phần | Có các mã của phần đã làm; có test bắt buộc đủ thông báo. Thiếu các mã mới của v2.1 (mục 20) |
| i18n | Một phần | Có `vi.json`, chưa có `en.json` |
| Design system | Xong | Theo `requirement/desigin/desigin.md` |
| Rate limit, khóa tạm, chống quá tải đăng nhập | Xong, trừ Redis | Bộ đếm đăng nhập trong MongoDB; giới hạn theo IP và người dùng còn trong bộ nhớ |
| Đổi mật khẩu, cá nhân hóa giao diện | Xong | Bổ sung ngoài đặc tả, xem `decisions.md` |
| Quản trị viên đổi mật khẩu hộ, link đặt lại mật khẩu | Xong | Link sao chép tay, chưa gửi email |
| MFA TOTP | Xong | USER-16: bắt buộc với GA_HEAD, ADMIN, PLATFORM_ADMIN; GA bật được cho mọi người. Từ 20/11/2026 Platform Admin bỏ ép buộc được cho mọi GA (`/platform/settings`, xem decisions) |
| Quên mật khẩu tự phục vụ, gửi email mời | Chưa làm | Bắt buộc trước go-live (USER-3, USER-16). Cần dịch vụ email (câu C) |
| SSO OIDC, kiểm tra mật khẩu bị lộ | Chưa làm | USER-4, USER-16, mục 22.4 |
| CI, Playwright, Idempotency-Key, correlation id trong log | Chưa làm | |

## Lát cắt 2: chi tiết

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Tạo GA, tạm đình chỉ, kích hoạt lại | Xong | TENANT-1 đến 4. TENANT-2 v2.1 còn yêu cầu khởi tạo Danh mục lead và 3 chương trình mặc định |
| Người dùng, lời mời, mời lại, thu hồi | Xong | USER-1 đến 5, ROLE-2 đến 5 |
| Danh sách người dùng có cảnh báo mã đại lý chưa có trên cây, bộ lọc "Đã lưu trữ" | Xong | USER-7 |
| Đổi email người dùng | Xong | USER-6 |
| Khóa, lưu trữ (`ARCHIVED`), xóa thông tin đăng nhập, kích hoạt lại về `INVITED`, giải phóng mã đại lý | Xong | USER-8 đến 13, USER-15. Chưa có MFA / SSO nên chỉ xóa mật khẩu, phiên và link |
| Không xóa cứng người đã có dữ liệu (`user_has_history`) | Xong | USER-14, DATA-8 |
| Ma trận phân quyền theo GA | Xong | Mục 4.2. Chưa có quyền mới `clients.assign`, `catalog.manage` |
| Nhật ký kiểm toán: màn hình xem | Một phần | Chưa có xuất file |
| Cây đại lý: nhập tay, nhập 01_Agents, phạm vi tuyến dưới | Xong | File 07 AGT, SCOPE-2. Chưa có xuất sơ đồ tổ chức, worker cho file 20.000 dòng, lưu file gốc. AGT-9 (ô chọn đại lý theo cây) đi cùng lát cắt 4 |
| Danh mục lead: Nhu cầu, Trạng thái hiện tại, Nguồn | Xong | OPT-1 đến 10, OPT-12, OPT-13 (24/11/2026: ai tạo lead cũng gõ được nguồn gốc mới; trên giao diện gọi là "Nguồn gốc", xem decisions), LEAD-14, LEAD-15, DATA-9, màn hình 16.8, API 17.5. OPT-11 (cột báo cáo) chờ R1 |
| Cài đặt GA | Một phần | Mục 5.2, màn hình 16.16: hồ sơ, hạn liên hệ, ngưỡng liên hệ kịp thời, gói (chỉ xem), `409 stale_settings`. Còn danh sách phụ (chờ câu hỏi D), logo, lịch làm việc, giờ yên lặng |

## Lát cắt 3: chi tiết

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Tạo lead, nguồn gốc, một số điện thoại một lead | Xong | LEAD-1 đến 5 |
| Phạm vi xem, che số, quyền xử lý, khóa lead tự khai thác | Xong | LEAD-6 đến 9, PDP-3 |
| Nhu cầu, trạng thái, giai đoạn, khóa nhu cầu | Xong | LEAD-10 đến 20, theo Danh mục lead của GA. Đổi giai đoạn bằng menu, chưa có kanban |
| Phân công đơn lẻ và hàng loạt, ô chọn có số lead đang mở | Xong | LEAD-21 đến 23, LEAD-25 |
| Chọn tất cả trong trang, xóa bộ lọc | Xong | LEAD-24, LEAD-35 |
| Chọn tất cả theo bộ lọc, thanh phân công cố định ở chân màn hình | Xong | LEAD-24, route thêm `GET /leads/ids` |
| Lịch sử phụ trách | Xong | LEAD-28, mục 8.6; báo cáo R8 thuộc lát cắt 6 |
| Quá hạn 48 giờ, hẹn liên hệ tiếp | Xong | LEAD-29, LEAD-31 |
| Danh sách, tab, bộ lọc, sắp xếp | Xong | LEAD-35 đến 38, chưa lưu bộ lọc |
| Ghi chú, lượt liên hệ, góp ý, việc cần làm | Xong | NOTE, CMT, TASK-1 đến 4 |
| Nhập file 13_Leads, ánh xạ cột và đại lý, file mẫu | Xong | Mục 12.4, 19.7, 19.8, nhận nhãn GA tự đặt (OPT-10, IMP-25) |
| Xóa mềm, khôi phục 30 ngày, xóa theo yêu cầu (PDP-6), gộp lead | Xong (3b) | LEAD-40, LEAD-41. Trang `/leads/deleted` |
| Kanban, sửa ghi chú trong 24 giờ, lưu bộ lọc | Xong (3c) | LEAD-19, NOTE-8, LEAD-38 |
| Đính kèm ghi chú | Chưa làm | NOTE-8, cần chỗ lưu file (IMP-14) |
| Liên kết khách hàng | Xong | Lát cắt 5a |

## Lát cắt 4: chi tiết

| Phần | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| 4a | Nhập 02_Clients, 03_Policies, 04_Policy_Products, 05_Applications | Xong | Mục 12.1-12.3, 19.3-19.5, IMP-5 đến IMP-21, CUS-1, CUS-4, CUS-10 đến CUS-13 |
| 4a | Liên kết khách hàng - đại lý, thấy / sở hữu | Xong | CUS-4 đến CUS-8 |
| 4a | Danh sách khách hàng, chi tiết (hồ sơ, hợp đồng, chương trình, hồ sơ YCBH), `VIEW_CLIENT` | Xong. 25/11/2026: thẻ "Hợp đồng" riêng, chi tiết hợp đồng trong thẻ với 9 trường hợp đồng / phí mới, địa chỉ liên hệ che và xem có audit (decisions.md) | CUS-9, CUS-14, một phần CUS-15. "Khách hàng của" chọn một, chưa chọn nhiều |
| 4b | Thêm / sửa khách hàng, hợp đồng bằng tay; danh mục chương trình bảo hiểm | Xong. 25/11/2026: thêm khách theo **Mã hợp đồng** + vai trò, khách định danh bằng id, mã khách Success thành cột ẩn (decisions.md) | MAN-1 đến 8, POL-1 đến 6, PRD-1 đến 5, PRG-1 đến 8, quyền `catalog.manage` / `clients.assign`. POL-7, PRG-9 còn OPEN |
| 4c | Gia đình, quyền lợi bảo hiểm, cơ hội chăm sóc và tab đếm, ghi chú khách hàng | Xong | FAM-1 đến 8, COV-1 đến 5, mục 10.11, SIG-1, NOTE-5. Chưa có SIG-2 (tạo việc từ tín hiệu), việc / góp ý trên khách hàng |
| 4d | Phân công khách hàng, nhập 07_Activities, tab Lịch sử | Xong | ASG-1 đến 7, IMP-31, IMP-32, CUS-15 tab Lịch sử. Báo cáo hoạt động R2 dùng `successActivities` ở lát cắt 6 |

## Lát cắt 5: chi tiết

| Phần | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| 5a | Liên kết lead - khách hàng: gợi ý có điểm, tìm, liên kết, hủy có lý do; tab "Khách hàng liên kết" trên lead, "Lead nguồn" trên khách | Xong | LEAD-32, LEAD-34, CUS-4 (`LEAD_LINK`) |
| 5a | Tự chuyển giai đoạn sau nhập Success | Xong | LEAD-33 |
| 5b | Chiến dịch: tạo / sửa, kết thúc, trang chiến dịch có số liệu; hội thảo và thành viên | Xong | CMP-1, 2, 3, 5. Màn hình `/campaigns`, `/campaigns/:id` |
| 5c | Form lead công khai: link, QR, đồng ý, chống bot, rate limit | Xong | CMP-4. Trang `/f/:slug`. Cần khóa Turnstile thật trước khi chạy production (câu E) |
| - | Tự phân công lead từ form / file (chia vòng, theo tỉnh) | Chưa làm | LEAD-27, mặc định tắt; khu vực của lead đã bỏ 26/11/2026 |

## Lát cắt 6: chi tiết

| Phần | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| 6a | Khung báo cáo dạng cây, chọn kỳ, thu gọn nhóm, bấm số xem danh sách, xuất Excel | Xong | RPT-1 đến 6, RPT-8. Chưa có snapshot ban đêm (RPT-7) |
| 6a | R1 chuyển đổi, R2 hoạt động đại lý, R8 bàn giao lead | Xong | Màn hình `/reports` |
| 6b | R3 phễu theo nguồn / chiến dịch, R5 pipeline theo đội, R7 khối lượng chăm sóc | Xong | Ba tab mới trên `/reports` |
| 6c | "Hôm nay", việc cần làm ngoài lead, lịch, feed ICS, việc từ tín hiệu (SIG-2) | Xong | TASK-5, 6. Nhắc việc (TASK-7) chuyển sang 6d |
| 6d | Thông báo trong app (chuông, trang, tùy chọn), nhắc việc (TASK-7), báo tín hiệu mới (SIG-2), giờ yên lặng | Xong | NTF-1 đến 5 phần trong app. Chưa có web push, email tóm tắt, ngân sách AI. @nhắc tên và góp ý trên khách làm xong sau đó |
| - | R4 hoạt động so với mục tiêu, R6 sản lượng | Chờ | Cần cột sheet 06, 08-10 (IMP-33 OPEN) |

## Lát cắt 7: chi tiết

| Phần | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| 7a | Cài đặt AI: khóa API mã hóa theo GA, khóa nền tảng, kiểm tra khóa, danh sách mô hình trực tiếp, mô hình theo tầng, router, hạn mức tháng, bật / tắt | Xong | AI-11, AI-13 (phần cài đặt), AI-14 đến AI-17. Màn hình `/ai` |
| 7b | Trợ lý, ngăn kéo trò chuyện, router, ẩn danh, stream, mức dùng và hạn mức, `AI_READ` | Chưa làm | AI-1 đến AI-13, AI-19 đến AI-25, AI-35, AI-36 |
| 7c | Kho kiến thức: kho, tài liệu, chia đoạn, embedding, tìm kiếm lai, trích nguồn | Chưa làm | AI-18, AI-26 đến AI-30. Cần chọn cách tìm vector khi không có Atlas |
| 7d | Luyện xử lý từ chối, chấm điểm, tab Sử dụng, chi phí ước tính | Chưa làm | AI-31 đến AI-34, AI-37, AI-38 |

## Lát cắt 8: chi tiết

| Phần | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| 8a | Gói dịch vụ và giới hạn (người dùng, token AI, dung lượng), chặn khi vượt, GA xem gói; Platform Admin đặt lại MFA người dùng GA | Xong | Mục 5.2, 16.17, M13. Cách tính cước vẫn chờ câu 9 |
| 8b | Yêu cầu của chủ thể dữ liệu: ghi nhận, xuất, xóa | Chưa làm | PDP-6, `dsrRequests` |
| 8c | Danh mục sản phẩm 11_Products; xuất dữ liệu GA khi rời nền tảng | Một phần: danh mục sản phẩm xong 25/11/2026 (form, file 11_Products, nối hợp đồng và lead); còn xuất dữ liệu GA | TENANT-5, TENANT-6 |
| 8d | Gia cố: correlation id, Idempotency-Key, kiểm thử tải, CI | Chưa làm | Mục 22. Audit mã nguồn 17/11/2026: 3 lỗi mức cao và 11 lỗi mức trung bình đã sửa; các lỗi còn lại ở [viec-con-lai.md](viec-con-lai.md), mục 1b CI xong 18/11/2026 (`ci.yml` trên PR và push vào `main`, Promote chờ CI xanh, hook pre-push); còn correlation id, `Idempotency-Key`, kiểm thử tải, Playwright |
| - | Kho kiến thức toàn DLVN, bảng giá AI trên console | Chờ AI | Theo lát cắt 7 |

## Test bắt buộc ở mục 23.2 (phần liên quan)

| # | Kịch bản | Trạng thái |
|---|---|---|
| 1 | GA-1 nhận 404 với mọi tài nguyên của GA-2 | Một phần, mới có với người dùng |
| 2 | Schema guard | Xong |
| 3 | Tìm kiếm OR không thoát bộ lọc tenant | Xong với người dùng |
| 4 | UM, FC, Chủ GA, Marketing nhìn đúng phạm vi | Xong với cây đại lý, chờ dữ liệu nghiệp vụ |
| 5 | Ghi `CROSS_TENANT_READ` | Xong |
| 6, 7 | Quy tắc Chủ GA, mã đại lý duy nhất giữa người chưa lưu trữ | Xong |
| 8, 9, 10 | Đổi email; khóa / lưu trữ xóa thông tin đăng nhập; không xóa cứng người có dữ liệu | Xong |
| 11 | Ma trận có hiệu lực ngay, tách theo GA | Xong, phần migration quyền mới chưa cần |
| 12 | Cây đại lý: ancestors, vòng lặp, quản lý chưa có, giữ liên kết sửa tay | Xong |
| 13 đến 17 | Danh mục lead | Xong, trừ phần cột trong Báo cáo chuyển đổi (chờ R1) |
| 18 | Danh mục chương trình bảo hiểm | Chưa làm (lát cắt 4) |
| 19 đến 26, 32 | Quy tắc lead, phạm vi, góp ý, số đếm, nhập file lead | Xong (21: phần số lead đang mở cũng xong) |
| 27 | Lịch sử phụ trách | Xong |
| 28, 29, 31 | File mẫu 0 lỗi, giữ số 0, ngoài phạm vi, thiếu cột, cột cấm, `recordChanges` | Xong với 01-05 |
| 30 | Hợp đồng chia: file FC chỉ cập nhật phần của mình, dữ liệu GA đủ 100%, kết thúc đại lý vắng | Xong |
| 34 | 02_Clients: FC tải thì khách là của FC; quản lý / Chủ GA tải chỉ thấy | Xong |
| 36 | Khách thấy được qua hợp đồng / hồ sơ / tải file / nhập tay / phân công; `VIEW_CLIENT` | Xong |
| 33 | 07_Activities: `phoneKey`; gộp trùng trong báo cáo hoạt động | Xong |
| 46 | Bố cục cây với dòng riêng của quản lý và tổng nhóm; FC thấy dòng mình; dòng chưa phân công; liên hệ 24 giờ chỉ với liên hệ có giờ | Xong (`test/reports.e2e-spec.ts`) |
| 47 | Khoảng tháng nửa mở theo giờ Việt Nam | Xong (unit backend và frontend) |
| 42 | Phân công khách hàng: quyền, thay liên kết tay, bỏ phân công giữ đại lý hợp đồng, GA khác 404, cột tư vấn viên | Xong (`test/client-assign.e2e-spec.ts`) |
| 18, 35, 37-41, 43 | Danh mục chương trình; file không ghi đè trường GA giữ; thêm / sửa khách và hợp đồng tay; số điện thoại khách; Chủ GA sửa mọi khách | Xong |
| 44 | Gia đình: quan hệ ngược, gắn nhãn người chỉ có trên hợp đồng, ngày sinh một phần, tạo lead, `already_client`, `same_client`, sở hữu | Xong (`test/client-care.e2e-spec.ts`) |
| 45 | Nhóm quyền lợi và lỗ hổng chỉ khi có chi tiết sản phẩm; tín hiệu và đếm tab (0 khi trống) | Xong |
