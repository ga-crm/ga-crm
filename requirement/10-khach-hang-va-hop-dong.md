# 10. Khách hàng và hợp đồng (CUS)

## 10.1 Vòng đời
```
Khách tiềm năng (lead: NEW → CONTACTED → APPOINTMENT → MET → PROPOSAL)
   → Đã nộp hồ sơ (lead WON / SUBMITTED; Success 05_Applications)
   → Khách hàng có hợp đồng phát hành (lead ISSUED, liên kết Mã khách hàng; Success 02-04 hoặc nhập tay)
   → Chăm sóc khi hợp đồng hiệu lực (phí đến hạn, nợ phí, APL, D-Connect, sinh nhật, lỗ hổng quyền lợi, gia đình)
   → Bán thêm / bán chéo / giới thiệu (người thân thành lead)
   → Đáo hạn, mất hiệu lực, khôi phục, bồi thường (tín hiệu; kiến thức dịch vụ qua AI)
```

## 10.2 Nguồn dữ liệu khách hàng
- **CUS-1** Khách hàng đến từ hai nguồn [Cooked, ghi đè CUS-1 bản 2.0]:
  1. **Nhập Success** (02_Clients, hoặc gián tiếp qua dòng hợp đồng / hồ sơ) - nguồn chuẩn;
  2. **Nhập tay** ("Thêm khách hàng", 10.5) cho khách FC đang phục vụ nhưng chưa có file Success.
  Khóa là Mã khách hàng (**đúng 10 chữ số** cả khi nhập tay [QĐ 11/2026]), nên lần nhập 02_Clients sau cập nhật đúng bản ghi đó, không tạo trùng.
- **CUS-2** Trường khách hàng từ Success: mã, tên, hạng (Thân thiết, Bạc, Vàng, Kim Cương), số HĐ còn / mất hiệu lực, ngày sinh, giới tính, hôn nhân (Độc thân, Đã kết hôn, Ly hôn), điểm thưởng, dùng D-Connect + lần đăng nhập gần nhất, "Đã cập nhật Căn cước" (chỉ cờ Có / Chưa, không bao giờ lưu số), đăng ký eKYC + thời điểm, ngày-tháng sinh (`dd/mm`), nhóm tuổi (<18, 18-29, 30-39, 40-49, 50-59, 60+).
- **CUS-3** **Trường GA tự quản lý** (không file Success nào ghi hay xóa) [Cooked]:
  - `clients.phone`: số điện thoại khách hàng, chuẩn hóa `0xxxxxxxxx` như số lead (`400 invalid_phone` nếu sai); được tìm trong danh sách khách hàng cùng tên và mã; được dùng cho gợi ý liên kết lead (LEAD-32); che trong audit.
  - Trên dòng chương trình của hợp đồng (10.7): tên, ngày sinh, giới tính người được bảo hiểm, thời hạn bảo hiểm (số năm).

## 10.3 Ai thấy, ai sở hữu khách hàng
Tách hai câu hỏi: **thấy** (được xem) và **sở hữu** (là khách của mình: quyết định "Khách hàng của", quyền sửa hồ sơ, số điện thoại, gia đình, ghi chú, hợp đồng nhập tay).
- **CUS-4** Liên kết khách hàng - đại lý (`agentLinks`, nguồn):
  | Nguồn | Tạo khi | Cho thấy | Cho sở hữu |
  |---|---|---|---|
  | `POLICY_HOLDER` / `POLICY_INSURED` | đại lý là đại lý hiện hành của hợp đồng mà khách là PO / LI | Có | Có |
  | `APPLICATION` | đại lý nộp hồ sơ YCBH cho khách | Có | Có |
  | `CLIENTS_SHEET` | **FC** (reach OWN) tải 02_Clients (file là sổ khách của chính FC) | Có | Có |
  | `CLIENTS_SHEET_SCOPE` | **quản lý / Chủ GA / người có phạm vi rộng hơn** tải 02_Clients (file phủ khách của đại lý khác) | Có | **Không** [Cooked] |
  | `MANUAL` | khách được thêm tay cho đại lý, hoặc được "Phân công khách hàng" | Có | Có |
  | lead liên kết (F7) | người được giao lead đã liên kết với khách | Có | Có (**NEW**) |
- **CUS-5** **Thấy**: khách hàng trong scope khi có liên kết bất kỳ ở bảng trên với một đại lý trong scope (FC: của mình; quản lý: tuyến; Chủ GA: tất cả). Marketing và Admin không thấy trang khách hàng (view che dữ liệu riêng, PDP-4).
- **CUS-6** **Sở hữu**: đại lý có liên kết cho sở hữu (bảng trên). **Chủ GA được coi là sở hữu mọi khách hàng của GA** (sửa được mọi khách) [Cooked]. Quản lý tuyến chỉ đọc khách của tuyến dưới (kèm giải thích). Không sở hữu mà sửa → `403 client_not_yours`.
- **CUS-7** "Khách hàng của" trên danh sách = khách mà đại lý được chọn **sở hữu** (không tính `CLIENTS_SHEET_SCOPE`), để danh sách cá nhân của quản lý / Chủ GA không biến thành cả GA [Cooked].
- **CUS-8** Chỉ hiện các hợp đồng của khách nằm trong scope người xem, kèm mọi đại lý và tỉ lệ chia của từng hợp đồng.
- **CUS-9** Mở trang khách hàng ghi `VIEW_CLIENT`.

## 10.4 Phân công khách hàng (ASG) [Cooked]
- **ASG-1** "Phân công khách hàng": chọn nhiều khách hàng (tối đa 200) trên danh sách → "Phân công cho" một đại lý của GA, hoặc bỏ phân công. Chỉ Chủ GA (hoặc người được cấp `clients.assign`, file 04). Đại lý (kể cả đại lý thường) không phân công được, kể cả khách của mình.
- **ASG-2** Mỗi khách hàng có **tối đa một** liên kết `MANUAL`: phân công lại thay thế liên kết cũ, không cộng thêm.
- **ASG-3** Bỏ phân công chỉ xóa liên kết `MANUAL`; đại lý trên hợp đồng vẫn giữ khách theo dữ liệu Success (phân công không đổi đại lý phục vụ của hợp đồng).
- **ASG-4** Mọi mã khách hàng phải thuộc GA → nếu không: `404`. Đại lý không tồn tại → `400 agent_not_found`.
- **ASG-5** Cột "Tư vấn viên" của danh sách hiện cả đại lý phục vụ hợp đồng và đại lý được phân công tay (khách chưa có hợp đồng vẫn hiện người phụ trách).
- **ASG-6** Thanh phân công cố định ở chân màn hình ("Đã chọn n khách hàng", "Chọn tất cả trong trang", "Bỏ chọn"). Có audit `ASSIGN client` (đại lý, số khách).
- **ASG-7** Marketing và Admin không bao giờ phân công khách hàng (họ quản lý lead, không quản lý sổ khách hàng).

## 10.5 Thêm và sửa khách hàng bằng tay (MAN) [Cooked]
- **MAN-1** "Thêm khách hàng" (trên danh sách khách hàng): dùng khi khách đã có hợp đồng ở Dai-ichi nhưng chưa nhập file Success. Người có reach khác NONE mới thêm được (Marketing, Admin → `403`).
- **MAN-2** Trường: **Mã khách hàng (bắt buộc, đúng 10 chữ số** → `400 invalid_input` với gợi ý "Mã khách hàng gồm đúng 10 chữ số" [QĐ 11/2026]), họ tên (bắt buộc), số điện thoại, hạng, ngày sinh, nhóm tuổi (để trống thì tự tính theo ngày sinh), giới tính (Nam / Nữ), hôn nhân, điểm thưởng, dùng D-Connect (không rõ / Có / Chưa), lần đăng nhập D-Connect gần nhất, đăng ký eKYC + thời điểm, "Đã cập nhật Căn cước" (chỉ Có / Chưa, gợi ý "hệ thống không lưu số căn cước"). `birthDayMonth` suy từ ngày sinh. Số HĐ còn / mất hiệu lực để cho file nhập (màn hình tự đếm hợp đồng).
- **MAN-3** Khách thuộc về đại lý nào: mặc định người thêm; quản lý chọn được đại lý trong tuyến; Chủ GA không phải đại lý thì phải chọn → `400 agent_required`. Đại lý ngoài scope → `400 agent_not_found`. Tạo liên kết `MANUAL` (khách là của đại lý đó, ai thêm cũng vậy).
- **MAN-4** Mã đã có trong GA luôn bị từ chối → `409 client_exists`; chỉ trả lại mã (để form gợi ý "Xem khách hàng này") khi người gọi đã thấy khách đó, để không dò được khách của đại lý khác. Không bao giờ "nhận" khách của người khác bằng cách gõ mã.
- **MAN-5** Có thể nhập kèm hợp đồng ngay trên form (mục "Hợp đồng và chương trình bảo hiểm", tối đa 10 hợp đồng); khách và hợp đồng lưu cùng một transaction: số hợp đồng bị từ chối thì không tạo khách dở dang.
- **MAN-6** "Sửa thông tin" (trang khách hàng): người sở hữu khách (CUS-6) sửa mọi trường hồ sơ; trường không gửi thì giữ nguyên, gửi `null` thì xóa; `nameNorm`, `birthDayMonth`, nhóm tuổi tính lại theo tên / ngày sinh. Mã khách hàng không sửa được (là khóa); đổi người phụ trách qua "Phân công". Gợi ý trên form: "Trừ số điện thoại do GA tự quản lý, các trường còn lại sẽ bị file Success ghi đè ở lần nhập sau."
- **MAN-7** Mọi thao tác có audit (`CREATE` / `UPDATE client`; số điện thoại che).
- **MAN-8** Lần nhập 02_Clients sau tìm đúng bản ghi theo mã và ghi đè mọi cột sheet có (trừ trường GA tự quản lý).

## 10.6 Nhập và sửa hợp đồng bằng tay (POL) [Cooked]
- **POL-1** "Thêm hợp đồng" (trên form thêm khách hàng và trên trang khách hàng): chỉ người sở hữu khách (CUS-6). Quản lý thấy khách tuyến dưới nhưng không thêm hợp đồng được → `403 client_not_yours`; khách ngoài scope → `404`.
- **POL-2** Trường hợp đồng: Số HĐBH (**đúng 9 chữ số**, chưa có trong GA → `409 policy_exists`), trạng thái hiệu lực (bắt buộc), ngày hiệu lực, ngày đáo hạn, định kỳ đóng phí (Năm, Nửa năm, Quý, Tháng), phí định kỳ / cơ bản (bắt buộc), ngày đến hạn đóng phí, phí dự tính, phí chưa đóng, nợ APL, đã có người thụ hưởng, mã + tên người được bảo hiểm chính (để trống = chính khách hàng), đại lý phục vụ (phải trong scope; để trống = người nhập hoặc đại lý của khách → `400 agent_required` / `agent_not_found`), các chương trình (tối đa 20, 10.7).
- **POL-3** Một hợp đồng nhập tay ghi: hợp đồng; một đại lý với **100%, là đại lý phục vụ**; liên kết PO (khách hàng) và LI (người được bảo hiểm chính); một dòng sản phẩm cho mỗi chương trình; chương trình bảo hiểm cho người khác có mã khách thì thêm liên kết LI nguồn PRODUCT. Hợp đồng đưa khách vào sổ của đại lý phục vụ (CUS-4).
- **POL-4** "Sửa hợp đồng": sửa các cột của hợp đồng; **các dòng chương trình bị thay toàn bộ** bằng các dòng form đang hiện (đây là cách sửa thẻ "Quyền lợi bảo hiểm", vì thẻ được tính từ số tiền bảo hiểm của các chương trình, không lưu riêng); liên kết PO / LI được ghi lại (phòng khi đổi người được bảo hiểm). **Không sửa được** Số HĐBH (khóa) và đại lý phục vụ (đại lý của hợp đồng do Success quyết). Hợp đồng phải thuộc đúng khách đang xem → nếu không `404`.
- **POL-5** Lần nhập 03_Policies / 04_Policy_Products sau cập nhật đúng hợp đồng theo Số HĐBH và ghi đè các cột sheet có; các trường GA tự quản lý trên dòng chương trình không bị ghi đè (10.7).
- **POL-6** Có audit (`CREATE` / `UPDATE policy`).
- **POL-7** **OPEN**: có cho xóa hợp đồng nhập tay sai không (đề xuất: chỉ khi chưa có lần nhập nào chạm vào, có audit; hợp đồng đã khớp với Success không xóa được).

## 10.7 Chương trình bảo hiểm trên hợp đồng (dòng sản phẩm)
- **PRD-1** Mỗi dòng = một chương trình cho một người được bảo hiểm. Thứ tự trên form (trái → phải, theo yêu cầu GA): tên người được bảo hiểm, ngày sinh, giới tính, chương trình, số tiền bảo hiểm, thời hạn bảo hiểm (năm, 0-120), tình trạng sản phẩm, mức phí (phí năm), vai trò (Chính / Bổ trợ; mặc định theo danh mục), ngày bắt đầu.
- **PRD-2** Chương trình **chỉ chọn từ Danh mục chương trình bảo hiểm** của GA (file 05, 5.4), không gõ tay → không có / đã ẩn: `400 unknown_program`. Tên chương trình lấy từ danh mục; mã sản phẩm = `productCode` của chương trình nếu có, không thì `code`.
- **PRD-3** Người được bảo hiểm có thể không phải khách hàng của GA: lưu tên, ngày sinh, giới tính dạng chữ. `insuredCode` (khóa, là mã khách hàng) chỉ chứa mã người được bảo hiểm chính khi tên trên dòng là của họ, ngược lại để `''` (không tự tạo liên kết khách hàng cho một cái tên).
- **PRD-4** Một chương trình chỉ ghi một lần cho mỗi người được bảo hiểm trên cùng hợp đồng → `409 program_repeated`. Cùng chương trình cho hai người khác nhau thì được.
- **PRD-5** Các cột `insuredName`, `insuredDob`, `insuredGender`, `termYears` là trường GA tự quản lý: sheet 04_Policy_Products không có, nên không lần nhập nào ghi hay xóa.
- **PRD-6** Dòng sản phẩm từ file Success: mã sản phẩm, tên, vai trò, mã người được bảo hiểm (trống = người được bảo hiểm chính), số tiền bảo hiểm, phí năm, chương trình (plan), ngày bắt đầu, trạng thái.

## 10.8 Hợp đồng và vai trò (dữ liệu Success)
- **CUS-10** Trường hợp đồng: số, mã PO, mã LI chính, đại lý phục vụ, tên PO / LI (+ chuẩn hóa), trạng thái (như Success ghi, ví dụ "Đang hiệu lực"; mất hiệu lực khớp theo "mất hiệu lực"), ngày hiệu lực, ngày đáo hạn, định kỳ, ngày đến hạn phí, phí dự tính, phí cơ bản, phí chưa đóng, nợ APL, có người thụ hưởng.
- **CUS-11** Vai trò: `PO`, `LI` (LI chính và người được bảo hiểm của từng sản phẩm), `BEN` (đã mô hình, chưa có cột nguồn; **OPEN**). Một khách có thể giữ nhiều vai trò trên nhiều hợp đồng. Liên kết PO / LI từ lần nhập mới thay liên kết cũ (liên kết cũ kết thúc, giữ lịch sử).
- **CUS-12** Hợp đồng chia cho nhiều đại lý: quy tắc nhập ở file 12. Đại lý phục vụ = đại lý hiện hành có tỉ lệ lớn nhất; bằng nhau → giữ đại lý phục vụ hiện tại, rồi theo thứ tự trong file. Mọi đại lý của hợp đồng chia thấy hợp đồng với mọi tỉ lệ.
- **CUS-13** Hồ sơ YCBH: số hồ sơ, số hợp đồng, đại lý, mã khách, tên PO, ngày tạo / nhận / phát hành, trạng thái (Đã phát hành hợp đồng, Đã hủy Hồ sơ YCBH, Đang chờ phát hành hợp đồng, Đang chờ NB hủy hồ sơ YCBH, Đang chờ NB xử lý, Đang chờ Thư thỏa thuận/Bổ sung thông tin), mã sản phẩm, APE.

## 10.9 Gia đình (FAM)
- **FAM-1** Gia đình = (a) người trên hợp đồng của khách trong scope (PO / LI), tự tìm; (b) quan hệ FC gắn nhãn; (c) người thân FC thêm, chưa là khách hàng.
- **FAM-2** Một bản ghi cho mỗi cặp `(clientCode, relatedClientCode)`, duy nhất trong tenant, `relation` theo phía khách: `SPOUSE` Vợ / Chồng, `CHILD` Con, `PARENT` Bố / Mẹ, `SIBLING` Anh / Chị / Em, `OTHER` Khác. Khách bên kia thấy quan hệ ngược (CHILD ↔ PARENT; còn lại đối xứng). Sửa từ phía bên kia thì lưu quan hệ ngược.
- **FAM-3** Gắn nhãn người khác: phải là khách trong scope người gọi hoặc người có trên hợp đồng của khách trong scope → không thì `404`; không phải chính khách → `400 same_client`.
- **FAM-4** Người thân chưa là khách: họ tên (bắt buộc), giới tính, ngày / tháng / năm sinh (mỗi phần tùy chọn), quan hệ, ghi chú (≤ 1000). Nếu thực ra là khách hàng → `409 already_client`.
- **FAM-5** 02_Clients chỉ liệt kê PO, nên con / vợ / chồng được bảo hiểm thường không có bản ghi khách: hiện từ hợp đồng (tên viết hoa chữ đầu từ tên LI / PO trên hợp đồng), có quyền lợi, gắn nhãn được, không có trang khách hàng.
- **FAM-6** "Tạo lead" trên người thân chưa là khách: tạo lead của FC (origin REFERRAL / FC_OWN, điền sẵn tên, cần số điện thoại) và liên kết với bản ghi gia đình (`leadId`); hoặc liên kết lead đã có mà FC thấy.
- **FAM-7** Tab Gia đình: bảng (tên, quan hệ, giới tính, ngày sinh, là / chưa là khách, hợp đồng chung kèm vai trò, tóm tắt quyền lợi, thao tác) và form "Thêm người thân" (người thân hoặc khách hàng có sẵn; tìm khách trong scope, tối đa 10 kết quả).
- **FAM-8** Chỉ người sở hữu khách sửa gia đình (CUS-6). Có audit.

## 10.10 Quyền lợi bảo hiểm (COV)
- **COV-1** Quyền lợi mỗi người = các sản phẩm đang hiệu lực (trạng thái sản phẩm trống hoặc "Đang hiệu lực", trên hợp đồng "Đang hiệu lực") mà người đó là người được bảo hiểm của sản phẩm (hoặc LI chính khi sản phẩm không ghi), cộng theo nhóm.
- **COV-2** Nhóm: `LIFE` Nhân thọ, `HEALTH` Sức khỏe, `CI` Ung thư / bệnh hiểm nghèo, `ACCIDENT` Tai nạn, `MATERNITY` Thai sản, `OTHER` Khác.
- **COV-3** Nhóm của sản phẩm: từ khóa trên `category` của danh mục 11_Products, rồi trên tên sản phẩm (đã chuẩn hóa), theo thứ tự: MATERNITY (THAI SAN, MATERNITY); CI (UNG THU, CANCER, HIEM NGHEO, CRITICAL); ACCIDENT (TAI NAN, ACCIDENT); HEALTH (SUC KHOE, HEALTH, Y TE, NOI TRU, HOSPITAL, MEDICAL, VIEN PHI); LIFE (LIFE, NHAN THO, TU KY, LIEN KET, TRON DOI, HUU TRI, UNIVERSAL, UNIT-LINKED, ENDOWMENT). Không khớp: sản phẩm Chính → LIFE, Bổ trợ → OTHER. (Ví dụ "BH Chăm Sóc Sức Khoẻ" → HEALTH, "BH Tai Nạn Cao Cấp" → ACCIDENT.)
- **COV-4** Lỗ hổng = thiếu HEALTH, CI, ACCIDENT; chỉ hiện với người có chi tiết sản phẩm. Không có chi tiết sản phẩm thì chỉ biết số hợp đồng ("Chưa có chi tiết sản phẩm").
- **COV-5** Thẻ "Quyền lợi bảo hiểm": bảng người (khách và gia đình) × nhóm, tổng số tiền bảo hiểm. Không lưu riêng: luôn tính từ dòng sản phẩm, nên sửa hợp đồng nhập tay (POL-4) là cách sửa thẻ [Cooked].

## 10.11 Cơ hội chăm sóc (SIG)
Chỉ là sự kiện. Gợi ý sản phẩm chỉ đến từ trợ lý AI và luôn có nhãn (file 14).
| Mã | Quy tắc | Hiển thị |
|---|---|---|
| `PREMIUM_DUE` | Khách là PO; hợp đồng hiệu lực; đến hạn phí trong 30 ngày tới | "HĐ {số} đến hạn đóng phí ngày {ngày} ({số tiền})" |
| `UNPAID` | Khách là PO; phí chưa đóng > 0 | "HĐ {số} còn phí chưa đóng {số tiền}" |
| `APL` | Khách là PO; nợ APL > 0 | "HĐ {số} có nợ APL {số tiền}" |
| `MATURITY` | PO hoặc LI; hiệu lực; đáo hạn trong 12 tháng | "HĐ {số} đáo hạn ngày {ngày}: trao đổi kế hoạch tiếp theo" |
| `NOT_ACTIVE` | Có hợp đồng không hiệu lực | "HĐ {số}: {trạng thái}" |
| `LAPSED` | Success báo số HĐ mất hiệu lực > 0 và chưa hiện NOT_ACTIVE | "Có {n} HĐ mất hiệu lực (theo Success)" |
| `BIRTHDAY` | Sinh nhật (ngày-tháng) trong tháng này | "Sinh nhật ngày {dd/mm}" |
| `GAP` | Khách hoặc người thân có chi tiết sản phẩm thiếu HEALTH / CI / ACCIDENT | "{tên} chưa có: {nhóm}" |
| `FAMILY_UNCOVERED` | Người thân không có quyền lợi hiệu lực (hoặc người thân chưa là khách) | "{tên} chưa có bảo hiểm" |
| `NO_DCONNECT` | Khách không dùng D-Connect | "Chưa sử dụng D-Connect: hướng dẫn cài đặt" |
- **SIG-1** Tab danh sách khách hàng có đếm (0 khi không có, không phải trống): "Đến hạn phí 30 ngày" (`due`), "Nợ phí / APL" (`debt`), "Đáo hạn 12 tháng" (`maturity`), "Sinh nhật tháng này" (`birthday`), "Có HĐ mất hiệu lực" (`lapsed`).
- **SIG-2** **NEW**: một chạm "Tạo việc" từ tín hiệu; job ban đêm báo đại lý tín hiệu mới (phí đến hạn trong 7 ngày, sinh nhật trong 3 ngày).

## 10.12 Danh sách và chi tiết khách hàng
- **CUS-14** Danh sách:
  - "Khách hàng của": chọn nhiều đại lý (mặc định khách đại lý đang đăng nhập **sở hữu**; quản lý tích FC của tuyến hoặc "Tất cả trong nhóm"; Chủ GA có "Xem toàn bộ khách hàng của GA"; server chỉ giữ đại lý trong scope; ẩn với reach OWN).
  - Tìm theo tên, mã, **số điện thoại**; lọc hạng; tab tín hiệu có đếm.
  - Cột: khách hàng (tên, mã, hạng, số điện thoại), hồ sơ (nhóm tuổi, giới tính), số HĐ hiệu lực, hạn phí gần nhất, tư vấn viên (ASG-5), nhãn tín hiệu; 25 dòng / trang.
  - Nút "Thêm khách hàng" (MAN-1); chọn nhiều + "Phân công cho" (ASG).
  - Trạng thái trống phân biệt: "Chưa có khách hàng nào trong danh sách này..." (khi bộ lọc "Khách hàng của" làm trống) và "Chưa có khách hàng nào..." (GA chưa có khách).
- **CUS-15** Chi tiết - tab [Cooked]:
  - **Khách hàng & hợp đồng** (một tab trả lời cả hai): trái "Thông tin khách hàng" (các trường hồ sơ, số điện thoại "Do GA tự quản lý", nhãn "Do tư vấn viên nhập tay, chưa có trong file Success" nếu khách nhập tay; nút "Sửa thông tin") + "Quyền lợi bảo hiểm"; phải "Cơ hội chăm sóc" + "Ghi chú"; bên dưới "Hợp đồng (n)" (thẻ hợp đồng: số, trạng thái, vai trò, đại lý và tỉ lệ, đại lý phục vụ, ngày, định kỳ, phí, phí chưa đóng, APL, các chương trình với người được bảo hiểm, nhóm, số tiền, thời hạn, phí; nút "Thêm hợp đồng", "Sửa hợp đồng") và bảng hồ sơ YCBH.
  - **Gia đình**: FAM-7.
  - **Lịch sử**: thay đổi trường do nhập file (`recordChanges` của khách và hợp đồng: trường, cũ → mới, lần nhập, ai, khi nào), mới nhất trước, tối đa 200.
  - **NEW** **Lead nguồn** (khi đã liên kết F7): nguồn, chiến dịch, dòng thời gian của lead.

## 10.13 Danh mục khách hàng ẩn danh cho Marketing **NEW**
- **CUS-16** Marketing có "Danh mục khách hàng (ẩn danh)": khách / hợp đồng / hồ sơ đã che (PDP-4) để phân tích danh mục (cơ cấu sản phẩm, phí, mất hiệu lực) và chọn phân khúc cho chiến dịch. Không truy ngược danh tính; xuất đã che và có audit.
