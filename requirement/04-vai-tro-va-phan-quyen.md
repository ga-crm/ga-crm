# 04. Vai trò và phân quyền (RBAC)

## 4.1 Vai trò
| Vai trò | Mã | Là đại lý? | Phạm vi mặc định | Người điển hình |
|---|---|---|---|---|
| Tư vấn tài chính | `FC` | Có (cần mã đại lý) | OWN | Đại lý tuyến đầu (cấp FC hoặc SA) |
| Trưởng nhóm | `UM` | Có (đồng thời là FC) | DOWNLINE | UM / SUM |
| Trưởng ban | `BM` | Có | DOWNLINE | BM |
| Giám đốc GA | `GAD` | Có (có thể kiêm BM) | DOWNLINE | Giám đốc trong tuyến kinh doanh |
| Chủ GA | `GA_HEAD` | Thường có (có thể kiêm BM) | TENANT | Chủ GA |
| Marketing | `MARKETING` | Không | NONE (+ tính năng) | Tạo lead, chiến dịch, phân công lead |
| Quản trị viên | `ADMIN` | Không | NONE (+ tính năng) | Người dùng, cấu hình, nhập dữ liệu |
| Quản trị nền tảng (DLVN) | `PLATFORM_ADMIN` | Không | Chéo tenant, có audit | DLVN Innovation |

- **ROLE-1** Một người có thể giữ nhiều vai trò; quyền là hợp; reach lấy rộng nhất.
- **ROLE-2** Vai trò đại lý (FC, UM, BM, GAD) cần mã đại lý → `400 agent_code_required`. Mã đại lý là duy nhất trong tenant giữa các người dùng chưa lưu trữ → `409 agent_code_taken`.
- **ROLE-3** `PLATFORM_ADMIN` không bao giờ được gán trong tenant.
- **ROLE-4** Chỉ Chủ GA mới tạo, sửa, khóa, lưu trữ, mời lại hoặc thu hồi lời mời của một Chủ GA, hoặc gán vai trò Chủ GA → `403 forbidden`.
- **ROLE-5** Tenant luôn còn ít nhất một Chủ GA đang hoạt động → `409 last_ga_head`.
- **ROLE-6** Vai trò quản lý (UM, BM, GAD) và cấp bậc là hai khái niệm khác nhau: vai trò quyết định scope trong app; cấp bậc Success (SUM, BM, UM, SA, FC) quyết định nhãn nhóm trong báo cáo.

## 4.2 Danh mục quyền
Quyền cấp theo vai trò theo từng GA trong ma trận chỉ Chủ GA sửa (màn hình "Phân quyền"). Chủ GA luôn có mọi quyền. Thay đổi có hiệu lực từ request kế tiếp và có audit (`PERMISSION_CHANGE`, meta = trước/sau theo vai trò).

| Quyền | Nhãn | Cho phép | Mặc định (Chủ GA luôn có) |
|---|---|---|---|
| `users.manage` | Quản lý người dùng | Mời, gán vai trò và mã đại lý, đổi email, khóa, lưu trữ, mời lại, thu hồi lời mời | Admin |
| `agents.view_all` | Xem toàn bộ cây đại lý | Thấy cả danh bạ đại lý thay vì cây của mình (cần cho ô chọn người được giao) | Admin, Marketing |
| `agents.edit_tree` | Sửa cây đại lý | Đổi quản lý của bất kỳ đại lý (đặt `managerFixed`) | Admin |
| `imports.upload` | Nhập dữ liệu Success | Dùng màn hình nhập dữ liệu Success | Admin, Marketing, GAD, BM, UM, FC |
| `imports.agent_tree` | Nhập cây đại lý cho toàn GA | 01_Agents cho cả GA: tạo đại lý, đặt quản lý | Admin |
| `imports.tenant_wide` | Nhập dữ liệu cho mọi đại lý | 02-05 / 07 cho mọi đại lý của GA | Marketing |
| `imports.view_all` | Xem mọi lần nhập của GA | Lịch sử nhập và báo cáo lỗi của mọi người | Admin |
| `leads.manage` | Quản lý lead | Thấy mọi lead (cả chưa phân công), tạo lead GA, sửa lead, phân công, sửa trạng thái đã khóa, xem kết quả mọi đại lý | Admin, Marketing |
| `leads.import` | Nhập lead từ Excel | Nhập file lead của GA | Admin, Marketing |
| `clients.assign` **NEW** | Phân công khách hàng | "Phân công khách hàng" (file 10) | Chỉ Chủ GA (trong Cooked là cứng cho Chủ GA; v2.1 biến thành quyền để GA có thể giao cho người khác, mặc định không cấp ai) |
| `catalog.manage` **NEW** | Quản lý danh mục | Danh mục Chương trình bảo hiểm (file 05) | Admin (Cooked: Chủ GA + Admin) |
| `campaigns.manage` **NEW** | Quản lý chiến dịch | Tạo / sửa chiến dịch, hội thảo, form công khai | Marketing |
| `reports.view_all` **NEW** | Xem mọi báo cáo | Báo cáo toàn tenant | Marketing (chỉ báo cáo lead) |
| `exports.data` **NEW** | Xuất dữ liệu | Xuất Excel (luôn audit; Marketing xuất dữ liệu đã che) | Chỉ Chủ GA |
| `audit.view` **NEW** | Xem nhật ký | Xem audit | Chỉ Chủ GA |
| `ai.use` | Dùng trợ lý AI | Dùng trợ lý AI trên dữ liệu của mình | GAD, BM, UM, FC |
| `ai.manage` | Quản lý trợ lý AI | Cấu hình trợ lý, mô hình, khóa, kho kiến thức, ngân sách; báo cáo sử dụng | Chỉ Chủ GA |

- **PERM-1** Vai trò cấu hình được trong ma trận: ADMIN, MARKETING, GAD, BM, UM, FC. GA_HEAD không cấu hình được.
- **PERM-2** Tenant mới nhận quyền mặc định. Migration thêm quyền mới PHẢI cấp quyền đó cho vai trò mặc định của tenant hiện có.
- **PERM-3** Danh mục lead (Nhu cầu, Trạng thái hiện tại, Nguồn) chỉ Chủ GA sửa (không phải quyền cấu hình được) [Cooked].
- **PERM-4** Menu ẩn những gì người dùng không dùng được, nhưng API kiểm tra mọi quyền độc lập.

## 4.3 Mỗi vai trò thấy và làm gì (tóm tắt)
| Hạng mục | FC | UM / BM / GAD | Chủ GA | Marketing | Admin |
|---|---|---|---|---|---|
| Lead của mình: xem, làm việc | Có | Có | Có | Có (tất cả) | Có (tất cả) |
| Lead tuyến dưới | - | Xem (che số), góp ý | Tất cả, làm việc | Tất cả, làm việc | Tất cả, làm việc |
| Lead chưa phân công | - | - | Có | Có | Có |
| Tạo lead | Lead tự khai thác (FC_OWN) | Lead tự khai thác | Lead GA | Lead GA | Lead GA |
| Phân công lead | - | - (**OPEN**) | Có | Có | Có |
| Khách hàng / hợp đồng: xem | Của mình | Của mình + tuyến dưới | Tất cả | Chỉ view đã che | Không |
| Khách hàng: thêm tay | Cho mình | Cho mình / đại lý trong tuyến | Cho đại lý được chọn | Không | Không |
| Khách hàng: sửa hồ sơ, số điện thoại, gia đình, ghi chú, hợp đồng nhập tay | Khách của mình | Khách của mình (khách tuyến dưới: chỉ xem) | Mọi khách hàng của GA | Không | Không |
| Phân công khách hàng | - | - | Có | - | - |
| Nhập Success | Dữ liệu của mình | Mình + tuyến dưới | Cả GA | Cả GA | Cây đại lý + theo quyền |
| Danh mục lead | - | - | Sửa | - | Xem |
| Danh mục chương trình | Xem | Xem | Sửa | Xem | Sửa |
| Báo cáo | Dòng của mình | Theo cây | Cả GA | Báo cáo lead cả GA | Theo quyền |
| Người dùng / phân quyền / AI | - | - | Có | - | Người dùng |
