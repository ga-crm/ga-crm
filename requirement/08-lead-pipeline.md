# 08. Pipeline lead (LEAD)

## 8.1 Định danh, nguồn gốc, sở hữu
- **LEAD-1** Mỗi số điện thoại một lead trong tenant (số đã chuẩn hóa, unique index). Tạo lead với số đã có → `409 phone_exists`, kèm `leadId` chỉ khi người gọi được mở lead đó.
- **LEAD-2** Nguồn gốc (`origin`):
  - `GA`: người quản lý lead (`leads.manage`) tạo trên CRM; có thể chưa phân công hoặc phân công ngay.
  - `IMPORT`: tạo từ file lead.
  - `FC_OWN` ("Lead tự khai thác"): đại lý không có `leads.manage` tạo; luôn giao cho chính người tạo; có nhãn trên danh sách và chi tiết.
  - `PUBLIC_FORM` **NEW**: tạo từ form công khai của chiến dịch.
  - `REFERRAL` **NEW**: tạo từ người thân của khách hàng ("Tạo lead" trên tab Gia đình) hoặc khách giới thiệu; liên kết ngược về khách hàng.
- **LEAD-3** Bắt buộc khi tạo: họ tên, số điện thoại, nguồn (chọn từ Danh mục Nguồn, file 05), câu trả lời đồng ý liên hệ (có hoặc không đều hợp lệ). Tùy chọn: email, khu vực, tỉnh/TP, giới tính, ngày sinh, chiến dịch (chỉ người quản lý lead), ghi chú đầu tiên, người được giao (chỉ người quản lý lead). Ghi chú đầu tiên thành mục NOTE đầu tiên.
- **LEAD-4** Chủ sở hữu theo scope là `assignedAgentCode`. Lead chưa phân công chỉ người có `leads.manage` thấy.
- **LEAD-5** `leadDate` ("Ngày cập nhật lead") = ngày lead về / được chia; đặt khi tạo (hoặc lấy từ file) và không bao giờ đổi.

## 8.2 Ai thấy, ai làm việc với lead
- **LEAD-6** Thấy: `leads.manage` → mọi lead của tenant; còn lại → lead có người được giao thuộc scope của mình.
- **LEAD-7** Làm việc (sửa, đặt trạng thái, ghi liên hệ, thêm ghi chú, quản lý việc cần làm): người được giao và người quản lý lead. Người khác thấy lead (quản lý tuyến) nhận `403 lead_not_yours` với các thao tác đó, thấy số điện thoại bị che (PDP-3), không tìm theo số được, và được góp ý (file 09).
- **LEAD-8** FC được giao sửa "Thông tin": họ tên, số điện thoại (duy nhất trong tenant; chuẩn hóa; `409 phone_exists` nếu trùng), ngày sinh, khu vực, tỉnh/TP, email, đồng ý liên hệ, và "Nhu cầu" (theo khóa ở LEAD-14). Chỉ người quản lý lead đổi nguồn và chiến dịch → nếu không: `403`.
- **LEAD-9** Khóa lead tự khai thác: lead FC_OWN không được giao cho người khác (bằng tay hay bằng file) khi người tạo còn làm việc cho GA (AGT-7) → `409 own_lead_locked` (dòng file bị từ chối cùng mã). Khi người tạo nghỉ (đại lý ngưng hoạt động / có ngày chấm dứt, hoặc tài khoản bị khóa / lưu trữ), người quản lý lead được phân công lại.

## 8.3 Hai trạng thái theo cách GA dùng
Giá trị của cả hai trạng thái nằm trong **Danh mục lead** do Chủ GA quản lý (file 05, mục 5.3). Bảng dưới là giá trị hệ thống và từ đồng nghĩa được chấp nhận khi nhập file.
- **LEAD-10** "Nhu cầu" (`interest`), phân loại ở lần liên hệ thành công đầu tiên:
  | Mã | Nhãn | Từ đồng nghĩa khi nhập |
  |---|---|---|
  | `NOT_REACHED` | Chưa nghe máy | Không nghe máy, Knm |
  | `UNDETERMINED` | Chưa xác định | |
  | `NOT_INTERESTED` | Không quan tâm | Không có nhu cầu, Không còn nhu cầu, Kcnc |
  | `LIFE` | Quan tâm nhân thọ | Nhân thọ, Quan tâm nhân thọ net |
  | `HEALTH_CARD` | Quan tâm thẻ rời | Thẻ rời, Thẻ rời nội trú, Thẻ rời nội+ngoại, Rời nội trú, Rời nội ngoại trú |
  | (GA thêm) | do GA đặt | chính nhãn GA đặt |
- **LEAD-11** "Trạng thái hiện tại" (`careStatus`):
  | Mã | Nhãn | Từ đồng nghĩa | Quy tắc |
  |---|---|---|---|
  | `CARING` | Đang chăm sóc | Chăm sóc thêm, Hẹn gọi lại, Quan tâm | |
  | `WON` | Đã chốt | | = đã nộp hồ sơ. Cần số hồ sơ (`^[A-Za-z0-9]{4,20}$`) hoặc số hợp đồng (9 số), ít nhất một → `400 won_needs_numbers` |
  | `DROPPED` | Chốt xịt | Dừng chăm sóc, Đã mua bên khác | Cần lý do → `400 lost_reason_required` |
  | `NOT_INTERESTED` | Không quan tâm | Không còn nhu cầu, Kcnc | |
  | (GA thêm) | do GA đặt | chính nhãn GA đặt | Chỉ là nhãn: không đổi giai đoạn (OPT-7) |
- **LEAD-12** Quan tâm cả nhân thọ và thẻ rời → `LIFE`.
- **LEAD-13** Đặt Nhu cầu hoặc Trạng thái lần đầu được tính là đã liên hệ: `firstContactAt` được đặt nếu đang trống.
- **LEAD-14** Khóa Nhu cầu: khi lead mang giá trị Nhu cầu có cờ "Khóa sau khi chọn" (`isFinal`; mặc định `LIFE`, `HEALTH_CARD`, `NOT_INTERESTED`), đại lý không đổi được → `409 interest_locked`; người quản lý lead sửa được.
- **LEAD-15** Giá trị không có trong danh mục hoặc đã ẩn → `400 unknown_option`; giá trị lead đang mang vẫn hợp lệ dù đã bị ẩn (OPT-8).

## 8.4 Giai đoạn pipeline (suy ra, có thể chỉnh tay)
- **LEAD-16** Giai đoạn: `NEW` Mới → `CONTACTED` Đã liên hệ → `APPOINTMENT` Đã hẹn gặp → `MET` Đã gặp → `PROPOSAL` Đã tư vấn / báo giá → `SUBMITTED` Đã nộp HSYCBH → `ISSUED` Đã phát hành HĐ; và `LOST` Thất bại.
- **LEAD-17** Suy ra `stageFor(care, interest, current)` (chỉ mã hệ thống có ý nghĩa):
  - care `WON` → `SUBMITTED` (giữ `ISSUED` nếu đã phát hành);
  - care `DROPPED` hoặc `NOT_INTERESTED` → `LOST`;
  - giai đoạn hiện tại `NEW` hoặc `LOST` và có Nhu cầu / Trạng thái bất kỳ → `CONTACTED`;
  - còn lại giữ nguyên.
- **LEAD-18** Ghi một liên hệ chuyển `NEW` → `CONTACTED`.
- **LEAD-19** **NEW (kanban)**: FC chuyển lead giữa `CONTACTED`, `APPOINTMENT`, `MET`, `PROPOSAL` bằng tay (kéo thả hoặc menu), có ghi chú tùy chọn; chuyển sang `LOST` cần lý do và đặt care `DROPPED`; chuyển sang `SUBMITTED` cần số hồ sơ / hợp đồng và đặt care `WON`. `ISSUED` chỉ hệ thống (LEAD-32) hoặc người quản lý lead đặt.
- **LEAD-20** Mọi thay đổi giai đoạn, Nhu cầu, Trạng thái, người được giao và các trường "Thông tin" ghi lịch sử lead (trường, cũ, mới, ghi chú, ai, khi nào, importId nếu do nhập file). Lịch sử đổi số điện thoại bị che với người thấy số bị che.

## 8.5 Phân công
- **LEAD-21** Người quản lý lead giao một hoặc nhiều lead (tối đa 200 mỗi lần) cho một đại lý của tenant, hoặc bỏ phân công (đại lý = null). Đại lý không tồn tại → `400 agent_not_found`. Lead không có trong tenant → `404`. Lead đã thuộc đại lý đó được bỏ qua. Trả về số lead đã giao.
- **LEAD-22** Khi giao (lại), với mỗi lead: đặt `assignedAgentCode`, `assignedBy`, `assignedAt = now`, xóa `assigneeSeenAt` (lead lại là "Mới được giao" với người mới), ghi lịch sử `assignee`, audit `ASSIGN` (từ → đến), hủy việc tự động "liên hệ trong 48 giờ" đang mở của người cũ, tạo "Liên hệ khách hàng trong 48 giờ" cho người mới (hạn = assignedAt + hạn liên hệ). Không tạo cho lead nhập file đã có trạng thái.
- **LEAD-23** Ô chọn người được giao hiện "Họ tên (mã) — n lead", với n là số **lead đang mở** của đại lý (lead có trạng thái khác `WON`, `DROPPED`, `NOT_INTERESTED`) [Cooked]; có ô tìm.
- **LEAD-24** Danh sách lead có chọn nhiều: "Chọn tất cả trong trang", "Bỏ chọn", và (NEW) "Chọn tất cả theo bộ lọc" (tối đa 200); thanh phân công cố định ở chân màn hình để không trôi mất khi chọn ở cuối trang [Cooked].
- **LEAD-25** Lần mở đầu tiên của người được giao đặt `assigneeSeenAt` (hết "Mới được giao"); mỗi lần mở đặt `assigneeViewedAt` (đánh dấu đã đọc góp ý).
- **LEAD-26** **NEW**: lead chưa đồng ý liên hệ không được giao vào chiến dịch TELESALES (cài đặt tenant).
- **LEAD-27** **NEW (tự phân công, tùy chọn)**: chia vòng hoặc theo khu vực cho lead từ form công khai / file nhập chưa có người được giao. Mặc định tắt.

## 8.6 Lịch sử phụ trách (LEAD-28) [Cooked]
- Trên chi tiết lead (tab "Lịch sử"), bảng **"Lịch sử phụ trách"**: lead đã qua tay những ai, mỗi người giữ bao lâu và liên hệ được mấy lần.
- Cột: Tư vấn viên · Nhận ngày · Bàn giao ngày ("Đang phụ trách" với người hiện tại) · Thời gian giữ (số ngày) · Lần liên hệ (số liên hệ CALL / ZALO / MEETING người đó ghi trong thời gian giữ).
- Tính từ lịch sử `assignee` theo thứ tự thời gian; lead về đã có người được giao (không có dòng "giao cho" đầu tiên) dùng người được giao ban đầu từ lúc tạo.
- Người đã bàn giao mà số lần liên hệ bằng 0 được tô đỏ (dấu hiệu bỏ lead).

## 8.7 Quy tắc thời gian
- **LEAD-29** Hạn liên hệ: lead đã giao phải được liên hệ trong 48 giờ (cài đặt tenant). **Quá hạn** ("Quá hạn 48 giờ") = đã giao, giao hơn 48 giờ trước, và chưa từng liên hệ (không có thời điểm liên hệ đầu, không Nhu cầu, không Trạng thái).
- **LEAD-30** "Liên hệ trong 24 giờ" (báo cáo) chỉ dùng thời điểm liên hệ ghi trên CRM: `firstContactAt - assignedAt ≤ 24 giờ`. Lead có trạng thái từ file không có giờ được tính "đã liên hệ" nhưng không "có giờ".
- **LEAD-31** "Hẹn liên hệ tiếp" (`nextActionAt`, ngày + giờ): đặt thì tạo việc nhắc theo hạn đó (thay việc nhắc cũ đang mở); xóa thì hủy việc đó.

## 8.8 Liên kết lead với khách hàng
- **LEAD-32** Trên lead từ `PROPOSAL` trở đi (hoặc `WON`), FC mở "Liên kết khách hàng". Hệ thống gợi ý tối đa 5 khách hàng trong scope của FC chưa liên kết với lead khác:
  - điểm: trùng `nameNorm` 0,6; cùng giới tính +0,1; cùng nhóm tuổi (hoặc lệch ≤ 3 tuổi) +0,1; có hồ sơ YCBH tạo trong 60 ngày sau khi tạo lead +0,2; **trùng số điện thoại** (số điện thoại khách hàng do GA nhập, file 10) +0,4 (tối đa 1,0);
  - mỗi gợi ý hiện điểm, tóm tắt hợp đồng và hồ sơ. FC cũng tìm được theo mã khách hàng, tên hoặc số điện thoại (trong scope);
  - xác nhận → `clientCode`, `applicationNo` tùy chọn, `linkStatus = CONFIRMED`, `linkedBy`, `linkedAt`, audit `LINK`. Một khách hàng chỉ liên kết với một lead → `409 client_already_linked`. Hủy liên kết cần lý do → audit `UNLINK`.
  - Gợi ý không bao giờ hiện khách hàng ngoài scope của FC.
- **LEAD-33** Tự động chuyển giai đoạn: sau khi một lần nhập Success hoàn tất, với mỗi lead đã liên kết: có hồ sơ YCBH → `SUBMITTED` (đặt care `WON` nếu trống); hồ sơ "Đã phát hành hợp đồng" hoặc có hợp đồng đã phát hành → `ISSUED`. Lịch sử mang importId. Không bao giờ lùi giai đoạn.
- **LEAD-34** Khách hàng đã liên kết hiện với người được giao lead và hiện nguồn, chiến dịch của lead trên trang khách hàng.

## 8.9 Danh sách, bộ lọc, đếm
- **LEAD-35** Bộ lọc: tìm (tên; số điện thoại chỉ người quản lý lead), Nhu cầu (kể cả "chưa có"), Trạng thái (kể cả "chưa có"), nguồn, chiến dịch, người được giao (kể cả "Chưa phân công"), khoảng ngày lead, quá hạn, mới, có góp ý chưa đọc, nguồn gốc, giai đoạn. Nút "Xóa bộ lọc" [Cooked].
- **LEAD-36** Tab có đếm trực tiếp:
  - mọi người: "Lead của tôi", "Mới được giao", "Có góp ý mới", "Quá hạn 48 giờ";
  - người quản lý lead / quản lý thêm: "Tất cả", "Chưa phân công", "Quá hạn".
- **LEAD-37** Cột: ngày, khách hàng (tên, số điện thoại che theo PDP-3, nhãn "Mới được giao", "Góp ý mới", "Lead tự khai thác"), nguồn (+ nguồn SĐT), người được giao, Nhu cầu, Trạng thái (màu theo 4 mã hệ thống; giá trị GA thêm màu trung tính), liên hệ gần nhất, hẹn tiếp, quá hạn.
- **LEAD-38** Sắp xếp mặc định: quá hạn trước, rồi hẹn tiếp gần nhất, rồi giao mới nhất. **NEW**: lưu bộ lọc theo người dùng.

## 8.10 Nhập file lead
- **LEAD-39** Khớp theo số điện thoại. Ô trống không xóa dữ liệu CRM. Bản ghi mới hơn thắng (file 12). Ghi chú sức khỏe trong file lead được lưu (PDP-2).

## 8.11 Xóa và gộp
- **LEAD-40** Người quản lý lead xóa lead tạo nhầm (xóa mềm, khôi phục trong 30 ngày, có audit) **NEW**. Xóa theo PDP theo PDP-6.
- **LEAD-41** **NEW**: gộp hai lead (khách đổi số): giữ một, chuyển ghi chú / liên hệ / việc / góp ý / lịch sử, audit cả hai.
