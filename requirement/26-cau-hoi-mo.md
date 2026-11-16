# 26. Câu hỏi mở (chủ sản phẩm / DLVN)

1. Lưu trú dữ liệu, chuyển dữ liệu ra nước ngoài cho hạ tầng và provider AI, thời gian lưu (22.6, PDP-10, AUD-5).
2. Success / IT: `customer_phone` trong file hoạt động; mã khách hàng của người thụ hưởng (BEN); 04_Policy_Products trong mọi file xuất; người được bảo hiểm trong 02_Clients; giá trị trạng thái hợp đồng chính xác (mất hiệu lực, đáo hạn, hủy); luồng dữ liệu định kỳ thay cho tải tay.
3. Quy tắc phù hợp và sự kiện kích hoạt trong 11_Products: quy trình duyệt, để gợi ý sản phẩm chuyển từ "Gợi ý AI – cần kiểm tra" sang quy tắc đã duyệt.
4. Quản lý có được phân công lại lead trong tuyến không? Có được xem điểm luyện tập và mức dùng AI của FC không?
5. Chính sách xóa lead và ẩn danh; giữ dữ liệu lead bao lâu sau khi FC nghỉ.
6. "Hẹn liên hệ tiếp" có phải là kích hoạt việc tự động thứ hai như dự định không (một yêu cầu cũ bị cắt).
7. Bộ design system DLVN đầy đủ (component, màu trạng thái) ngoài một màn Figma.
8. Provider AI theo GA: provider mặc định, ngân sách theo gói, ai trả tiền (khóa GA hay khóa nền tảng), chuyển chi phí.
9. Mô hình tính phí (theo người dùng mỗi tháng, token AI là gói thêm?) và giới hạn gói.
10. Cột của sheet 06, 08, 09, 10 trong mẫu v1.1 cho R4 và R6.
11. Tích hợp tin nhắn (Zalo OA) và quy tắc đồng ý cho tin nhắn gửi đi.
12. **Mới từ bản Cooked**:
    - Nguồn lead có bắt buộc nằm trong Danh mục khi tạo tay không (hiện tại: chọn từ danh mục trên giao diện, server vẫn nhận nguồn mới từ file).
    - Có cho xóa hợp đồng nhập tay sai không (đề xuất ở POL-7).
    - Danh mục chương trình bảo hiểm có nên đồng bộ / gợi ý từ 11_Products toàn DLVN (PRG-9).
    - "Phân công khách hàng" có giao cho vai trò khác ngoài Chủ GA không (quyền `clients.assign`, mặc định không cấp).
    - Người dùng đã lưu trữ có cần tự động chuyển khách / lead cho người khác không, hay để Chủ GA phân công lại bằng tay.
    - Thời gian giữ người dùng đã lưu trữ (vĩnh viễn hay ẩn danh hóa sau N năm theo PDP).
