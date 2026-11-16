# Việc còn lại

Danh sách việc chưa làm, xếp theo thứ tự nên làm. Lập ngày 14/11/2026, sau khi xong các việc phát sinh từ câu trả lời ngày 14/11/2026.

Làm xong việc nào thì xóa dòng đó ở đây và ghi "Xong" ở [ROADMAP.md](ROADMAP.md). Chi tiết từng lát cắt nằm ở ROADMAP; câu hỏi đang chờ nằm ở [open-questions.md](open-questions.md).

## 1. Làm được ngay, theo thứ tự ưu tiên

| # | Việc | Nội dung | Ghi chú |
|---|---|---|---|
| 1 | Lát 8b: yêu cầu của chủ thể dữ liệu (PDP-6) | Ghi nhận yêu cầu xuất / xóa của một lead hoặc khách; xuất mọi dữ liệu về người đó (JSON, có audit); xóa lead dùng lại `mode: PDP` của lát 3b | Xóa khách nhập từ Success cần hỏi Product Owner trước, vì file Success sau có thể nhập lại khách đó |
| 2 | Lát 8c: danh mục sản phẩm và xuất dữ liệu GA | Nạp danh mục 11_Products (TENANT-5, `GET/POST /platform/products`); gợi ý chương trình bảo hiểm (câu 12c); xuất toàn bộ dữ liệu khi GA rời nền tảng (TENANT-6) | Quy trình duyệt quy tắc phù hợp sản phẩm còn chờ (mục 26, câu 3) |
| 3 | Lát 8d: gia cố | Correlation id trong log, `Idempotency-Key`, kiểm thử tải (k6), CI, Playwright | CI cần biến thư mục thành git repo (hiện chưa có commit nào) |
| 4 | Hạ tầng giai đoạn 3: việc chạy nền | BullMQ + worker cho vòng nhắc việc, nhập / xuất file, dọn `form_hits` và `import_rows`; chạy tiếp lần nhập lớn bị ngắt (hiện chỉ đóng lại); thông báo trong chuông khi nhập xong (NTF-2) | Ghi theo lô hiện chạy trong tiến trình API (decisions.md, mục "Nhập file lớn theo lô") |
| 5 | Test bắt buộc số 1 (mục 23.2) | Chứng minh GA-1 nhận 404 với mọi tài nguyên của GA-2, không chỉ người dùng | Nhiều module đã có test TEN-7 riêng; cần một bộ quét đủ mọi đường dẫn |

## 1b. Lỗi tìm thấy khi audit mã nguồn 17/11/2026

Ba lỗi mức cao và 11 lỗi mức trung bình đã sửa ngày 17/11/2026 (decisions.md, mục "Sửa lỗi mức cao sau audit" và "Sửa lỗi mức trung bình sau audit"). Các mục dưới đây là kết quả đọc mã, chưa chạy thử để tái hiện; nên viết test tái hiện trước khi sửa.

| Mức | Chỗ | Lỗi | Hướng sửa |
|---|---|---|---|
| Trung bình | `leads/leads.service.ts` lỗi trùng số | Trả `leadId` khi trùng số, quản lý tuyến dò được số đã che | Product Owner quyết: LEAD-1 yêu cầu trả, PDP-3 yêu cầu che |
| Trung bình | `auth/login-guard.service.ts` | 5 lần sai mỗi phút chặn cả mật khẩu đúng, nên ai có khoảng 30 địa chỉ IPv4 giữ được một email bị khóa liên tục (đã ghi nhận ngày 05/11 là chấp nhận) | Cân nhắc khi có Redis: giới hạn theo tài khoản chỉ đếm IP chưa từng đăng nhập thành công |
| Thấp | Frontend `lib/spreadsheet.ts` | Đọc file vẫn chạy trên luồng chính; file 20.000 dòng hợp lệ làm tab khựng vài giây | Chuyển sang Web Worker |
| Thấp | Nhiều chỗ | Quyền `crm_platform` trên mọi bảng; file chat 50 MB nạp trước khi kiểm tra thành viên; không giới hạn bắt tay socket; công việc không đi theo lead khi phân công lại; `import_errors` không giới hạn; nhãn audit còn mã nội bộ; URL lịch sai ngày làm vỡ trang; id chưa mã hóa trong đường dẫn API; `uuid` cũ trong `exceljs` | Gom vào lát 8d |

Cần Product Owner quyết: Admin có được đặt lại MFA của Chủ GA không (`test/mfa.e2e-spec.ts` hiện khẳng định là được); có trả `leadId` khi trùng số không.

## 2. Việc nhỏ còn sót

| Việc | Nội dung | Ghi chú |
|---|---|---|
| Danh mục | Thêm 2 danh sách phụ: "Nhu cầu chi tiết", "Loại chiến dịch" (có "Thêm nhiều") | Câu D; 3 danh sách kia đã xong |
| Cài đặt GA | Logo, lịch làm việc, giờ yên lặng | Mục 5.2, màn hình 16.16 |
| Nhật ký kiểm toán | Xuất file | Màn hình xem đã có |
| Ghi chú | Đính kèm ảnh / PDF tới 10 MB (NOTE-8) | Kho file MinIO đã có từ chat C4 |
| Realtime | Kanban cập nhật realtime | Giai đoạn 4, phần còn lại sau chat |
| Mã lỗi | Bổ sung các mã mới của v2.1 (đặc tả mục 20) | Có test bắt buộc mỗi mã có thông báo tiếng Việt |
| Kiểm toán | Tài khoản DB chỉ được insert / đọc bảng audit (AUD-1) | |
| Ngôn ngữ | `en.json` | Để sau |
| Lead | Tự phân công lead từ form / file (chia vòng, theo khu vực), mặc định tắt (LEAD-27) | Khi có GA cần |
| Hạ tầng giai đoạn 5 | Observability, diễn tập khôi phục; xóa hẳn `backend/` và volume MongoDB | Trước go-live |

## 3. Tạm hoãn theo yêu cầu Product Owner (11/11/2026)

| Việc | Nội dung |
|---|---|
| Lát 7b: trợ lý AI | 3 trợ lý mặc định, ngăn kéo "Trợ lý AI" trên mọi trang, router chọn tầng, ẩn danh, stream, mức dùng và hạn mức, audit `AI_READ`. Cần chọn thư viện gọi mô hình và có khóa API thật để thử |
| Lát 7c: kho kiến thức | RAG, tìm kiếm vector (ví dụ pgvector), trích nguồn |
| Lát 7d: luyện tập | Luyện xử lý từ chối, chấm điểm, tab Sử dụng, chi phí ước tính |

## 4. Đang chờ quyết định

| Câu | Cần gì | Đang chặn | Ai quyết |
|---|---|---|---|
| C | Chọn dịch vụ gửi email | Quên mật khẩu, gửi lời mời tự động (bắt buộc trước go-live, USER-3, USER-16), email báo tin chat chưa đọc, email tóm tắt hằng ngày | Product Owner, DevOps |
| E | Khóa Cloudflare Turnstile | Bật form lead công khai trên production | Product Owner, DevOps |
| G | Nhà cung cấp cloud | Sao lưu, PITR, chi phí | Product Owner, DevOps |
| H | Cách tổ chức chuỗi băm audit | Hiệu năng ghi khi nhiều người cùng ghi trong một GA | Pháp chế DLVN |
| B, 7 | Design system chính thức của DLVN | Chỉ cần đổi token trong `frontend/src/index.css` | DLVN |
| 1 | Nơi lưu dữ liệu, thời hạn lưu | Job tự xóa lead / người dùng đã lưu trữ / tin chat; hiện giữ tất cả | Pháp chế DLVN |
| 10 | Cột của sheet 06, 08, 09, 10 | Báo cáo R4 (hoạt động so với mục tiêu), R6 (sản lượng) | DLVN |
| 8, 9 | Ngân sách AI mặc định; các gói dịch vụ chuẩn | Lát 7, 8 | Product Owner |
| - | Mua giấy phép thương mại Highcharts (biểu đồ trang chủ) | Go-live | Product Owner |
| - | SSO OIDC cho nhân viên DLVN, kiểm tra mật khẩu bị lộ đầy đủ (USER-4, USER-16) | Trước go-live | Product Owner |
