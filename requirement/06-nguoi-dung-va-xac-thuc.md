# 06. Người dùng, lời mời và xác thực (USER)

## 6.1 Tạo và mời
- **USER-1** Không tự đăng ký. Người dùng được người mời (Chủ GA hoặc người có `users.manage`) tạo ở trạng thái `INVITED` kèm lời mời. Tenant luôn lấy từ session người mời, không từ body request.
- **USER-2** Email là duy nhất toàn hệ thống (chữ thường), kể cả giữa các tenant và kể cả người dùng đã lưu trữ → `409 email_taken`.
- **USER-3** Lời mời: token ngẫu nhiên (≥ 32 byte), chỉ lưu SHA-256, hết hạn sau 7 ngày. PoC: người mời sao chép link và gửi tay (Zalo / email). **NEW**: hệ thống gửi email, link vẫn sao chép được.
- **USER-4** Nhận lời mời (`/invite/{token}`): hiện tên GA và email; người dùng đặt mật khẩu (8-128 ký tự; **NEW**: kiểm tra danh sách mật khẩu bị lộ); người dùng thành `ACTIVE`. Không hợp lệ / hết hạn / đã dùng → `invite_invalid`.
- **USER-5** Mời lại (link mới) chỉ với người dùng `INVITED` → nếu không: `409 not_invited`.

## 6.2 Đổi thông tin
- **USER-6** Sửa người dùng: tên, vai trò, mã đại lý, **email** [Cooked]. Đổi email: chuẩn hóa như khi mời, phải chưa ai dùng (`409 email_taken`), mật khẩu vẫn dùng được (thông tin đăng nhập đi theo người dùng, không theo địa chỉ). Có audit (trước/sau).
- **USER-7** Danh sách người dùng (`users.manage`): tên, email, vai trò, mã đại lý + mã đó có trong cây đại lý chưa (cảnh báo nếu chưa), trạng thái, lần đăng nhập gần nhất; tìm kiếm; phân trang; mặc định ẩn người dùng đã lưu trữ (có bộ lọc "Đã lưu trữ").

## 6.3 Khóa, lưu trữ, không xóa cứng [QĐ 11/2026]
Bản Cooked cho phép xóa vĩnh viễn người dùng đang hoạt động. **Bản 2.1 không cho phép**: người dùng là chủ thể của audit, lịch sử lead, ghi chú, góp ý, lần nhập, hội thoại AI; xóa cứng làm mất tính toàn vẹn dữ liệu.
- **USER-8** Trạng thái người dùng: `INVITED` (Chờ kích hoạt), `ACTIVE` (Đang hoạt động), `DISABLED` (Đã khóa), `ARCHIVED` (Đã lưu trữ - đã nghỉ).
- **USER-9** **Khóa** (`DISABLED`): tạm ngăn đăng nhập. **Lưu trữ** (`ARCHIVED`): người dùng đã nghỉ việc; ẩn khỏi danh sách mặc định, ô chọn, ô gán; không đăng nhập được.
- **USER-10** Khi khóa hoặc lưu trữ, hệ thống PHẢI **xóa mọi session và thông tin đăng nhập** (mật khẩu, khóa MFA, liên kết SSO) của người đó ngay lập tức; người dùng bị đăng xuất ở mọi nơi. Mọi dữ liệu nghiệp vụ và lịch sử (audit, lịch sử lead, ghi chú, góp ý, lần nhập, hội thoại AI) được giữ nguyên và vẫn hiện tên người đó.
- **USER-11** Mở lại người đã khóa / lưu trữ: Chủ GA hoặc người có `users.manage` chọn "Kích hoạt lại" → người dùng về `INVITED` với lời mời mới (vì thông tin đăng nhập đã bị xóa) và đặt mật khẩu mới.
- **USER-12** Không tự khóa / lưu trữ mình → `409 cannot_disable_self`; không khóa / lưu trữ người `INVITED` (thu hồi lời mời thay vào đó) → `409 invite_pending`; không khóa / lưu trữ Chủ GA đang hoạt động cuối cùng → `409 last_ga_head`; Chủ GA chỉ do Chủ GA khóa / lưu trữ (ROLE-4).
- **USER-13** Lưu trữ giải phóng mã đại lý cho người dùng mới (mã đại lý là duy nhất giữa người dùng chưa lưu trữ). Bản ghi nghiệp vụ gắn theo mã đại lý (lead, hợp đồng) thuộc về đại lý trong cây, không theo tài khoản, nên không bị ảnh hưởng. Lead tự khai thác của người đã lưu trữ hết khóa (LEAD-9) và được phân công lại.
- **USER-14** **Xóa cứng chỉ cho phép duy nhất một trường hợp**: thu hồi lời mời của người dùng `INVITED` chưa từng đăng nhập và không có bất kỳ bản ghi nào tham chiếu tới (không audit nghiệp vụ, không lần nhập, không ghi chú...). Mọi trường hợp khác → `409 user_has_history` ("Người dùng đã có dữ liệu nên không xóa được. Hãy khóa hoặc lưu trữ."). Thu hồi có audit (`DELETE`, meta: email, vai trò, `invite_withdrawn`).
- **USER-15** Khóa / lưu trữ / kích hoạt lại có audit (`UPDATE` / `ARCHIVE`, meta: trạng thái trước/sau).

## 6.4 Đăng nhập và session
- **USER-16** Đăng nhập: email + mật khẩu; rate limit (theo IP và theo tài khoản); thất bại ghi `LOGIN_FAILED`; thành công ghi `LOGIN` và cập nhật `lastLoginAt`. **NEW**: TOTP MFA, bắt buộc cho Chủ GA, Admin và Platform Admin; tùy chọn cho người khác (cài đặt tenant). **NEW**: đặt lại mật khẩu qua link email (1 giờ). **NEW**: OIDC SSO cho nhân sự DLVN.
- **USER-17** Session: cookie HTTP-only secure, hết hạn trượt (mặc định 7 ngày; thời gian chờ cho admin **OPEN**). Actor (vai trò, quyền, trạng thái tenant) được nạp lại từ database ở mỗi request, nên đổi vai trò hay khóa có hiệu lực ngay.
- **USER-18** Chống CSRF cho mọi request thay đổi dữ liệu (kiểm tra origin theo `APP_URL`).
