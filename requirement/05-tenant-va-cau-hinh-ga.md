# 05. Tenant và cấu hình GA

## 5.1 Tenant (TENANT)
- **TENANT-1** Một tenant = một GA: `gaCode` (duy nhất toàn hệ thống, viết hoa, `^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$`, ví dụ `GA-HCM-012`), `name`, `status` (`active` / `suspended`), gói dịch vụ, cài đặt, ngày tạo. Thanh tiêu đề app hiện **tên GA** (không kèm mã GA) [Cooked].
- **TENANT-2** Chỉ Platform Admin tạo tenant, cùng Chủ GA đầu tiên (email, tên, mã đại lý tùy chọn). Chủ GA được tạo ở trạng thái INVITED kèm link mời (file 06). Trùng mã → `409 ga_code_taken`. Tenant mới được khởi tạo: quyền mặc định, cài đặt, Danh mục lead mặc định (5.3), 3 chương trình bảo hiểm mặc định (5.4), trợ lý AI mặc định.
- **TENANT-3** Tenant bị tạm ngưng: mọi người dùng nhận `401` ở request kế tiếp; dữ liệu được giữ; Platform Admin kích hoạt lại được.
- **TENANT-4** Platform Admin xem danh sách tenant (số người dùng, hoạt động gần nhất, mức dùng gói), mở danh sách người dùng của tenant (audit `CROSS_TENANT_READ`), cấp lại link mời (audit). Platform Admin không sửa dữ liệu nghiệp vụ của tenant.
- **TENANT-5** Danh mục sản phẩm DLVN (11_Products) dùng chung mọi tenant, do Platform Admin nạp; quyết định nhóm quyền lợi (file 10, COV-3). Upsert theo mã sản phẩm; audit `IMPORT products`.
- **TENANT-6** Rời nền tảng **NEW**: Platform Admin xuất toàn bộ dữ liệu tenant (JSON + file gốc), sau thời gian chờ mới xóa tenant; có audit.

## 5.2 Cài đặt GA (Chủ GA, audit `SETTINGS_CHANGE`) **NEW**
- Tên hiển thị, logo (dùng cho file xuất và đầu trang), địa chỉ văn phòng chính.
- Danh sách phụ (ngoài Danh mục lead ở 5.3): lý do chốt xịt, nhu cầu chi tiết, nguồn SĐT, khu vực, loại chiến dịch (mã, nhãn, thứ tự, hiện/ẩn). Có giá trị mặc định; giá trị đang dùng chỉ ẩn được, không xóa.
- Quy tắc lead: hạn liên hệ (mặc định 48 giờ), ngưỡng "liên hệ kịp thời" (mặc định 24 giờ), quản lý được phân công lại trong tuyến hay không (**OPEN**), có bắt buộc đồng ý liên hệ trước khi giao vào chiến dịch telesales.
- Lịch làm việc (cho nhắc việc): ngày làm việc, giờ yên lặng của thông báo.
- Gói và giới hạn (GA chỉ xem; Platform Admin đặt): số người dùng tối đa, token AI / tháng, dung lượng lưu trữ.
- Mọi form cài đặt dùng kiểm tra đồng thời lạc quan (`updatedAt` / version) → `409 stale_settings` nếu đã có người lưu trước (bài học PoC: form mở sẵn ghi đè giá trị cũ).

## 5.3 Danh mục lead: Nhu cầu, Trạng thái hiện tại, Nguồn (OPT) [Cooked]
Màn hình "Danh mục" (menu cho Chủ GA và Admin; chỉ Chủ GA sửa thẻ danh mục lead).
- **OPT-1** Ba danh sách: `interest` (Nhu cầu), `care_status` (Trạng thái hiện tại), `source` (Nguồn). Mỗi giá trị: `code`, `label`, `isOpportunity` (chỉ Nhu cầu), `isFinal` (chỉ Nhu cầu), `active`, `sortOrder`, `builtIn`.
- **OPT-2** Mọi tenant bắt đầu với giá trị hệ thống (`builtIn`), giữ nguyên mã mà pipeline, báo cáo và file nhập hiểu:
  | Danh sách | Mã | Nhãn mặc định | Cơ hội | Khóa sau khi chọn |
  |---|---|---|---|---|
  | interest | `NOT_REACHED` | Chưa nghe máy | | |
  | interest | `UNDETERMINED` | Chưa xác định | | |
  | interest | `NOT_INTERESTED` | Không quan tâm | | Có |
  | interest | `LIFE` | Quan tâm nhân thọ | Có | Có |
  | interest | `HEALTH_CARD` | Quan tâm thẻ rời | Có | Có |
  | care_status | `CARING` | Đang chăm sóc | | |
  | care_status | `WON` | Đã chốt | | |
  | care_status | `DROPPED` | Chốt xịt | | |
  | care_status | `NOT_INTERESTED` | Không quan tâm | | |
  | source | (trống) | Nguồn ban đầu lấy từ các nguồn lead đang dùng | | |
- **OPT-3** Chủ GA thêm giá trị (nhãn ≤ 60 ký tự), đổi tên, đổi thứ tự, ẩn / hiện. Mã của Nhu cầu / Trạng thái sinh từ nhãn (DATA-9); mã của Nguồn chính là nhãn (vì file nhập ghi nguồn bằng chữ). **Đổi tên chỉ đổi nhãn, không đổi mã**: lead đang mang giá trị không đổi.
- **OPT-4** Hai nhãn chỉ khác hoa / thường hoặc dấu được coi là trùng → `409 option_exists`.
- **OPT-5** Giá trị hệ thống không xóa được, chỉ ẩn → `409 option_built_in`. Giá trị có lead đang dùng không xóa được, chỉ ẩn → `409 option_in_use`. Giá trị GA tự thêm và không lead nào dùng thì xóa được.
- **OPT-6** Giá trị Nhu cầu GA thêm có thể đánh dấu "Tính là cơ hội" (cộng vào cột "Cơ hội" của Báo cáo chuyển đổi) và "Khóa sau khi chọn" (FC không đổi được nữa, như LEAD-14).
- **OPT-7** Giá trị Trạng thái hiện tại GA thêm **chỉ là nhãn**: không làm lead thành đã chốt hay thất bại, không đổi giai đoạn. Chỉ 4 mã hệ thống điều khiển giai đoạn (LEAD-16).
- **OPT-8** Giá trị bị ẩn rời khỏi ô chọn nhưng vẫn hiện đúng nhãn trên lead đang mang nó; sửa trường khác của lead không lỗi vì giá trị cũ đã ẩn. Gán giá trị không có trong danh mục hoặc đã ẩn → `400 unknown_option`.
- **OPT-9** Mọi người trong GA đọc được danh mục (mọi màn hình lead cần nhãn). Nhãn hiển thị lấy từ danh mục; nếu không có, hiện mã.
- **OPT-10** Nhập file lead chấp nhận cả nhãn GA đã đổi tên hoặc tự thêm (file 12, IMP-25).
- **OPT-11** Báo cáo chuyển đổi có một cột cho mỗi giá trị Nhu cầu (file 13).
- **OPT-12** Mọi thay đổi có audit (`lead_option`, trước/sau).
- **OPT-13** Nguồn: danh mục dùng cho ô lọc và form thêm lead; file nhập vẫn ghi nhận nguồn mới (thêm vào danh mục) **[QĐ đề xuất: OPEN]** - có bắt buộc nguồn phải nằm trong danh mục khi tạo tay không.

## 5.4 Danh mục chương trình bảo hiểm (PRG) [Cooked]
"Chương trình bảo hiểm" = danh sách GA dùng để chọn chương trình (sản phẩm) khi nhập tay hợp đồng (file 10).
- **PRG-1** Mỗi chương trình: `code`, `label` (≤ 200), `productRole` (`Chính` / `Bổ trợ`), `productCode` (mã sản phẩm DLVN trên 11_Products, tùy chọn), `active`, `sortOrder`.
- **PRG-2** Mọi GA bắt đầu với 3 chương trình: An Tâm Song Hành (`AN_TAM_SONG_HANH`, Chính), BH Chăm Sóc Sức Khoẻ (`BH_CHAM_SOC_SUC_KHOE`, Bổ trợ), BH Tai Nạn Cao Cấp (`BH_TAI_NAN_CAO_CAP`, Bổ trợ).
- **PRG-3** Ai sửa: người có `catalog.manage` (mặc định Admin) và Chủ GA. Mọi người trong GA đọc (mọi form hợp đồng cần).
- **PRG-4** Mã sinh từ nhãn (DATA-9) và không đổi khi đổi tên, để hợp đồng đang mang mã vẫn hiện đúng. Hai nhãn sinh cùng mã là cùng chương trình → `409 program_exists`.
- **PRG-5** Chương trình có hợp đồng dùng không xóa được, chỉ ẩn → `409 program_in_use`. Chương trình ẩn rời khỏi ô chọn nhưng vẫn hiện trên dòng hợp đồng đang mang nó.
- **PRG-6** `productCode` là mã DLVN nếu GA biết: dòng sản phẩm của hợp đồng nhập tay lấy `productCode` này (nếu có), nếu không lấy `code`. Điền đúng mã DLVN giúp lần nhập 04_Policy_Products sau khớp đúng dòng.
- **PRG-7** Tên chương trình và vai trò lấy từ danh mục, không gõ trên form (dòng hợp đồng vẫn có thể ghi đè vai trò).
- **PRG-8** Mọi thay đổi có audit (`insurance_program`).
- **PRG-9** **OPEN**: đồng bộ danh mục chương trình với 11_Products của DLVN (gợi ý chương trình từ danh mục sản phẩm toàn DLVN).
