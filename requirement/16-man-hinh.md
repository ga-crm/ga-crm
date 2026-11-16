# 16. Đặc tả màn hình

Điều hướng (desktop: menu trên; điện thoại: menu dưới cho đại lý: Hôm nay, Lead, Khách hàng, Lịch, Thêm):
Trang chủ / Hôm nay · Lead · Khách hàng · Chiến dịch · Báo cáo · Cây đại lý · Nhập dữ liệu · Người dùng · Phân quyền · Danh mục · Trợ lý AI (cài đặt) · Cài đặt GA · Các GA (nền tảng).

Mỗi màn hình: mục đích, ai dùng, bố cục, thao tác, quy tắc liên quan, tiêu chí nghiệm thu (AC).

## 16.1 Đăng nhập, kích hoạt, mật khẩu
- **Đăng nhập**: email, mật khẩu, (mã MFA); lỗi `invalid_credentials`, có rate limit; "Quên mật khẩu" (**NEW**); dòng "Chưa có tài khoản? Hãy liên hệ Chủ GA hoặc Quản trị viên để nhận link mời."
- **Kích hoạt tài khoản** (`/invite/{token}`): tên GA, email (chỉ đọc), mật khẩu + nhập lại; thành công thì đăng nhập và về trang chủ. AC: token hết hạn hiện `invite_invalid`; người được kích hoạt lại sau khi bị khóa / lưu trữ dùng đúng luồng này (USER-11).

## 16.2 Trang chủ / Hôm nay
- Đại lý (mobile-first): nội dung TASK-5; lối tắt "Thêm lead", "Thêm ghi chú".
- Quản lý: lead quá hạn của đội, góp ý tôi đã gửi chưa được đọc, hoạt động hôm nay của đội, link nhanh tới báo cáo.
- Chủ GA / Marketing: số lead chưa phân công, quá hạn, lead mới hôm nay, độ mới của file Success theo đại lý ("lần tải gần nhất": < 7 ngày bình thường, > 14 ngày tô đỏ).
- AC: FC có việc đến hạn hôm nay thấy việc đó ở đầu; Chủ GA thấy số chưa phân công bằng tab "Chưa phân công".

## 16.3 Danh sách lead ("Lead")
- Tab có đếm (LEAD-36), bộ lọc + "Xóa bộ lọc" (LEAD-35), bảng (LEAD-37) / kanban (**NEW**, cột theo giai đoạn có đếm, kéo thả theo LEAD-19; điện thoại: tab theo giai đoạn).
- Nhãn Nhu cầu / Trạng thái / Nguồn lấy từ Danh mục của GA.
- Thao tác: "Thêm lead" (form LEAD-3, nguồn chọn từ Danh mục; đại lý tạo lead tự khai thác), chọn nhiều ("Chọn tất cả trong trang", "Bỏ chọn") và "Phân công" ở thanh cố định chân màn hình (người quản lý lead; ô chọn "Họ tên (mã) — n lead"), "Nhập lead từ Excel" (`leads.import`), xuất (`exports.data`).
- AC: giao 50 lead một lần; FC thấy nhãn "Mới được giao" ở lần tải lại; quản lý tuyến thấy số bị che và không tìm theo số được.

## 16.4 Chi tiết lead
- Đầu trang: tên, nhãn (trạng thái, Lead tự khai thác, Mới được giao), số điện thoại (che theo PDP-3), người được giao, nguồn, chiến dịch, link quay lại.
- Tab: **Thông tin** | **Việc cần làm (n)** | **Lịch sử** (lịch sử thay đổi + "Lịch sử phụ trách", LEAD-28) | **Khách hàng liên kết** (**NEW**).
- Tab "Thông tin": cột trái thẻ "Thông tin" (các trường, "Sửa" cho người làm việc với lead; LEAD-8) và "Góp ý" (CMT); cột phải "Cập nhật trạng thái" (Nhu cầu với gợi ý khóa, Trạng thái hiện tại, lý do khi Chốt xịt, số hồ sơ / hợp đồng khi Đã chốt, "Hẹn liên hệ tiếp" ngày giờ; các ô chọn chỉ có giá trị đang hiện của Danh mục + giá trị lead đang mang) và "Ghi chú" (NOTE). Người không làm việc với lead: thay form trạng thái bằng ghi chú "Bạn đang xem lead của tư vấn viên trong nhóm…".
- Nút AI mở ngăn kéo với ngữ cảnh LEAD.
- AC: Đã chốt mà không có số → `won_needs_numbers`; quản lý tuyến góp ý được nhưng không đổi trạng thái (`lead_not_yours` nếu gọi API); mọi thay đổi hiện trong Lịch sử kèm tác giả; "Lịch sử phụ trách" hiện đúng số ngày giữ và số lần liên hệ của từng người, người bàn giao 0 liên hệ tô đỏ.

## 16.5 Nhập lead
- Bước: file → sheet → tìm dòng tiêu đề → ghép cột (tự động, sửa được) → ghép đại lý (tự động khi khớp duy nhất, chọn cho phần còn lại) → gửi dòng → xem trước (mỗi sheet: tìm thấy, mới, cập nhật, bỏ qua, từ chối, cảnh báo; danh sách "Cần sửa và nhập lại" kèm dòng, khóa, lý do; tải báo cáo Excel) → xác nhận.
- AC: nhập lại cùng file không đổi gì; dòng có ngày trước lần đổi gần nhất trên CRM bị để riêng `lead_not_newer`; ghi chú sức khỏe được lưu; cột căn cước không bao giờ được gửi; nhãn GA tự thêm trong Danh mục được nhận.

## 16.6 Danh sách khách hàng ("Khách hàng")
- Theo CUS-14: "Khách hàng của", tìm (tên, mã, số điện thoại), hạng, tab tín hiệu có đếm, bảng, nút "Thêm khách hàng", chọn nhiều + "Phân công cho" (Chủ GA; thanh cố định chân màn hình: "Đã chọn n khách hàng", "Chọn tất cả trong trang", "Bỏ chọn"; gợi ý "Chỉ Chủ GA phân công được. Đại lý của hợp đồng vẫn giữ khách này theo dữ liệu Success.").
- Form "Thêm khách hàng": các trường MAN-2 (Mã khách hàng 10 số, gợi ý "Nhập đúng mã khách hàng trên Success (10 số) thì lần nhập file sau sẽ cập nhật đúng khách hàng này, không tạo trùng."), "Khách hàng sẽ thuộc tư vấn viên được chọn" (quản lý / Chủ GA chọn đại lý theo cây), mục "Hợp đồng và chương trình bảo hiểm" (thêm nhiều hợp đồng, mỗi hợp đồng nhiều dòng chương trình; gợi ý "Mỗi dòng là một chương trình cho một người được bảo hiểm."), "Lưu khách hàng". Lỗi hiện dưới đúng ô. Mã đã có → `client_exists` (kèm "Xem khách hàng này" khi người dùng đã thấy khách đó).
- AC: mã 9 hoặc 11 số bị từ chối; quản lý không thêm được cho đại lý ngoài tuyến; Marketing / Admin không thấy nút; số hợp đồng trùng thì không tạo khách dở dang.

## 16.7 Chi tiết khách hàng
- Tab theo CUS-15: **Khách hàng & hợp đồng**, **Gia đình**, **Lịch sử** (+ **Lead nguồn** khi có liên kết).
- "Sửa thông tin" (MAN-6, gợi ý về trường bị file ghi đè), "Thêm hợp đồng" / "Sửa hợp đồng" (POL; gợi ý "Sửa cả hợp đồng và các chương trình trên đó. “Quyền lợi bảo hiểm” được tính từ số tiền bảo hiểm của các chương trình, nên sửa ở đây là nó cập nhật theo. Lần nhập file Success sau sẽ ghi đè các trường có trong file."), dòng chương trình theo thứ tự PRD-1 với ô chọn chương trình từ Danh mục.
- Người không sở hữu khách (quản lý tuyến): các nút sửa bị ẩn, có giải thích.
- AI ngăn kéo với ngữ cảnh CLIENT.
- AC: mở khách ghi VIEW_CLIENT; quan hệ gia đình gắn từ một phía hiện quan hệ ngược ở phía kia; lỗ hổng chỉ hiện khi có chi tiết sản phẩm; sửa số tiền bảo hiểm của một chương trình làm thẻ quyền lợi đổi đúng (thay, không cộng dồn); Chủ GA sửa được khách không do mình phục vụ.

## 16.8 Danh mục ("Danh mục") [Cooked]
- Chủ GA và Admin mở được. Thẻ **Danh mục lead** (chỉ Chủ GA sửa): ba danh sách Nhu cầu, Trạng thái hiện tại, Nguồn với giải thích:
  - Nhu cầu: "Tư vấn viên phân loại khách quan tâm gì. Mỗi giá trị là một cột trong Báo cáo chuyển đổi." Có cờ "Tính là cơ hội", "Khóa sau khi chọn".
  - Trạng thái hiện tại: "Bốn giá trị mặc định điều khiển giai đoạn của lead; giá trị bạn thêm chỉ là nhãn, không làm lead thành đã chốt hay thất bại."
  - Nguồn: "Lead đến từ đâu. Dùng cho ô lọc và form thêm lead; file Excel nhập vào vẫn ghi nhận nguồn mới."
  - Mỗi giá trị: tên hiển thị (sửa tại chỗ), "Hiện trong ô chọn", nhãn "Mặc định" cho giá trị hệ thống, thứ tự, nút xóa (chỉ giá trị GA thêm và chưa dùng); ô "Tên giá trị mới".
- Thẻ **Chương trình bảo hiểm** (Chủ GA + `catalog.manage`): tên, vai trò (Chính / Bổ trợ), "Mã sản phẩm Success" (gợi ý "Không bắt buộc. Nhập đúng mã trên sheet 11_Products nếu biết, để lần nhập file sau khớp đúng dòng này."), hiện / ẩn, thứ tự, xóa (khi chưa dùng); ô "Tên chương trình mới".
- AC: giá trị mặc định không xóa được; đổi tên không làm lead / hợp đồng đổi giá trị; giá trị đang dùng chỉ ẩn được.

## 16.9 Chiến dịch ("Chiến dịch") **NEW**
- Danh sách (tên, loại, ngày, ngân sách, số lead, đã chốt, chi phí mỗi lead), tạo / sửa (`campaigns.manage`), trang chiến dịch (CMP-3), điểm danh hội thảo (CMP-2), cài đặt form công khai và QR (CMP-4).
- AC: có ngân sách thì hiện chi phí mỗi lead và mỗi ca phát hành; form không tích đồng ý bị từ chối; số trùng thì thêm ghi chú vào lead có sẵn.

## 16.10 Báo cáo ("Báo cáo")
- Tab con theo báo cáo (R1-R8), bộ lọc thời gian, bảng dạng cây (RPT-1/2), bấm số để xem danh sách, xuất. R1 có cột theo từng giá trị Nhu cầu của Danh mục.
- AC: BM thấy "Ban kinh doanh {BM}" với tổng đội và dòng riêng của mình; FC chỉ thấy dòng mình; người quản lý lead thấy "Chưa phân công"; giá trị Nhu cầu GA thêm thành cột riêng.

## 16.11 Cây đại lý ("Cây đại lý")
- AGT-8. AC: đặt quản lý là người tuyến dưới bị từ chối (`manager_cycle`); lần nhập sau giữ liên kết đã sửa kèm cảnh báo.

## 16.12 Nhập dữ liệu Success ("Nhập dữ liệu")
- Tải file (mẫu v1.1) → kế hoạch từng sheet (sẵn sàng / không nhập kèm lý do / hỗ trợ sau) → tiến độ → xem trước kèm số liệu và lỗi → xác nhận → kết quả; lịch sử; tải mẫu.
- AC: file mẫu nhập 0 lỗi; dòng hợp đồng của đại lý ngoài scope chỉ từ chối dòng đó; 2.000 dòng ghi < 30 giây; số 0 đầu được giữ; cột bị cấm báo lỗi và file không được lưu; số điện thoại khách và trường người được bảo hiểm nhập tay không bị ghi đè.

## 16.13 Người dùng ("Người dùng")
- Danh sách (USER-7, lọc "Đã lưu trữ"), form mời (email, tên, vai trò, mã đại lý khi có vai trò đại lý), sao chép link mời, mời lại, thu hồi lời mời (chỉ USER-14), sửa vai trò / mã đại lý / tên / email (gợi ý "Địa chỉ dùng để đăng nhập. Đổi email không làm mất mật khẩu."), **Khóa**, **Lưu trữ** (xác nhận: "Người này sẽ bị đăng xuất ngay, mật khẩu và phiên đăng nhập bị xóa; dữ liệu và lịch sử được giữ nguyên."), **Kích hoạt lại** (tạo lời mời mới). Không có nút xóa người dùng đã kích hoạt.
- AC: Admin không tạo / khóa / lưu trữ được Chủ GA; không khóa được Chủ GA cuối cùng; người bị khóa / lưu trữ bị đăng xuất ngay và không đăng nhập lại được bằng mật khẩu cũ; thu hồi người đã có dữ liệu → `user_has_history`.

## 16.14 Phân quyền ("Phân quyền") (Chủ GA)
- Ma trận vai trò × quyền kèm nhãn và gợi ý; lưu; audit. AC: bỏ `imports.upload` của FC thì FC bị chặn màn hình nhập ở request kế tiếp.

## 16.15 Cài đặt trợ lý AI ("Trợ lý AI") (`ai.manage`)
- AI-37. AC: FC không mở được (403); khóa không bao giờ hiển thị lại sau khi lưu (chỉ ••••4 ký tự cuối); "Kiểm tra" báo rõ khóa sai; tải 5 file hiện 5 trạng thái; mô hình không còn trong danh sách provider có dấu ⚠.

## 16.16 Cài đặt GA ("Cài đặt GA") **NEW** (Chủ GA)
- Mục 5.2: hồ sơ và logo, danh sách phụ, quy tắc lead, giờ yên lặng, mức dùng gói (chỉ xem), xem audit (`audit.view`), yêu cầu xuất dữ liệu.

## 16.17 Console nền tảng ("Các GA") (Platform Admin)
- Danh sách tenant (trạng thái, gói, người dùng, hoạt động gần nhất, mức dùng AI), tạo tenant + Chủ GA đầu tiên, tạm ngưng / kích hoạt lại, xem người dùng (audit), cấp lại link mời, nạp danh mục sản phẩm 11_Products (cột `product_code`, `product_name`, `product_role`, `category`, `min_entry_age`, `max_entry_age`, `max_cover_age`, `gender`, `waiting_period`, `key_benefits`, `fit_rule`, `trigger_event`, `rule_status`), kho kiến thức toàn DLVN (**NEW**), bảng giá AI (**NEW**), gói dịch vụ (**NEW**).
