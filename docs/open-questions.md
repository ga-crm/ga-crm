# Câu hỏi mở

Việc đang chờ người khác quyết định. Khi có câu trả lời, ghi vào [decisions.md](decisions.md) kèm ngày, rồi xóa khỏi đây. Các câu A, D, F, I, K, 4, 5, 6, 11, 12a-12f đã trả lời ngày 14/11/2026 (decisions.md).

## Phát sinh trong quá trình làm

| # | Câu hỏi | Vì sao cần hỏi | Hỏi ai |
|---|---|---|---|
| B | Có bộ nhận diện / design system chính thức của DLVN không (đặc tả mục 21.1, câu 7 bên dưới)? Hiện dùng design system ở `requirement/desigin/desigin.md` | Có bộ chính thức thì chỉ đổi token trong `frontend/src/index.css` | DLVN |
| C | Chọn dịch vụ gửi email giao dịch. Gợi ý: Amazon SES nếu hạ tầng là AWS, nếu không thì Postmark hoặc Resend | Chặn quên mật khẩu, gửi lời mời tự động, email báo tin chat chưa đọc | Product Owner, DevOps |
| E | Ai đăng ký Cloudflare Turnstile và giữ khóa cho form lead công khai (`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`); chưa có khóa thì production tắt mọi form | Chặn bật form công khai trên production | Product Owner, DevOps |
| G | Nhà cung cấp cloud cụ thể. Đã chốt hướng: dịch vụ có sẵn (PostgreSQL, Redis, S3), region Việt Nam hoặc Singapore | Quyết định sao lưu, PITR, giới hạn kết nối và chi phí | Product Owner, DevOps |
| H | Chuỗi hash audit (AUD-1) có được niêm phong chạy nền, chia nhiều chuỗi, hay giữ nguyên một chuỗi mỗi GA | Một chuỗi mỗi GA buộc mọi lệnh ghi có audit trong GA phải chờ nhau (`thiet-ke-he-thong.md` mục 5.6) | Pháp chế DLVN |

## Từ mục 26 của đặc tả

Nguyên văn đầy đủ tại [requirement/26-cau-hoi-mo.md](../requirement/26-cau-hoi-mo.md).

| # | Chủ đề | Ảnh hưởng tới |
|---|---|---|
| 1 | Vị trí lưu dữ liệu, chuyển dữ liệu qua biên giới, thời gian lưu (gồm lead, người dùng đã lưu trữ, tin nhắn và file chat; hiện giữ tất cả) | Hạ tầng (câu G), AI, go-live |
| 2 | Cột dữ liệu và luồng nạp tự động từ Success / IT DLVN | Lát cắt 4 |
| 3 | Quy trình phê duyệt quy tắc phù hợp sản phẩm (11_Products) | Lát cắt 4, 7 |
| 7 | Bộ Design System hoàn chỉnh của DLVN | Giao diện, cùng câu B |
| 8 | Con số ngân sách AI mặc định mỗi GA (cách trả tiền đã chốt: GA tự nhập khóa) | Lát cắt 7, 8 |
| 9 | Mô hình tính cước và các gói chuẩn (tên gói, mức giới hạn mỗi gói). Hiện Platform Admin đặt tay giới hạn cho từng GA (lát cắt 8a) | Lát cắt 8 |
| 10 | Cột của các sheet 06, 08, 09, 10 | Báo cáo R4, R6 |
