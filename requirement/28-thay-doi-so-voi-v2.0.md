# 28. Thay đổi so với bản 2.0 (`GA-CRM-SPEC-v2.md`)

## 28.1 Quyết định mới của chủ sản phẩm (06/11/2026) [QĐ 11/2026]
| # | Quyết định | Ảnh hưởng | Ghi đè |
|---|---|---|---|
| D1 | **Mã khách hàng luôn đúng 10 chữ số, kể cả khi nhập tay** | DATA-1, MAN-2, API `POST /clients` và `/clients/assign`, validator MongoDB, migration (24.3) | Bản Cooked cho phép mã nhập tay 1-20 ký tự |
| D2 | **Không xóa cứng người dùng khi ảnh hưởng tính toàn vẹn dữ liệu; chỉ khóa hoặc lưu trữ. Khóa / lưu trữ xóa mọi session và thông tin đăng nhập** | USER-8 → USER-15, trạng thái `ARCHIVED`, API disable / archive / reactivate, mã lỗi `user_has_history`, DATA-8 | Bản Cooked cho phép xóa vĩnh viễn người dùng đang hoạt động (trừ khi đã nhập dữ liệu) |

## 28.2 Lấy từ bản Cooked (`crm.btl-main`)
| # | Thay đổi | File / quy tắc |
|---|---|---|
| C1 | **Danh mục lead**: Chủ GA tự quản lý Nhu cầu, Trạng thái hiện tại, Nguồn (thêm, đổi tên, ẩn, sắp xếp; giá trị hệ thống và giá trị đang dùng không xóa được; cờ "Tính là cơ hội", "Khóa sau khi chọn"; giá trị Trạng thái thêm chỉ là nhãn) | 05 (OPT), 08 (LEAD-10..15), 12 (IMP-25), 13 (R1), 17.5 |
| C2 | Báo cáo chuyển đổi: một cột mỗi giá trị Nhu cầu; Cơ hội = tổng giá trị đánh dấu cơ hội | 13 |
| C3 | **Nhập tay khách hàng** ("Thêm khách hàng") và **sửa thông tin** khách | 10 (MAN), 17.8 |
| C4 | **Nhập tay / sửa hợp đồng** với các chương trình; đại lý 100% phục vụ; sửa hợp đồng thay toàn bộ chương trình (cách sửa thẻ Quyền lợi bảo hiểm) | 10 (POL, PRD, COV-5) |
| C5 | **Danh mục chương trình bảo hiểm** của GA (3 mặc định; Chủ GA + Admin quản lý; chọn, không gõ) | 05 (PRG), 17.5 |
| C6 | Trường GA tự quản lý: số điện thoại khách hàng; tên / ngày sinh / giới tính người được bảo hiểm và thời hạn trên dòng chương trình (nhập file không ghi đè) | 10 (CUS-3, PRD-5), 12 (IMP-5) |
| C7 | **Thấy ≠ sở hữu** khách hàng: tải 02_Clients bởi quản lý / Chủ GA chỉ cho thấy (`CLIENTS_SHEET_SCOPE`); liên kết `MANUAL` | 10 (CUS-4..7), 12.2, 18 |
| C8 | **Chủ GA sở hữu mọi khách hàng** (sửa được mọi khách) | 10 (CUS-6) |
| C9 | **Phân công khách hàng** (Chủ GA; một liên kết tay mỗi khách; bỏ phân công giữ đại lý của hợp đồng) | 10 (ASG), 04 (`clients.assign`), 17.8 |
| C10 | Chi tiết khách hàng gộp tab: "Khách hàng & hợp đồng", Gia đình, Lịch sử | 10 (CUS-15), 16.7 |
| C11 | **Lịch sử phụ trách** của lead (người giữ, ngày nhận / bàn giao, số ngày giữ, số liên hệ; 0 liên hệ tô đỏ) | 08 (LEAD-28), 13 (R8 mới) |
| C12 | Ô chọn người được giao hiện số lead đang mở; chọn tất cả trong trang; xóa bộ lọc; thanh thao tác cố định | 08 (LEAD-23, 24, 35), 21 |
| C13 | Đổi email người dùng (giữ mật khẩu) | 06 (USER-6) |
| C14 | Lỗi validate hiện dưới từng ô (`issues[].code` → tiếng Việt) | 03 (UI-2), 20.1, 21.3 |
| C15 | Sửa ranh giới tháng của báo cáo sử dụng AI (ngày cuối tháng, tháng 12) | 03 (DATA-2), 13 (RPT-8) |
| C16 | Ngữ cảnh AI hiển thị nhãn GA tự đặt | 14 (AI-4) |
| C17 | Tiêu đề app hiện tên GA không kèm mã; GA thí điểm demo đổi tên "GA BẮC TỪ LIÊM" | 05 (TENANT-1) |

## 28.3 Quy tắc bản 2.0 bị ghi đè hoặc sửa
| Quy tắc 2.0 | Bản 2.1 |
|---|---|
| CUS-1 "khách hàng chỉ đến từ nhập Success; CRM không tạo / sửa dữ liệu khách DLVN" | Khách đến từ nhập Success **hoặc nhập tay**; hồ sơ sửa được (file ghi đè lại trừ trường GA giữ) |
| CUS-5 "chỉ đại lý của khách sửa gia đình / ghi chú" | Người sở hữu (theo bảng nguồn liên kết) **và Chủ GA** |
| LEAD-10/11 Nhu cầu và Trạng thái là enum cố định | Danh mục do GA quản lý trên nền mã hệ thống cố định |
| LEAD-14 khóa Nhu cầu cho 3 giá trị cố định | Khóa theo cờ `isFinal` của từng giá trị |
| LEAD-22 ô chọn chỉ có tên + mã | "Họ tên (mã) — n lead đang mở" |
| TENANT-5 (2.0) danh sách cấu hình gồm nguồn lead | Nguồn lead nằm trong Danh mục lead (5.3); danh sách phụ còn lại ở 5.2 |
| USER-5/6 (2.0) chỉ thu hồi lời mời và khóa | Thêm lưu trữ, kích hoạt lại, đổi email; khóa / lưu trữ xóa thông tin đăng nhập; không xóa cứng người có dữ liệu |
| PDP-4 khách hàng không có số điện thoại | Có số điện thoại do GA giữ; vẫn không có trong view của Marketing và không gửi cho AI |
| CUS-13 (2.0) tab Hợp đồng riêng | Gộp vào "Khách hàng & hợp đồng" |
| R1 cột Nhu cầu cố định | Cột động theo Danh mục |

## 28.4 Bổ sung khác trong 2.1
- Quyền mới `clients.assign`, `catalog.manage`.
- Báo cáo R8 "Lần bàn giao lead".
- Gợi ý liên kết lead - khách dùng số điện thoại khách do GA nhập (+0,4).
- `recordChanges` ghi cả thay đổi bằng tay trên khách / hợp đồng.
- Kịch bản kiểm thử tăng từ 36 lên 57 (file 23).
- Câu hỏi mở mới về các tính năng Cooked (file 26, mục 12).
