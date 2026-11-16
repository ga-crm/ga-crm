# GA CRM v2.1: Đặc tả sản phẩm và kỹ thuật (bản tiếng Việt, chia theo chủ đề)

| | |
|---|---|
| Sản phẩm | GA CRM: CRM bán hàng cho các Tổng đại lý (GA) của Dai-ichi Life Việt Nam (DLVN) |
| Chủ sản phẩm | John, nhóm Innovation DLVN |
| Phiên bản | 2.1 (bản nháp), 06/11/2026 |
| Kế thừa | `docs/GA-CRM-SPEC-v2.md` (bản 2.0, tiếng Anh) + các thay đổi trong bản PoC "Cooked" (`crm.btl-main`, GA Bắc Từ Liêm) + quyết định mới của chủ sản phẩm (xem [28-thay-doi-so-voi-v2.0.md](28-thay-doi-so-voi-v2.0.md)) |
| Mục tiêu | Bản thương mại, đa tenant. Stack: MongoDB, Next.js (React), LangChain |

## Cách dùng bộ tài liệu
- Mỗi file là một chủ đề, đọc độc lập được. Mã quy tắc (ví dụ `LEAD-14`, `IMP-26`, `CUS-20`) là "hợp đồng" giữa đặc tả, code và test: ghi mã quy tắc trong comment code và tên test.
- **MUST / MUST NOT** (BẮT BUỘC / KHÔNG ĐƯỢC) là quy tắc cứng, phải có test. **SHOULD** là mặc định trừ khi chủ sản phẩm quyết khác.
- Nhãn: **[PoC]** = đã xây và kiểm thử trong PoC; **[Cooked]** = có trong bản Cooked (đã kiểm thử); **NEW** = thêm cho bản thương mại; **OPEN** = cần chủ sản phẩm quyết; **[QĐ 11/2026]** = quyết định mới của chủ sản phẩm, ghi đè bản Cooked.
- Nhãn giao diện ghi bằng tiếng Việt như người dùng thấy; giá trị mã ghi bằng `monospace`. Thuật ngữ kỹ thuật giữ tiếng Anh khi cần (tenant, scope, lead, pipeline, API, schema...).
- "GA" = một tenant. "Agent" / "đại lý" = người bán trong hệ thống đại lý DLVN (FC, UM, BM...). "Trợ lý AI" luôn là tính năng AI, không phải đại lý.

## Mục lục
| # | File | Nội dung |
|---|---|---|
| 00 | [00-thuat-ngu.md](00-thuat-ngu.md) | Thuật ngữ |
| 01 | [01-boi-canh-va-pham-vi.md](01-boi-canh-va-pham-vi.md) | Bối cảnh kinh doanh, mục tiêu, phạm vi, lộ trình |
| 02 | [02-kien-truc-va-cong-nghe.md](02-kien-truc-va-cong-nghe.md) | Kiến trúc, stack, cấu trúc repo, pipeline request |
| 03 | [03-quy-tac-chung.md](03-quy-tac-chung.md) | Tách tenant, scope, PDP, audit, quy ước dữ liệu, ngôn ngữ |
| 04 | [04-vai-tro-va-phan-quyen.md](04-vai-tro-va-phan-quyen.md) | Vai trò, ma trận quyền (RBAC) |
| 05 | [05-tenant-va-cau-hinh-ga.md](05-tenant-va-cau-hinh-ga.md) | Quản lý GA, cài đặt GA, Danh mục lead, Danh mục chương trình bảo hiểm |
| 06 | [06-nguoi-dung-va-xac-thuc.md](06-nguoi-dung-va-xac-thuc.md) | Người dùng, lời mời, đăng nhập, khóa / lưu trữ |
| 07 | [07-cay-dai-ly.md](07-cay-dai-ly.md) | Cây đại lý |
| 08 | [08-lead-pipeline.md](08-lead-pipeline.md) | Lead: định danh, quyền, trạng thái, giai đoạn, phân công, lịch sử phụ trách |
| 09 | [09-ghi-chu-gop-y-viec-can-lam.md](09-ghi-chu-gop-y-viec-can-lam.md) | Ghi chú (nhật ký tương tác), Góp ý, Việc cần làm, lịch |
| 10 | [10-khach-hang-va-hop-dong.md](10-khach-hang-va-hop-dong.md) | Vòng đời khách hàng, client 360, nhập tay khách hàng / hợp đồng, sở hữu và phân công khách hàng |
| 11 | [11-chien-dich-va-form.md](11-chien-dich-va-form.md) | Chiến dịch, hội thảo, form công khai |
| 12 | [12-nhap-du-lieu.md](12-nhap-du-lieu.md) | Nhập dữ liệu Success và file lead |
| 13 | [13-bao-cao.md](13-bao-cao.md) | Báo cáo và xuất dữ liệu |
| 14 | [14-tro-ly-ai.md](14-tro-ly-ai.md) | Trợ lý AI |
| 15 | [15-thong-bao.md](15-thong-bao.md) | Thông báo |
| 16 | [16-man-hinh.md](16-man-hinh.md) | Đặc tả màn hình |
| 17 | [17-api.md](17-api.md) | Bộ API |
| 18 | [18-du-lieu-mongodb.md](18-du-lieu-mongodb.md) | Schema dữ liệu MongoDB, enum, ánh xạ từ PoC |
| 19 | [19-mau-file-nhap.md](19-mau-file-nhap.md) | Mẫu file Excel nhập dữ liệu |
| 20 | [20-ma-loi.md](20-ma-loi.md) | Danh mục mã lỗi và thông báo tiếng Việt |
| 21 | [21-giao-dien.md](21-giao-dien.md) | UI, UX, design system |
| 22 | [22-yeu-cau-phi-chuc-nang.md](22-yeu-cau-phi-chuc-nang.md) | Hiệu năng, bảo mật, sẵn sàng, PDP, lưu trú dữ liệu |
| 23 | [23-kiem-thu.md](23-kiem-thu.md) | Chiến lược kiểm thử, kịch bản bắt buộc |
| 24 | [24-chuyen-doi-tu-poc.md](24-chuyen-doi-tu-poc.md) | Chuyển dữ liệu từ PoC |
| 25 | [25-bai-hoc-kinh-nghiem.md](25-bai-hoc-kinh-nghiem.md) | Bài học và bẫy thường gặp |
| 26 | [26-cau-hoi-mo.md](26-cau-hoi-mo.md) | Câu hỏi mở cho chủ sản phẩm / DLVN |
| 27 | [27-huong-dan-ai-agent.md](27-huong-dan-ai-agent.md) | Xây và bảo trì bằng AI coding agent |
| 28 | [28-thay-doi-so-voi-v2.0.md](28-thay-doi-so-voi-v2.0.md) | Những gì thay đổi so với bản 2.0 |
