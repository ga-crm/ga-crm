# 01. Bối cảnh kinh doanh, mục tiêu và phạm vi

## 1.1 Thị trường và các bên
- DLVN bán bảo hiểm nhân thọ và sức khỏe qua kênh đại lý. **Tổng đại lý (GA)** là công ty độc lập có đội ngũ riêng (hàng trăm đại lý), tổ chức theo hệ thống đại lý DLVN: FC → UM ("Phòng kinh doanh") → BM ("Ban kinh doanh") → GAD / Chủ GA.
- Mỗi GA tự tạo lead: fanpage và quảng cáo Facebook / Zalo, landing page, hội thảo, telesales, giới thiệu, khách tự khai thác của đại lý. Một GA thí điểm xử lý khoảng **300 lead mới mỗi tháng**, do Marketing chia cho FC.
- Hệ thống DLVN (Success) nắm dữ liệu gốc về **khách hàng, hợp đồng, hồ sơ YCBH và hoạt động đại lý**. GA không có API: đại lý xuất Excel từ Success cho danh mục khách hàng của mình.

## 1.2 Vấn đề
1. GA quản lý lead bằng Excel và Google Sheets ("Chia Lead"). Phân công, theo dõi trạng thái, chăm sóc và kèm cặp diễn ra trong file và nhóm chat. Không có audit; dữ liệu mất khi FC nghỉ.
2. Khi lead mua bảo hiểm, mối liên kết giữa lead (nguồn, chiến dịch, chi phí) và khách hàng / hợp đồng DLVN bị mất. GA không trả lời được: nguồn hay hội thảo nào ra doanh thu, FC nào chuyển đổi tốt, lead được liên hệ nhanh đến đâu, khách hiện hữu nào nên bán thêm.
3. Quản lý (UM / BM) không thấy pipeline của đội và không kèm cặp được trên ca thực tế.
4. FC không có một màn hình duy nhất về khách hàng: hợp đồng, gia đình, quyền lợi, phí đến hạn, sinh nhật, ghi chú nằm rải rác.
5. Không phải khách hàng nào cũng đã có trong file Success khi FC cần chăm sóc: FC cần **tự nhập khách hàng và hợp đồng** rồi để lần nhập file sau khớp lại [Cooked].
6. FC cần trợ giúp: hôm nay làm gì, xử lý từ chối thế nào, điều khoản sản phẩm nói gì, sản phẩm nào hợp với gia đình khách, nhắn gì cho khách. Kiến thức sản phẩm và quy trình nằm trong file PDF.

## 1.3 Giải pháp
Một web CRM đa tenant (mobile-first, cài được như app) nơi mỗi GA quản lý **pipeline lead** (thu nhận, phân công, trạng thái, liên hệ, ghi chú, việc cần làm, góp ý của quản lý), nhập **file xuất Success** của từng đại lý (và **nhập tay** khi chưa có file) để có **client 360** (hợp đồng, quyền lợi, gia đình, cơ hội chăm sóc), liên kết lead với khách hàng DLVN để **đo doanh thu theo nguồn**, báo cáo theo **cây đại lý**, và cung cấp **trợ lý AI** dựa trên dữ liệu CRM (đã ẩn danh) và kho kiến thức của GA.

## 1.4 Mục tiêu và chỉ số
| Chỉ số | Mốc PoC | Mục tiêu (3 tháng sau khi GA vận hành) |
|---|---|---|
| Lead quản lý trên CRM (so với file) | 0% | 95% |
| Thời gian trung vị từ phân công đến liên hệ đầu tiên | chưa đo | dưới 24 giờ; quá hạn (> 48 giờ) dưới 5% |
| Hợp đồng phát hành có liên kết nguồn lead | ~0% | 80% |
| FC hoạt động hàng tuần / tổng FC | n/a | 60% |
| FC tải file Success ít nhất mỗi tuần | n/a | 70% (cho đến khi có luồng dữ liệu từ DLVN) |
| Người dùng trợ lý AI hàng tuần / FC hoạt động | n/a | 40% |

## 1.5 Ngoài phạm vi (v2.1)
- Gửi SMS, Zalo, email cho khách từ CRM (chỉ ghi nhận liên hệ). **OPEN** cho v2.x: tích hợp Zalo OA.
- Tính hoa hồng, chi trả.
- Ghi ngược dữ liệu vào hệ thống DLVN.
- App native (chỉ PWA).
- Tự động khuyến nghị sản phẩm mà không có người kiểm tra (gợi ý AI luôn có nhãn và FC kiểm tra).

## 1.6 Bài học từ PoC cần giữ
- GA dùng **hai trạng thái** cho lead: "Nhu cầu" và "Trạng thái hiện tại"; giai đoạn pipeline được suy ra. Từ bản Cooked, **GA tự quản lý danh sách giá trị** của hai trạng thái này và nguồn lead.
- Quản lý muốn **kèm cặp chứ không sửa**: thấy lead của tuyến (số điện thoại bị che), để lại góp ý FC phải đọc.
- **Ghi chú và liên hệ là một câu chuyện**: một dòng thời gian "Ghi chú" với chip (gọi điện, Zalo, gặp mặt).
- Nhập dữ liệu là phần khó nhất: Excel mất số 0 đầu, tên cột khác nhau, file trộn nhiều đại lý, hợp đồng chia cho nhiều đại lý, bản ghi mới hơn phải thắng; mọi dòng bị từ chối phải liệt kê kèm khóa và lý do.
- Báo cáo đi theo **cây đại lý**, tách số của quản lý khỏi tổng của đội.
- Việc **ai sở hữu khách hàng** phải tách bạch với việc **ai được xem**: file Success của quản lý / Chủ GA phủ cả GA không được biến cả GA thành khách hàng riêng của họ [Cooked].
- AI không bao giờ được thấy danh tính khách hàng (PDP), phải theo ngữ cảnh màn hình, trích nguồn và tiết kiệm (định tuyến theo tầng mô hình).

## 1.7 Phạm vi và lộ trình
| # | Module | v2.1 (ra mắt thương mại) | Sau này |
|---|---|---|---|
| M1 | Tenant và quản lý GA (console nền tảng, cài đặt GA, Danh mục, gói dịch vụ) | Có | Tự đăng ký GA |
| M2 | Người dùng, lời mời, xác thực, RBAC, khóa / lưu trữ | Có (+ MFA, SSO cho nhân sự DLVN) | SSO theo GA |
| M3 | Cây đại lý | Có | Đồng bộ trực tiếp từ DLVN |
| M4 | Pipeline lead (thu nhận, nhập file, phân công, trạng thái, lịch sử phụ trách, kanban, form công khai) | Có | Mô hình chấm điểm lead |
| M5 | Ghi chú, góp ý, việc cần làm, lịch, "Hôm nay" | Có | Đồng bộ lịch Google / Outlook |
| M6 | Khách hàng: client 360, nhập tay khách hàng / hợp đồng, gia đình, quyền lợi, cơ hội chăm sóc, phân công khách hàng, liên kết lead | Có | Danh mục khách hàng ẩn danh cho Marketing |
| M7 | Nhập dữ liệu Success (sheet 01-07, 13) | Có; sheet 06, 08-10 | Luồng dữ liệu DLVN (SFTP / API) |
| M8 | Chiến dịch và hội thảo | Có | Nhập chi phí từ nền tảng quảng cáo |
| M9 | Báo cáo và xuất dữ liệu | Có (R1-R7) | Tự dựng báo cáo |
| M10 | Trợ lý AI | Có | Giọng nói, gợi ý chủ động |
| M11 | Thông báo | **NEW** Có | Zalo OA |
| M12 | Audit, PDP, yêu cầu của chủ thể dữ liệu | Có | |
| M13 | Gói dịch vụ và đo lường sử dụng | **NEW** Cơ bản | Thanh toán trực tuyến |

### Thứ tự xây (vertical slice; không bắt đầu slice mới khi test slice trước còn lỗi)
1. Nền tảng: repo, CI, môi trường, auth, tenant guard, audit, i18n, design system.
2. Tenant, người dùng, lời mời, RBAC, cây đại lý (tay + nhập 01_Agents), Danh mục.
3. Lead: tạo, danh sách, chi tiết, trạng thái, phân công, lịch sử phụ trách, góp ý, ghi chú, việc cần làm; nhập file lead.
4. Nhập Success 02-05, 07; danh sách và chi tiết khách hàng; nhập tay khách hàng / hợp đồng; danh mục chương trình; gia đình; cơ hội chăm sóc; phân công khách hàng.
5. Liên kết lead - khách hàng; tự động chuyển giai đoạn từ dữ liệu nhập; chiến dịch, hội thảo; form công khai.
6. Báo cáo R1-R7 và xuất; "Hôm nay"; lịch; thông báo.
7. AI: provider, khóa, router, trợ lý, kho kiến thức (vector search), luyện tập.
8. Gói dịch vụ / giới hạn, console nền tảng, yêu cầu chủ thể dữ liệu, gia cố, kiểm thử tải, ra mắt.
