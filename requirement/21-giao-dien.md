# 21. Giao diện, UX và design system

## 21.1 Thương hiệu (design system DLVN)
- Bảng màu lấy xanh Dai-ichi làm điểm nhấn duy nhất, font Inter, thẻ viền mảnh (inset ring 1 px, bo 10 px, không đổ bóng), bo 6 px cho ô nhập và nút, tab đang chọn = chữ xanh + gạch dưới xanh, tiêu đề trang = thanh xanh 4×24 px + chữ hoa xám 22 px, huy hiệu người dùng nền xanh nhạt với lời chào in nghiêng, logo DLVN và họa tiết "FutureLine" ở đầu trang.
- Không dùng xanh lá hay vàng hổ phách: trạng thái dùng các sắc xanh; **đỏ chỉ cho lỗi và quá hạn**. Nhãn dạng viên (12,8 px).
- Token là biến CSS (`--brand-blue-100`, `--blue-10/20/40`, `--nav`, `--eyebrow`, `--accent-alert`...) ánh xạ vào Tailwind; một file nguồn token. (Token PoC lấy từ một màn Figma; nút, ô nhập, màu trạng thái là suy ra: **OPEN** xin bộ component đầy đủ của DLVN.)
- Ngoại lệ: lớp nổi (ngăn kéo AI, hộp thoại, thanh thao tác cố định chân màn hình) có bóng đổ rõ để tách khỏi trang.

## 21.2 Bố cục và responsive
- Mobile-first cho đại lý: menu dưới (Hôm nay, Lead, Khách hàng, Lịch, Thêm), thẻ xếp chồng, vùng chạm ≥ 44 px, form điền được dưới 30 giây (tạo lead).
- Desktop cho quản lý, Marketing, Admin: menu trên, lề rộng trên màn hình lớn, bảng phân trang phía server, tiêu đề bảng dính, sắp xếp cột.
- Thanh thao tác hàng loạt (phân công lead, phân công khách hàng) cố định ở chân màn hình, chừa chỗ cho nút AI nổi [Cooked].
- PWA: cài được (manifest, icon), vỏ offline, web push; ghi chú nháp giữ cục bộ khi mất mạng và gửi khi có mạng (**NEW**).

## 21.3 Mẫu tương tác
- Danh sách: tab có đếm ở trên, hàng bộ lọc (+ "Xóa bộ lọc"), bảng, phân trang "Trang x / y", "n kết quả".
- Chi tiết: đầu trang có tên và nhãn, tab, bố cục hai cột trên desktop (trái: thông tin; phải: thao tác và dòng thời gian).
- Dòng thời gian cũ nhất ở trên (ghi chú, góp ý); lịch sử mới nhất ở trên.
- **Form**: lỗi từ server hiện ngay dưới ô cần sửa (theo `issues[].path` và `code`), không chỉ một thông báo chung ở chân form [Cooked]; gợi ý dưới ô giải thích quy tắc (ví dụ "Để trống sẽ tự tính theo ngày sinh.", "Chỉ ghi nhận Có / Chưa, hệ thống không lưu số căn cước.").
- Trường Có / Chưa từ Success có ba trạng thái: không rõ / Có / Chưa.
- Ô chọn từ danh mục chỉ hiện giá trị đang bật + giá trị bản ghi đang mang (dù đã ẩn).
- Mọi thao tác hiện thành công hoặc thông báo lỗi tiếng Việt tại chỗ; thao tác không hoàn tác được phải xác nhận (khóa, lưu trữ người dùng, xóa giá trị danh mục).
- Trợ năng: WCAG 2.1 AA (độ tương phản, điều hướng bàn phím, viền focus, nhãn cho mọi ô, `aria-pressed` cho chip, hộp thoại giữ focus).
- Ngày `dd/mm/yyyy`, giờ `HH:mm`, giờ Việt Nam; tiền `13.000.000 đ`; số điện thoại che theo PDP-3.
