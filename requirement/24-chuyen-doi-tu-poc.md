# 24. Chuyển dữ liệu từ PoC

Áp dụng cho cả bản PoC gốc (`ga-crm`) và bản Cooked (`crm.btl-main`, GA Bắc Từ Liêm).

1. **Đóng băng**: xuất D1 của PoC (SQL dump) và object R2; ghi số dòng mỗi bảng.
2. **Chuyển đổi** (script `packages/db/migrations/poc-import`): ánh xạ theo 18.10; đổi `path` → `ancestors`; nhúng đại lý / khách / sản phẩm vào hợp đồng (gồm 4 trường GA tự quản lý của Cooked); tính `currentAgentCodes`, `visibleAgentCodes`, `ownerAgentCodes` (CLIENTS_SHEET_SCOPE không cho sở hữu); đổi thời điểm (ISO text → Date; giây unix của Better Auth → Date); giữ khóa tự nhiên dạng chuỗi; `role_permissions` → `tenantSettings.grants`; `lead_options`, `insurance_programs` → `leadOptions`, `insurancePrograms`; liên kết kiến thức của trợ lý → `kbIds`; đánh `origin: MANUAL` cho khách / hợp đồng không có `last_import_id`.
3. **Kiểm tra mã khách hàng** [QĐ 11/2026]: Cooked cho phép mã nhập tay 1-20 ký tự; v2.1 bắt buộc 10 chữ số. Script liệt kê các khách nhập tay sai định dạng (kèm hợp đồng, gia đình, ghi chú) để GA sửa mã trên PoC trước khi chuyển; không chuyển bản ghi sai định dạng.
4. **Người dùng**: trạng thái `DISABLED` giữ nguyên; người dùng đã bị Cooked xóa cứng không khôi phục được (audit chỉ còn email / tên trong meta) - ghi nhận trong biên bản chuyển đổi.
5. **Bí mật**: khóa provider AI không giải mã được bằng secret mới; giải mã bằng secret PoC trong lúc chuyển rồi mã hóa lại bằng `AI_KEYS_SECRET`, hoặc yêu cầu Chủ GA nhập lại.
6. **Embedding lại** đoạn kiến thức bằng mô hình embedding đã chọn (PoC chỉ dùng tìm theo từ khóa).
7. **Mật khẩu**: giữ hash nếu định dạng tương thích với Better Auth; nếu không, bắt đặt lại qua email.
8. **Xác minh**: số dòng, kiểm tra mẫu mỗi tenant (10 lead, 10 khách có gia đình và quyền lợi, 5 khách nhập tay có hợp đồng, báo cáo một tháng khớp giữa PoC và v2.1, "Khách hàng của" của một quản lý khớp), test scope trên dữ liệu đã chuyển.
9. **Chuyển đổi chính thức**: khung chỉ đọc, xuất phần chênh lệch cuối, đổi DNS, giữ PoC chỉ đọc 30 ngày.
