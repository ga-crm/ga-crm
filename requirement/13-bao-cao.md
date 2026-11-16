# 13. Báo cáo và xuất dữ liệu (RPT)

## 13.1 Bố cục theo cây đại lý (mọi báo cáo đại lý)
- **RPT-1** Dòng đi theo cây đại lý người xem thấy: Chủ GA → BM → UM → FC. Quản lý có đội có **dòng nhóm** với tổng của cả đội, nhãn "Ban kinh doanh {tên}" cho BM, "Phòng kinh doanh {tên}" cho UM / SUM (còn lại "Nhóm {tên}"). Trong nhóm: **số của chính quản lý trên một dòng riêng**, rồi nhóm con, rồi cá nhân.
- **RPT-2** Nhóm thu gọn được; từ cấp thứ ba trở xuống mặc định thu gọn; có mở hết / thu hết.
- **RPT-3** Ai thấy gì: FC → dòng của mình; quản lý → tuyến của mình; Chủ GA và người có quyền báo cáo → tất cả, kèm "Chưa phân công" cho lead chưa giao trong báo cáo lead.
- **RPT-4** Bộ lọc thời gian (từ / đến, ngày Việt Nam; mặc định tháng này), chọn nhanh (tuần này, tháng này, tháng trước, quý này).

## 13.2 Danh mục báo cáo
| # | Tên | Nội dung | Tình trạng |
|---|---|---|---|
| R1 | Báo cáo chuyển đổi | Theo đại lý theo ngày lead: số lead, đã liên hệ (có liên hệ ghi nhận hoặc có trạng thái), liên hệ trong 24 giờ (chỉ liên hệ ghi trên CRM, trên lead có giờ), quá hạn, **một cột cho mỗi giá trị Nhu cầu trong Danh mục của GA** (cả giá trị GA thêm) [Cooked], số Đang chăm sóc / Đã chốt / Chốt xịt, **Cơ hội = tổng các giá trị Nhu cầu đánh dấu "Tính là cơ hội"** (mặc định LIFE + HEALTH_CARD) [Cooked], tỉ lệ chốt = Đã chốt / số lead | [PoC] + [Cooked] |
| R2 | Hoạt động đại lý | Theo đại lý theo ngày Việt Nam: gọi điện, Zalo, gặp mặt, hội thảo, đề xuất, đăng mạng xã hội, check-in, kèm cặp, khác; từ liên hệ CRM trên lead và khách hàng + 07_Activities Success (bỏ draft và rejected; cuộc gọi Success có call_type "zalo" tính là ZALO). Gọi điện, Zalo, gặp mặt cùng số đã che trong cùng ngày tính một lần (giữa và trong các nguồn); dòng không có số tính từng dòng. Cột thêm: tổng, từ CRM, từ Success, lead Đã chốt trong kỳ (theo người được giao hiện tại) | [PoC] |
| R3 | Phễu theo nguồn và chiến dịch | Lead theo nguồn / chiến dịch / nguồn SĐT → đã liên hệ → cơ hội → Đã chốt → đã liên kết / phát hành, tỉ lệ, chi phí mỗi lead / mỗi ca phát hành khi có ngân sách, APE phát hành từ hồ sơ liên kết | **NEW** |
| R4 | Hoạt động so với mục tiêu | Số liệu R2 so với 09_Activity_Targets theo đại lý và chương trình | **NEW** |
| R5 | Pipeline theo đội | Số lượng và APE dự kiến theo giai đoạn theo đội; thời gian nằm ở giai đoạn | **NEW** |
| R6 | Danh mục và sản lượng | Sản lượng (APE, số ca) theo đại lý / đội từ 05 và 06; danh mục ẩn danh (cơ cấu sản phẩm, phí, mất hiệu lực) cho Marketing | **NEW** |
| R7 | Khối lượng chăm sóc | Khách có tín hiệu theo đại lý (đến hạn, nợ, đáo hạn, sinh nhật, mất hiệu lực) và việc đã làm | **NEW** |
| R8 | Lần bàn giao lead **NEW** | Theo đại lý: số lead nhận, số lead bàn giao đi, số lead bàn giao mà 0 lần liên hệ, thời gian giữ trung bình (từ "Lịch sử phụ trách", LEAD-28) | **NEW** |
| R9 | Sử dụng AI | Token và câu trả lời theo người dùng / trợ lý / mô hình / loại việc (màn hình cài đặt AI) | [PoC] |

- **RPT-5** Mỗi con số là link tới danh sách lọc tương ứng trong scope người xem **NEW**.
- **RPT-6** Xuất Excel (`exports.data`): audit `EXPORT` kèm bộ lọc; Marketing xuất dữ liệu Success đã che; file dựng ở server (job với file lớn), tải một lần qua link ký hết hạn sau 15 phút.
- **RPT-7** Truy vấn báo cáo chạy trên aggregation tối ưu đọc; với tenant lớn chấp nhận snapshot ban đêm theo đại lý theo ngày (`dailyAgentStats`), hiện "dữ liệu tính đến".
- **RPT-8** Mọi khoảng tháng là nửa mở theo giờ Việt Nam (DATA-2): ngày cuối tháng (kể cả tháng 12) được tính, ngày 1 tháng sau không tính (bài học từ lỗi báo cáo sử dụng AI trong PoC).
