# 09. Ghi chú, Góp ý, Việc cần làm

## 9.1 Nhật ký tương tác: "Ghi chú" (NOTE)
- **NOTE-1** Lead và khách hàng có một dòng thời gian "Ghi chú": ghi chú thường và liên hệ cùng một danh sách, **cũ nhất ở trên** (câu chuyện của khách theo thứ tự).
- **NOTE-2** Loại: `NOTE` (ghi chú thường), liên hệ `CALL` (Gọi điện), `ZALO`, `MEETING` (Gặp mặt). (`SEMINAR` đến từ điểm danh chiến dịch; `TASK` không phải ghi chú.) Mỗi mục: loại, nội dung (1-4000 ký tự), kết quả tùy chọn (≤ 200), thời điểm (mặc định hiện tại; ghi lùi được, không ghi tương lai), tác giả, mã đại lý (của tác giả, nếu không thì của người được giao lead).
- **NOTE-3** Thêm: một ô nhập với ba chip có biểu tượng (điện thoại, bong bóng Zalo, nhóm người). Không chọn chip = ghi chú thường (nút "Thêm ghi chú"). Chọn chip = ghi nhận liên hệ đó, nội dung là ghi chú của liên hệ (nút "Lưu {gọi điện / Zalo / gặp mặt} và ghi chú"). Bấm lại chip để bỏ chọn.
- **NOTE-4** Ghi liên hệ trên lead: đặt `firstContactAt` (sớm nhất) và `lastContactAt` (muộn nhất), chuyển `NEW` → `CONTACTED` (có lịch sử), hoàn thành việc tự động "liên hệ trong 48 giờ" đang mở, được tính vào báo cáo hoạt động và "Lịch sử phụ trách".
- **NOTE-5** Ai thêm: trên lead, người làm việc với lead (LEAD-7); trên khách hàng, người "sở hữu" khách hàng (file 10, CUS-6) - gồm Chủ GA. Quản lý tuyến chỉ đọc; ô thêm bị ẩn kèm giải thích.
- **NOTE-6** Mỗi mục hiện: nhãn liên hệ có biểu tượng (với liên hệ), ngày giờ, "bởi {tên}", kết quả, nội dung. Ghi chú lúc tạo lead có nhãn "Ghi chú ban đầu".
- **NOTE-7** Tiến độ tư vấn thay đổi trong file lead trở thành một mục NOTE mang ngày của dòng file (nguồn IMPORT).
- **NOTE-8** **NEW**: sửa / xóa ghi chú của mình trong 24 giờ (có audit, giữ bản gốc trong lịch sử); đính kèm (ảnh, PDF ≤ 10 MB).

## 9.2 Góp ý của quản lý: "Góp ý" (CMT)
- **CMT-1** Ai thấy lead thì được góp ý (thường là quản lý tuyến kèm cặp FC; cả người quản lý lead và FC trả lời). Góp ý là luồng trao đổi trên lead, cũ nhất ở trên, 1-2000 ký tự, có tác giả và thời điểm.
- **CMT-2** Góp ý không đổi mốc thời gian dữ liệu của lead (`updatedAt`): không được ảnh hưởng quy tắc "bản ghi mới hơn thắng" của file lead.
- **CMT-3** Cờ chưa đọc: lead giữ `lastCommentAt`, `lastCommentBy`; người được giao có góp ý chưa đọc khi `lastCommentAt > assigneeViewedAt` và góp ý cuối không phải của họ. Hiện nhãn "Góp ý mới" và tab "Có góp ý mới". Mở lead là đã đọc.
- **CMT-4** Bố cục: trên tab "Thông tin" của lead, "Góp ý" nằm dưới "Thông tin" (cột trái).
- **CMT-5** **NEW**: thông báo người được giao khi có góp ý mới; @nhắc tên; quản lý góp ý được trên trang khách hàng của tuyến.
- **CMT-6** Có audit (`CREATE lead_comment`).

## 9.3 Việc cần làm và lịch (TASK)
- **TASK-1** Việc thuộc một lead (**NEW**: hoặc một khách hàng, hoặc việc cá nhân): tiêu đề (1-200), hạn (ngày giờ), trạng thái `OPEN` / `DONE` / `CANCELLED`, nguồn `APP` (tay), `AUTO_ASSIGN` (liên hệ trong 48 giờ), `NEXT_ACTION` (Hẹn liên hệ tiếp), **NEW** `SIGNAL` (từ cơ hội chăm sóc), mã đại lý (người được giao lead), hoàn thành lúc / bởi, người tạo.
- **TASK-2** Người làm việc với lead tạo, sửa (tiêu đề, hạn), hoàn thành, mở lại việc. Hoàn thành ghi lúc / bởi; mở lại xóa hai trường đó.
- **TASK-3** Việc tự động: LEAD-22 (phân công), LEAD-31 (hẹn tiếp), NOTE-4 (liên hệ đầu tiên hoàn thành việc 48 giờ), giao lại hủy việc tự động đang mở của người cũ.
- **TASK-4** Tab "Việc cần làm (n)" trên lead liệt kê theo hạn; việc quá hạn tô đỏ.
- **TASK-5** **NEW "Hôm nay"**: màn hình chính của FC trên điện thoại: việc đến hạn hôm nay và quá hạn, lead mới, lead quá hạn, góp ý chưa đọc, khách hàng có cơ hội chăm sóc (phí đến hạn trong 7 ngày, sinh nhật hôm nay / tuần này), thêm ghi chú nhanh. Quản lý thấy số lead quá hạn của đội.
- **TASK-6** **NEW lịch**: xem tuần / tháng các việc và cuộc hẹn (giai đoạn APPOINTMENT có giờ), kéo thả đổi hạn; feed ICS riêng cho từng người (chỉ đọc, token riêng).
- **TASK-7** **NEW nhắc việc**: thông báo khi đến hạn (và 15 phút trước cuộc hẹn), tôn trọng giờ yên lặng.
