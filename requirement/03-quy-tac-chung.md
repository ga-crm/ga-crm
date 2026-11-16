# 03. Quy tắc chung (áp dụng cho mọi module)

## 3.1 Tách tenant (TEN)
- **TEN-1** Mọi collection nghiệp vụ có `tenantId` bắt buộc. Ngoại lệ được liệt kê rõ: `tenants`, `products` (danh mục sản phẩm DLVN dùng chung), kho kiến thức toàn DLVN (`tenantId` null, **NEW**), các collection của auth (con của users), `auditEvents` (`tenantId` null chỉ với sự kiện cấp nền tảng).
- **TEN-2** Mọi đọc / ghi đi qua repository nhận `Scope` và tự thêm `{ tenantId: scope.tenantId }`. Plugin Mongoose PHẢI ném lỗi khi truy vấn collection có tenant mà thiếu điều kiện tenant. Một test liệt kê mọi model và báo lỗi khi collection mới thiếu trường hoặc plugin ("schema guard").
- **TEN-3** Bản ghi của tenant khác được báo y như không tồn tại: `404 not_found` (không bao giờ `403`, vì lộ sự tồn tại).
- **TEN-4** Mọi index phức hợp bắt đầu bằng `tenantId`. Khóa tự nhiên là duy nhất trong tenant (ví dụ `{tenantId, clientCode}`).
- **TEN-5** Điều kiện tìm kiếm tự do luôn AND với điều kiện tenant và scope (PoC từng có lỗi OR thoát khỏi điều kiện tenant; PHẢI có test cho tìm kiếm).
- **TEN-6** Platform Admin truy cập một tenant qua `crossTenantScope()`, hàm này ghi audit `CROSS_TENANT_READ` trước khi trả dữ liệu.
- **TEN-7** Test bắt buộc: người dùng GA-1 nhận 404 với mọi id bản ghi của GA-2, ở mọi loại tài nguyên.

## 3.2 Phạm vi theo cây đại lý (SCOPE)
- **SCOPE-1** Tầm nhìn (reach) suy ra từ vai trò (lấy rộng nhất khi có nhiều vai trò):
  | Vai trò có | Reach | Bản ghi thuộc đại lý được thấy |
  |---|---|---|
  | GA_HEAD | TENANT | mọi bản ghi của tenant |
  | UM, BM hoặc GAD (mã đại lý X) | DOWNLINE | chủ sở hữu = X, hoặc thuộc tuyến dưới của X |
  | chỉ FC (mã đại lý X) | OWN | chủ sở hữu = X |
  | không có các vai trò trên (Marketing, Admin) | NONE | không thấy qua cây đại lý; quyền theo từng tính năng |
- **SCOPE-2** Tuyến dưới = các đại lý có mảng `ancestors` chứa X. Scope PHẢI tính từ database, không từ input.
- **SCOPE-3** Bản ghi của chính đại lý luôn thấy được, kể cả khi chưa nhập cây đại lý.
- **SCOPE-4** Quyền tính năng không mở rộng phạm vi dữ liệu, trừ `imports.tenant_wide` / `imports.agent_tree` (cho biết lần nhập được ghi cho ai) và `leads.manage` (thấy lead toàn tenant).
- **SCOPE-5** Chủ sở hữu theo thực thể: lead → `assignedAgentCode`; hợp đồng → mọi đại lý hiện hành trong `policy.agents`; khách hàng → xem file 10, mục "Ai thấy, ai sở hữu" (tách **thấy** và **sở hữu**); hồ sơ YCBH / hoạt động Success → `agentCode`; việc cần làm → người được giao lead.
- **SCOPE-6** Test bắt buộc: UM thấy dữ liệu FC dưới mình, không thấy UM ngang cấp; FC chỉ thấy của mình; Chủ GA thấy hết; Marketing không thấy khách hàng nào.

## 3.3 Quyền riêng tư, che dữ liệu và PDP (PDP)
- **PDP-1** Không bao giờ lưu số CCCD / CMND / hộ chiếu, số tài khoản ngân hàng, hoặc (trong file Success) dữ liệu sức khỏe. Cột nhập có tiêu đề giống loại dữ liệu này không bao giờ được trình duyệt đọc hay gửi, được liệt kê là lỗi, và file gốc khi đó không được lưu.
- **PDP-2** Ngoại lệ (chủ sản phẩm, 10/2026): thông tin sức khỏe FC ghi về lead (tiến độ tư vấn, file lead) được lưu như đã ghi, theo từng lead. Không đưa vào ngữ cảnh AI (PDP-7).
- **PDP-3** Che số điện thoại lead: quản lý tuyến (không phải người được giao, không phải người quản lý lead) thấy `0912***678` (4 số đầu + `***` + 3 số cuối), không tìm theo số điện thoại được, lịch sử đổi số cũng bị che với họ.
- **PDP-4** Marketing chỉ xem dữ liệu Success qua view đã che: tên viết tắt (`L. T. K.`), mã khách hàng thành hash có salt theo tenant, không có ngày sinh / ngày-tháng sinh, không số điện thoại, không điểm thưởng, không cờ người thụ hưởng; giữ giới tính, nhóm tuổi, hạng, hôn nhân, sản phẩm, số tiền bảo hiểm, phí, định kỳ, trạng thái, ngày, mã đại lý. Lead và chiến dịch Marketing xem đầy đủ.
- **PDP-5** Đồng ý liên hệ của lead (`consentMarketing`) lưu kèm nguồn và thời điểm; file nhập chỉ cấp, không bao giờ rút đồng ý.
- **PDP-6** Yêu cầu của chủ thể dữ liệu: xóa lead theo yêu cầu = xóa cứng các trường cá nhân (tên, số điện thoại, email, ngày sinh, nội dung ghi chú), giữ thống kê ẩn danh, có audit. **NEW**: xuất dữ liệu của một lead / khách hàng theo yêu cầu (JSON + PDF), có audit.
- **PDP-7** AI không bao giờ nhận danh tính: tên → token, số điện thoại / email / dãy số dài bị bỏ, mã khách hàng và số hợp đồng thành token, câu nói về sức khỏe trong ghi chú bị ẩn (file 14).
- **PDP-8** Mở trang chi tiết khách hàng ghi `VIEW_CLIENT`; mỗi lần AI đọc lead / khách hàng ghi `AI_READ`; xuất dữ liệu ghi `EXPORT`.
- **PDP-9** Số điện thoại khách hàng (trường GA tự quản lý, file 10) được che trong audit như số lead [Cooked].
- **PDP-10** Lưu trú dữ liệu và chuyển dữ liệu ra nước ngoài: **OPEN** (Pháp chế DLVN). Bản thương mại PHẢI có hồ sơ đánh giá tác động chuyển dữ liệu ra nước ngoài, danh sách bên xử lý phụ (cloud, nhà cung cấp AI) và region.

## 3.4 Audit (AUD)
- **AUD-1** Collection chỉ-ghi-thêm `auditEvents`: `{ tenantId|null, userId, action, entity, entityId, meta, ip, userAgent, at, prevHash, hash }`. User database của ứng dụng chỉ có quyền insert và find. `hash` = SHA-256 của sự kiện + `prevHash` theo tenant (chống sửa, **NEW**).
- **AUD-2** Hành động: `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `CREATE`, `UPDATE`, `DELETE`, `ARCHIVE`, `ASSIGN`, `LINK`, `UNLINK`, `IMPORT`, `EXPORT`, `VIEW_CLIENT`, `CROSS_TENANT_READ`, `AI_READ`, `PERMISSION_CHANGE`, `SETTINGS_CHANGE`, `DSR`.
- **AUD-3** Ghi audit trong cùng transaction với thay đổi.
- **AUD-4** `meta` không chứa bí mật (khóa API, mật khẩu, token); với khóa chỉ lưu 4 ký tự cuối; số điện thoại lưu dạng đã che.
- **AUD-5** Chủ GA xem và lọc audit của tenant (người dùng, hành động, thực thể, thời gian) và xuất (có audit). Thời gian lưu: **OPEN** (mặc định 5 năm).

## 3.5 Quy ước dữ liệu (DATA)
- **DATA-1** Khóa tự nhiên từ DLVN là **chuỗi** và giữ số 0 đầu: mã khách hàng (**đúng 10 chữ số, áp dụng cả khi nhập tay** [QĐ 11/2026]), số hợp đồng (đúng 9 chữ số), số hồ sơ YCBH (4-20 chữ và số), mã đại lý (chữ số), mã sản phẩm. Không bao giờ ép sang số.
- **DATA-2** Ngày từ Success là `dd/mm/yyyy`; lưu ngày lịch dạng chuỗi `YYYY-MM-DD`; lưu thời điểm dạng `Date` UTC; hiển thị theo `Asia/Ho_Chi_Minh` (UTC+7). "Hôm nay", "tháng này", ngày trong báo cáo đều tính theo giờ Việt Nam; một tháng là khoảng nửa mở [ngày 1 00:00 +07:00, ngày 1 tháng sau 00:00 +07:00).
- **DATA-3** Tiền VND là số nguyên. Nhập file chấp nhận `13000000`, `13.000.000`, `13,000,000`.
- **DATA-4** Số điện thoại chuẩn hóa thành `0xxxxxxxxx` (10 số; `+84` / `84` được đổi). Không hợp lệ → `invalid_phone`.
- **DATA-5** So khớp tên tiếng Việt dùng dạng chuẩn hóa: bỏ dấu, `đ` → `d`, viết hoa, gộp khoảng trắng (`nameNorm`).
- **DATA-6** Id: document do CRM tạo dùng ObjectId; khóa tự nhiên từ Success lưu nguyên dạng với unique index trong tenant.
- **DATA-7** Mọi endpoint danh sách có phân trang (mặc định 25, tối đa 50; lỗi nhập tối đa 500) và lọc theo scope ở server.
- **DATA-8** Không xóa dữ liệu nghiệp vụ khi nhập file (dòng vắng mặt trong snapshot mới được giữ). Xóa do người dùng là hành động tường minh, có audit. **Không xóa cứng bất kỳ bản ghi nào mà bản ghi khác đang tham chiếu** (người dùng, đại lý, chương trình, giá trị danh mục): dùng ẩn / khóa / lưu trữ [QĐ 11/2026]. Xóa theo PDP là xóa cứng các trường cá nhân.
- **DATA-9** Mã sinh từ nhãn (`codeFromLabel`): bỏ dấu, `đ` → `d`, viết hoa, ký tự khác chữ / số thành `_`, cắt gọn 40 ký tự (ví dụ "BH Tai Nạn Cao Cấp" → `BH_TAI_NAN_CAO_CAP`). Đổi nhãn không đổi mã [Cooked].

## 3.6 Ngôn ngữ và giao diện (UI)
- **UI-1** Giao diện tiếng Việt mặc định; mọi chuỗi lấy từ catalogue. Code, comment, tài liệu kỹ thuật, commit bằng tiếng Anh.
- **UI-2** Mọi mã lỗi API có thông báo tiếng Việt (file 20). Lỗi validate hiện **ngay dưới ô cần sửa** [Cooked].
- **UI-3** Mọi dòng lịch sử, ghi chú, góp ý, thay đổi đều hiện ai làm và khi nào.
- **UI-4** Trạng thái trống hướng dẫn bước tiếp theo (ví dụ "Chưa có khách hàng nào. Khách hàng có sau khi nhập dữ liệu Success (sheet 02-04), hoặc bấm “Thêm khách hàng” để nhập tay.").
