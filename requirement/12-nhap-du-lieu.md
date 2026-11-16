# 12. Nhập dữ liệu (IMP)

## 12.1 Luồng chung (file Success và file lead)
- **IMP-1** Trình duyệt đọc file (SheetJS) và chỉ gửi các cột của mẫu, mỗi lần 500 dòng. Server không đọc file trên đường request (tốn CPU); file gốc được tải lên object storage (presigned) trừ khi rơi vào PDP-1.
- **IMP-2** Trạng thái: `PARSING` (đang nhận dòng) → `VALIDATED` (có bản xem trước) → `COMMITTED`; hoặc `FAILED`. Bắt đầu lần nhập mới thì lần nhập chưa xác nhận của chính người đó bị hủy (FAILED). Không ghi gì vào dữ liệu nghiệp vụ cho đến khi người nhập xác nhận.
- **IMP-3** Các bước:
  1. `POST /imports`: tên file, ngày snapshot, tiêu đề cột từng sheet → server lập kế hoạch từng sheet: sheet nhận được, sheet để sau (06, 08-10: "LATER"), thiếu cột bắt buộc (sheet BLOCKED), cột PDP bị cấm (lỗi, không bao giờ đọc), sheet người dùng không được nhập (BLOCKED `sheet_not_allowed`).
  2. `POST /imports/{id}/rows` từng phần: kiểm tra từng ô (kiểu, định dạng, danh mục); dòng tốt được đưa vào vùng đệm với khóa và chủ sở hữu; ô lỗi → dòng `importErrors`.
  3. `PUT /imports/{id}/file`: lưu file gốc (bỏ qua khi có cột bị cấm).
  4. `POST /imports/{id}/validate`: kiểm tra chéo dòng / chéo sheet (trùng, scope, quyền sở hữu, liên kết hợp đồng và tỉ lệ chia, quy tắc khách hàng, quy tắc bản ghi mới hơn của lead) → bản xem trước từng sheet: tìm thấy, mới, cập nhật, từ chối, bỏ qua, cảnh báo.
  5. `POST /imports/{id}/commit`: một transaction (hoặc job có thể chạy lại, mỗi sheet một transaction với file lớn) ghi các dòng đệm; ghi `recordChanges` cho mọi trường thay đổi của bản ghi đã có; dựng lại cây đại lý khi 01 thay đổi; tính lại liên kết khách hàng - đại lý; tự chuyển giai đoạn lead (LEAD-33); xóa vùng đệm; audit `IMPORT` kèm số liệu.
- **IMP-4** Thiếu cột bắt buộc chỉ chặn sheet đó; các sheet khác vẫn nhập.
- **IMP-5** Thiếu cột tùy chọn không bao giờ xóa giá trị đã lưu. **Trường GA tự quản lý** (số điện thoại khách hàng; tên / ngày sinh / giới tính người được bảo hiểm và thời hạn trên dòng chương trình) không bao giờ bị nhập file ghi hay xóa [Cooked].
- **IMP-6** Khóa là text; khóa bị Excel đổi thành số mất số 0 đầu được thêm lại theo độ dài mẫu (khách hàng 10, hợp đồng 9) kèm cảnh báo `padded_key`. Định dạng khóa: khách hàng = 10 chữ số, hợp đồng = 9 chữ số, đại lý = chữ số, hồ sơ = 4-20 chữ và số.
- **IMP-7** Giá trị danh mục phải khớp (không phân biệt hoa thường, khoảng trắng) hoặc dòng bị từ chối (`invalid_list`). Trạng thái hợp đồng và sản phẩm không có danh mục (lưu nguyên chữ). Có / Chưa (**NEW**: nhận thêm Yes/No, Y/N, 1/0).
- **IMP-8** Tiền và số đếm nhận `13000000`, `13.000.000`, `13,000,000`; phần trăm nhận `60%`, `60`, `0.6`; ngày `dd/mm/yyyy` (ngày không tồn tại bị từ chối); ngày giờ `dd/mm/yyyy hh:mm`; timestamp ISO có múi giờ hoặc `dd/mm/yyyy hh:mm` giờ Việt Nam; ngày-tháng `dd/mm`.
- **IMP-9** Khóa trùng trong một sheet (03_Policies: cùng hợp đồng và đại lý): dòng đầu thắng; các dòng khác bị từ chối `duplicate_key`.
- **IMP-10** Mọi bản ghi bị từ chối được liệt kê: sheet, dòng Excel, khóa (như ghi trong file), cột, mã, thông báo tiếng Việt; mức `error` (không nhập) hoặc `warning` (đã nhập, cần xem). Bản xem trước gom nhóm "Cần sửa và nhập lại"; tải được báo cáo lỗi Excel.
- **IMP-11** Mỗi màn hình nhập có "Tải file mẫu (Excel)" sinh từ chính định nghĩa cột.
- **IMP-12** Lịch sử nhập: của mình; có `imports.view_all` thì của mọi người; mỗi lần nhập: file, ngày snapshot, trạng thái, số liệu từng sheet, lỗi, ai, khi nào. Người dùng đã khóa / lưu trữ vẫn hiện tên trong lịch sử nhập (USER-10).
- **IMP-13** Hiệu năng: 2.000 dòng trên nhiều sheet kiểm tra và ghi dưới 30 giây; 20.000 dòng (**NEW**) dưới 3 phút qua worker có tiến độ.
- **IMP-14** File gốc giữ 90 ngày (vòng đời storage), không bao giờ giữ khi có cột bị cấm.

## 12.2 Phạm vi nhập (ai được ghi gì)
| Sheet | Người nhập không có `imports.tenant_wide` (và không phải Chủ GA) | Có `imports.tenant_wide` |
|---|---|---|
| 01_Agents | Không có `imports.agent_tree`: chỉ dòng của mình và tuyến dưới; không thêm đại lý, không đổi quản lý (lần nhập đầu của FC tạo được dòng của mình). Có quyền: tạo mọi đại lý, kể cả quản lý chỉ có trong `Quản lý`; không ghi đè `managerFixed` (cảnh báo `manager_fixed_kept`) | n/a (cần agent_tree) |
| 02_Clients | Nhận khi khách mới, đã liên kết với đại lý trong scope, hoặc file cũng có hợp đồng / hồ sơ của người nhập cho khách đó → không thì `client_out_of_scope`. Liên kết tạo ra: FC → `CLIENTS_SHEET` (sở hữu); quản lý / Chủ GA / người phạm vi rộng → `CLIENTS_SHEET_SCOPE` (chỉ thấy) [Cooked] | Cả GA (liên kết `CLIENTS_SHEET_SCOPE`) |
| 03_Policies | Đại lý của mỗi dòng phải trong scope → `out_of_scope` (FC chỉ ghi phần chia của mình) | Cả GA |
| 04_Policy_Products | Hợp đồng phải có trong cùng file hoặc đã nhập và trong scope → `policy_not_found` | Cả GA |
| 05_Applications | Đại lý trong scope; hồ sơ của đại lý ngoài scope không ghi đè được (`owned_by_other`) | Cả GA |
| 07_Activities | Đại lý trong scope; không bị chiếm (`owned_by_other`) | Cả GA |
| 13_Leads | Cần `leads.import` (cả GA); người được giao phải là đại lý của GA (`agent_not_found`) | n/a |

## 12.3 Hợp đồng, đại lý và tỉ lệ chia
- **IMP-15** File Success của một FC có một dòng mỗi hợp đồng: mã đại lý và tỉ lệ chia của FC đó. Chỉ thêm / cập nhật liên kết của đại lý đó; liên kết của đại lý khác giữ nguyên.
- **IMP-16** Dữ liệu GA (nhập toàn GA) có thể liệt kê mọi đại lý của hợp đồng, mỗi đại lý một dòng. Tổng tỉ lệ các dòng của một hợp đồng phải là 100% (một dòng 100% hoặc không ghi tỉ lệ là đủ); nếu không, mọi dòng của hợp đồng bị từ chối `split_total`. Với mọi người, hợp đồng có tổng vượt 100% bị từ chối.
- **IMP-17** Bộ dòng đủ 100% là bức tranh đầy đủ: đại lý không có trong file bị kết thúc (`endedAt`, giữ lịch sử), ví dụ chuyển đại lý; cảnh báo `servicing_changed` khi đổi đại lý phục vụ. Liên kết đã kết thúc trở lại khi đại lý xuất hiện lại.
- **IMP-18** Dòng đầu tiên của một hợp đồng trong file mang các trường của hợp đồng.
- **IMP-19** Liên kết hợp đồng - khách: PO từ `Mã KH BMBH` (nhận cả tiêu đề `Mã KH`), LI từ `Mã NĐBH chính` và `Mã NĐBH` của từng sản phẩm.
- **IMP-20** Liên kết khách - đại lý: xem file 10, CUS-4. Hợp đồng / khách nhập tay trùng khóa với file được file cập nhật (MAN-8, POL-5).
- **IMP-21** Mọi cột thay đổi trên bản ghi đã có được ghi `recordChanges` (thực thể, khóa, trường, cũ, mới, lần nhập, ai, khi nào); với tập đại lý của hợp đồng, trường `agents` lưu dạng `9000001:60;9000003:40` → `9000003:100`. Bản ghi mới và trường không đổi không ghi.
- **IMP-22** Dòng vắng mặt trong snapshot mới không bị xóa. **OPEN**: đánh dấu "không thấy trong N lần nhập gần nhất".

## 12.4 Nhập file lead
- **IMP-23** Màn hình "Nhập lead từ Excel" (`leads.import`): chọn file; chọn sheet (sheet hiển thị, ví dụ "Chia Lead"); tự tìm dòng tiêu đề (dòng trong 10 dòng đầu khớp nhiều tiêu đề biết nhất); tự ghép cột theo tên và tên gọi khác (file 19, mục 19.8); người dùng xác nhận hoặc sửa.
- **IMP-24** Ghép đại lý: cột đại lý có thể là mã hoặc tên gọi tắt ("Minh", "FC Trang"); mỗi giá trị khác nhau được ghép với một đại lý khi đúng một đại lý khớp (mã, họ tên hoặc tên, đã chuẩn hóa); người dùng xác nhận hoặc chọn; giá trị không ghép được để lead chưa phân công (hoặc dòng bị từ chối `agent_not_found` khi ghi mã không tồn tại).
- **IMP-25** Khớp theo số điện thoại đã chuẩn hóa. Nhãn trạng thái nhận theo cách GA viết: từ đồng nghĩa của giá trị hệ thống (LEAD-10, LEAD-11) **và nhãn trong Danh mục lead của GA** (giá trị đã đổi tên hoặc GA tự thêm) [Cooked]; ngoài ra bị từ chối và liệt kê. Nguồn mới trong file được ghi nhận (thêm vào Danh mục Nguồn).
- **IMP-26** **Bản ghi mới hơn thắng**: `updatedAt` của lead là thời điểm thay đổi dữ liệu gần nhất (thay đổi trên CRM đóng dấu giờ chính xác; nhập file đóng dấu "NGÀY CẬP NHẬT LEAD" của dòng lúc 00:00 giờ Việt Nam). Dòng file chỉ cập nhật lead đã có khi ngày của dòng sau `updatedAt`; nếu không, hoặc dòng không có ngày, giữ dữ liệu CRM và liệt kê dòng là để riêng (`lead_not_newer`, tính vào bỏ qua). Cùng ngày → CRM thắng.
- **IMP-27** Ô trống không xóa giá trị CRM. File chỉ cấp đồng ý liên hệ, không rút.
- **IMP-28** Lead mới: `leadDate` = ngày của dòng (hoặc ngày nhập); origin IMPORT; tạo chiến dịch theo tên nếu chưa có; lịch sử phân công đầu và việc 48 giờ (trừ khi dòng đã có trạng thái); tiến độ tư vấn → mục NOTE đầu tiên mang ngày của dòng.
- **IMP-29** Lead đã có được dòng cập nhật: cảnh báo `lead_exists`; lịch sử cho Nhu cầu / Trạng thái / người được giao / giai đoạn thay đổi (mang ngày của dòng, importId); tiến độ tư vấn đổi → mục NOTE mới; giao lại theo LEAD-22 và LEAD-9 (khóa FC_OWN → dòng bị từ chối `own_lead_locked`).
- **IMP-30** Ghi chú sức khỏe được lưu (PDP-2); cột CCCD / ngân hàng vẫn bị cấm.

## 12.5 Hoạt động Success (07_Activities)
- **IMP-31** Cột ở file 19, mục 19.6. `activityType` từ `activity_type_id`: 1 CHECKIN, 2 CALL, 3 SOCIAL_POST, 4 MEETING, 5 COACHING, 6 OTHER, 7 PROPOSAL (nhận cả "2 Calls", "Calls"...). Trạng thái: draft, submitted, approved, returned, rejected, locked.
- **IMP-32** `activityDate` = ngày Việt Nam của `started_at`; `phoneKey` = số khách đã che (4 số đầu + `***` + 3 số cuối) từ `customer_phone` (cột mới tùy chọn đã đề nghị Success / IT), nếu không có thì `call_phone_hash`, nếu không thì `customer_id` khi là số điện thoại.

## 12.6 Sheet để sau (trong phạm vi v2.1)
- **IMP-33** 06_Production_Monthly, 08_Activity_Movement, 09_Activity_Targets, 10_Agent_Monthly: cùng cơ chế nhập; dùng cho R4 (hoạt động so với mục tiêu) và R6 (sản lượng). Cột theo từ điển dữ liệu 00_README của mẫu (**OPEN**: xác nhận cột v1.1 trước khi xây).

## 12.7 Tương lai: luồng dữ liệu DLVN **NEW**
- **IMP-34** Thiết kế pipeline nhập để một luồng định kỳ (SFTP hoặc API từ DLVN) dùng lại cùng vùng đệm, kiểm tra và ghi, với nguồn `FEED` thay vì `UPLOAD`.
