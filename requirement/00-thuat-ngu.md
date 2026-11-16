# 00. Thuật ngữ

| Thuật ngữ | Ý nghĩa |
|---|---|
| DLVN | Dai-ichi Life Việt Nam, công ty bảo hiểm |
| GA (General Agency, Tổng đại lý) | Công ty đại lý độc lập bán sản phẩm DLVN qua đội ngũ của mình. Một GA = một tenant |
| Chủ GA (GA Head) | Người đứng đầu GA. Xem và quản lý toàn bộ tenant. Có thể đồng thời là quản lý kinh doanh (ví dụ BM) |
| FC (Tư vấn tài chính) | Đại lý tuyến đầu |
| SA | Cấp bậc đại lý cao cấp trong Success (về scope xử lý như FC) |
| UM (Trưởng nhóm) / SUM | Quản lý một "Phòng kinh doanh" |
| BM (Trưởng ban) | Quản lý một "Ban kinh doanh" gồm nhiều phòng |
| GAD (Giám đốc GA) | Vai trò quản lý trong tuyến kinh doanh (có thể kiêm BM) |
| Mã đại lý (agent code) | Mã đại lý DLVN, chỉ gồm chữ số, lưu dạng text, giữ số 0 đầu |
| Cây đại lý (agent tree) | Cấu trúc báo cáo của đại lý, dựng từ file xuất Success |
| Tuyến dưới (downline) | Mọi đại lý bên dưới một đại lý (trực tiếp và gián tiếp) |
| Quản lý tuyến (managers of the line) | UM / BM / GAD phía trên một đại lý |
| Marketing | Nhân sự GA lo tạo lead, chiến dịch, phân công lead; không phải đại lý |
| Admin (Quản trị viên) | Nhân sự văn phòng GA: người dùng, cấu hình, nhập dữ liệu; không phải đại lý |
| Platform Admin (Quản trị nền tảng) | Nhóm DLVN Innovation vận hành SaaS; truy cập chéo tenant, luôn ghi audit |
| Success (Dai-ichi Success, D-Success) | Cổng đại lý của DLVN. Đại lý xuất Excel; GA CRM nhập vào. Không có API |
| Lead | Khách hàng tiềm năng (tên + số điện thoại) GA đang chăm sóc trước khi thành khách hàng DLVN |
| Khách hàng (client) | Khách hàng DLVN, định danh bằng Mã khách hàng (10 chữ số) |
| Hợp đồng (HĐBH, policy) | Hợp đồng bảo hiểm DLVN (Số HĐBH, 9 chữ số) |
| Hồ sơ YCBH (HSYCBH, application) | Hồ sơ yêu cầu bảo hiểm, trước khi phát hành |
| PO / LI / BEN | Vai trò trên hợp đồng: Bên mua bảo hiểm / Người được bảo hiểm / Người thụ hưởng |
| Chương trình bảo hiểm (program) | Sản phẩm (chính hoặc bổ trợ) trên một hợp đồng. GA có danh mục chương trình riêng để chọn khi nhập tay [Cooked] |
| APE | Phí bảo hiểm quy năm (thước đo sản lượng chuẩn) |
| APL | Tạm ứng đóng phí tự động (nợ khi phí được đóng bằng khoản vay trên giá trị hợp đồng) |
| D-Connect | Ứng dụng khách hàng của DLVN |
| eKYC | Xác thực danh tính điện tử |
| PDP | Bảo vệ dữ liệu cá nhân: Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân (hiệu lực 2026). Diễn giải pháp lý do Pháp chế DLVN |
| File lead | File Excel / Google Sheet lead của GA (ví dụ sheet "Chia Lead") |
| Mẫu Success | DLVN_BDM_CRM_Import_Template v1.1: bố cục Excel đại lý xuất từ Success (sheet 01-13) |
| Danh mục | Màn hình Chủ GA tự quản lý các danh sách: Nhu cầu, Trạng thái hiện tại, Nguồn, Chương trình bảo hiểm [Cooked] |
| Lưu trữ (archive) người dùng | Người dùng đã nghỉ: không đăng nhập được, ẩn khỏi danh sách mặc định, giữ nguyên mọi dữ liệu lịch sử [QĐ 11/2026] |
