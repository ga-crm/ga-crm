# 22. Yêu cầu phi chức năng

## 22.1 Hiệu năng
- P95 độ trễ API < 300 ms cho danh sách và chi tiết ở mức 200 nghìn lead / 500 nghìn hợp đồng mỗi tenant; client 360 < 800 ms.
- Danh sách lead kèm bộ lọc và đếm < 500 ms; báo cáo cho GA 500 đại lý trong một tháng < 2 giây (hoặc dùng snapshot).
- Nhập: 2.000 dòng < 30 giây; 20.000 dòng < 3 phút (worker).
- AI: token đầu tiên < 3 giây ở P95 (FAST/BALANCED); lần gọi router < 1 giây.

## 22.2 Khả năng mở rộng và đa tenant
- Mục tiêu: 100 GA, 20.000 người dùng, 10 triệu lead trên một cluster; ứng viên shard key `{tenantId: 1, _id: 1}` khi cần.
- Giới hạn theo tenant (gói): người dùng, dung lượng, token AI; chống "hàng xóm ồn ào" bằng rate limit theo tenant và hàng đợi job công bằng.

## 22.3 Sẵn sàng và khôi phục
- 99,9% mỗi tháng cho web app và API; bảo trì có lịch được báo trước.
- Sao lưu: liên tục (Atlas point-in-time, 7 ngày) + snapshot hằng ngày giữ 35 ngày; object storage có versioning; diễn tập khôi phục mỗi quý. RPO ≤ 15 phút, RTO ≤ 4 giờ.
- Không xóa cứng dữ liệu được tham chiếu (DATA-8, USER-14) để mọi lần khôi phục giữ được tính toàn vẹn.

## 22.4 Bảo mật
- OWASP ASVS L2. Chỉ HTTPS (HSTS), cookie secure HTTP-only, kiểm tra origin chống CSRF, CSP chặt, validate mọi input (Zod), encode output (không `dangerouslySetInnerHTML`; markdown AI hiển thị bằng React node).
- Bí mật trong secret manager; khóa provider AI mã hóa khi lưu bằng khóa riêng (`AI_KEYS_SECRET`), chỉ ghi qua API.
- MFA cho vai trò đặc quyền; rate limit và khóa tạm khi đăng nhập sai nhiều lần; khóa / lưu trữ người dùng xóa ngay session và thông tin đăng nhập (USER-10).
- User database quyền tối thiểu (audit chỉ insert); allow-list mạng; mã hóa khi lưu (Atlas) và khi truyền.
- Quét dependency, SAST, quét bí mật trong CI; kiểm thử xâm nhập trước và sau khi ra mắt, hằng năm.
- Chống prompt injection: văn bản CRM và tài liệu chỉ là dữ liệu; công cụ chỉ đọc (trừ bản nháp cần xác nhận); output không bao giờ được thực thi.

## 22.5 Quan sát và vận hành
- Log có cấu trúc kèm tenantId, userId (không có PII trong log), correlation id; trace xuyên web → worker → AI; Sentry cho lỗi; dashboard cho lỗi nhập, lỗi và chi phí AI, độ sâu hàng đợi job.
- Runbook: chạy lại ghi nhập, dựng lại cây đại lý, tính lại scope khách hàng (`recomputeClientScope`), embedding lại kiến thức, xoay vòng secret.

## 22.6 Lưu trú dữ liệu và tuân thủ PDP
- **OPEN (Pháp chế DLVN)**: region lưu trữ (cloud tại Việt Nam hay Singapore), hồ sơ đánh giá tác động chuyển dữ liệu ra nước ngoài, danh sách bên xử lý phụ (cloud, email, nhà cung cấp AI ở Mỹ / Trung Quốc), thỏa thuận xử lý dữ liệu, thời gian lưu, quy trình báo cáo vi phạm (72 giờ).
- Dữ liệu đã ẩn danh vẫn ra nước ngoài khi provider AI ở nước ngoài: ghi nhận và xin phê duyệt; cho GA tắt AI hoặc giới hạn provider.
- Yêu cầu của chủ thể dữ liệu (PDP-6) xử lý trong thời hạn luật định, theo dõi trong `dsrRequests`.
- Người dùng đã nghỉ: lưu trữ (không xóa) để giữ trách nhiệm giải trình trong audit; thông tin đăng nhập bị xóa (USER-10).

## 22.7 Đa ngôn ngữ
- Tiếng Việt mặc định; duy trì catalogue tiếng Anh cho người dùng hội sở DLVN và thị trường sau này; mọi định dạng qua helper theo locale.
