# 23. Kiểm thử và nghiệm thu

## 23.1 Chiến lược
- **Unit** (hàm nghiệp vụ, không DB): suy ra giai đoạn, nhóm quyền lợi, tín hiệu, ẩn danh, lọc câu sức khỏe, quy tắc từ khóa của router, chia đoạn, parser ô nhập, tính scope, `codeFromLabel`, tính "Lịch sử phụ trách".
- **Tích hợp** (API + MongoDB in-memory + provider AI giả + storage giả): quy tắc và lỗi của mọi endpoint; seed 2 GA demo với cây đầy đủ (GAD > BM > UM > FC, Marketing, Admin), Danh mục lead mặc định, 3 chương trình, file mẫu.
- **E2E** (Playwright): đăng nhập, mời → kích hoạt, tạo và giao lead, FC làm việc với lead, quản lý góp ý, nhập file lead, nhập Success, thêm khách và hợp đồng bằng tay, client 360, phân công khách hàng, Danh mục, hội thoại AI (provider giả), báo cáo, khóa / lưu trữ người dùng.
- **Contract**: OpenAPI sinh từ Zod; test kiểm response.
- **Đánh giá AI**: bộ hồi quy (AI-39) chạy khi đổi prompt / mô hình; kiểm tra lộ PII là cổng cứng.
- **Tải**: nhập và danh sách ở khối lượng mục tiêu trước khi ra mắt.

## 23.2 Kịch bản bắt buộc (từ 284+ test của PoC, test bổ sung của Cooked và quy tắc mới)
Tenant và scope
1. Người dùng GA-1 nhận 404 với mọi id tài nguyên của GA-2 (lead, khách hàng, hợp đồng, lần nhập, đại lý, người dùng, hội thoại AI, kho kiến thức, giá trị Danh mục, chương trình).
2. Schema guard: mọi collection có tenant có `tenantId` và plugin tenant; truy vấn thiếu điều kiện tenant bị ném lỗi.
3. Tìm kiếm có OR không thoát khỏi điều kiện tenant.
4. UM thấy mình + tuyến dưới, không thấy UM ngang cấp; FC thấy của mình; Chủ GA thấy hết; Marketing không thấy khách hàng.
5. Platform Admin đọc tenant ghi CROSS_TENANT_READ.

Người dùng và RBAC
6. Chỉ Chủ GA tạo / sửa / khóa / lưu trữ Chủ GA; không khóa / lưu trữ Chủ GA cuối cùng; không tự khóa / lưu trữ; link mời 7 ngày, dùng một lần.
7. Vai trò đại lý cần mã đại lý; mã đại lý duy nhất trong tenant giữa người dùng chưa lưu trữ; lưu trữ giải phóng mã.
8. Đổi email: chuẩn hóa, duy nhất toàn hệ thống, mật khẩu vẫn dùng được.
9. **Khóa / lưu trữ xóa mọi session và thông tin đăng nhập**: người dùng bị đăng xuất ngay, không đăng nhập lại bằng mật khẩu cũ; dữ liệu và lịch sử giữ nguyên và vẫn hiện tên; kích hoạt lại tạo lời mời mới.
10. **Không xóa cứng người dùng có dữ liệu** (`user_has_history`); chỉ thu hồi được lời mời chưa từng dùng và không có bản ghi tham chiếu.
11. Đổi ma trận quyền có hiệu lực ở request kế tiếp và có audit; GA-2 giữ ma trận riêng; migration cấp quyền mới cho tenant hiện có.

Cây đại lý
12. Dựng cây từ 01_Agents với ancestors; cắt vòng lặp; quản lý chưa có thành gốc; sửa tay được giữ qua lần nhập với `manager_fixed_kept`; chặn vòng lặp quản lý.

Danh mục
13. Danh mục lead mặc định có sẵn; Chủ GA thêm giá trị và lead mang được; giá trị thành cột trong Báo cáo chuyển đổi; "Tính là cơ hội" cộng vào Cơ hội.
14. Từ chối giá trị không có hoặc đã ẩn; giá trị lead đang mang vẫn hợp lệ khi sửa trường khác.
15. Giá trị hệ thống và giá trị đang dùng không xóa được; đổi tên không đổi mã của lead; chỉ Chủ GA sửa; GA khác có danh mục riêng.
16. Giá trị Trạng thái GA thêm không đổi giai đoạn; giá trị Nhu cầu có "Khóa sau khi chọn" khóa với đại lý.
17. Nhập file lead nhận nhãn GA đã đổi / tự thêm.
18. Chương trình: 3 mặc định mỗi GA; mọi người đọc; chỉ Chủ GA / catalog.manage sửa; hai nhãn cùng mã là trùng; đổi tên giữ mã; chương trình đang dùng chỉ ẩn được.

Lead
19. Số điện thoại duy nhất trong tenant; trùng trả 409 kèm leadId khi thấy được.
20. FC tạo FC_OWN giao cho mình; FC_OWN không giao lại được khi người tạo còn làm việc (bằng tay và bằng file); người tạo bị lưu trữ thì giao lại được.
21. Giao 200 lead một lần; giao lại hủy việc tự động cũ và tạo việc 48 giờ; ô chọn hiện số lead đang mở.
22. Khóa Nhu cầu với đại lý; người quản lý lead sửa được; Đã chốt cần số; Chốt xịt cần lý do; bảng suy ra giai đoạn.
23. Quản lý tuyến: số bị che, không tìm theo số, không sửa (lead_not_yours), góp ý được; cờ và tab góp ý chưa đọc.
24. Ghi liên hệ đặt liên hệ đầu / cuối, chuyển NEW → CONTACTED, hoàn thành việc 48 giờ; ghi chú thường thì không.
25. Ghi chú và góp ý cũ nhất ở trên; chi tiết trả người được giao và chiến dịch.
26. Đếm theo tab đúng cho FC, quản lý, người quản lý lead; quá hạn = giao > 48 giờ và chưa liên hệ.
27. "Lịch sử phụ trách": đúng người, ngày nhận / bàn giao, số ngày giữ, số liên hệ trong thời gian giữ; lead về đã có người được giao.

Nhập dữ liệu
28. File mẫu nhập 0 lỗi; số 0 đầu được giữ; khóa được thêm số 0 có cảnh báo.
29. Dòng ngoài scope bị từ chối riêng; thiếu cột bắt buộc chỉ chặn sheet đó; cột bị cấm không được gửi và file không lưu.
30. Hợp đồng chia: file FC chỉ cập nhật phần của mình; dữ liệu GA phải đủ 100%; bộ đủ kết thúc đại lý vắng mặt; quy tắc và cảnh báo đại lý phục vụ.
31. recordChanges chỉ ghi trường thay đổi.
32. File lead: bản ghi mới hơn thắng (mới hơn thì áp dụng, cùng ngày CRM thắng, không ngày thì để riêng), ô trống không xóa, đồng ý chỉ cấp, ghi chú sức khỏe được lưu, tiến độ đổi → NOTE, tạo chiến dịch.
33. 07_Activities phoneKey và gộp trùng trong báo cáo hoạt động.
34. 02_Clients: FC tải → khách là của FC; quản lý / Chủ GA tải → chỉ thấy, không thành khách của họ; danh sách "Khách hàng của" của họ không đổi.
35. Nhập file không ghi đè số điện thoại khách hàng và các trường người được bảo hiểm / thời hạn nhập tay; khách / hợp đồng nhập tay được file cập nhật đúng bản ghi, không tạo trùng.

Khách hàng
36. Khách thấy được qua vai trò hợp đồng / hồ sơ / tải file / nhập tay / phân công; VIEW_CLIENT có audit; chỉ hiện hợp đồng trong scope.
37. Thêm khách tay: đủ trường, audit; **mã phải đúng 10 chữ số** (9 / 11 số / có chữ bị từ chối); nhóm tuổi tự tính hoặc giữ giá trị nhập; mã đã có bị từ chối và chỉ được nêu khi người gọi đã thấy khách; quản lý chỉ thêm cho tuyến mình; Marketing / Admin không thêm được; Chủ GA không phải đại lý phải chọn đại lý.
38. Sửa khách: mọi trường, vắng = giữ, null = xóa, suy lại ngày-tháng sinh / nhóm tuổi; chỉ người sở hữu (và Chủ GA); quản lý tuyến bị từ chối; lỗi nêu đúng trường.
39. Số điện thoại khách: chuẩn hóa, tìm được, sai bị từ chối, xóa được, che trong audit.
40. Thêm hợp đồng tay cùng khách hoặc sau: đại lý 100% phục vụ; liên kết PO / LI; chương trình chỉ từ danh mục; người được bảo hiểm không phải khách vẫn ghi được (không tạo liên kết); số HĐBH trùng bị từ chối và không để lại khách dở dang; đại lý ngoài scope bị từ chối; trùng chương trình cho cùng người bị từ chối, khác người thì được.
41. Sửa hợp đồng: thay toàn bộ chương trình; thẻ quyền lợi tính lại (thay, không cộng dồn); chỉ hợp đồng của đúng khách; không đổi số HĐBH và đại lý phục vụ.
42. Phân công khách hàng: chỉ Chủ GA (hoặc clients.assign); thay liên kết tay cũ; bỏ phân công giữ đại lý của hợp đồng; khách của GA khác không tìm thấy; đại lý không phân công được kể cả khách của mình; cột tư vấn viên hiện người được phân công.
43. Chủ GA sửa được mọi khách của GA; Admin và Marketing không đọc / sửa được sổ khách hàng.
44. Gia đình: quan hệ ngược, gắn nhãn người chỉ có trên hợp đồng, người thân có ngày sinh một phần, Tạo lead, already_client, same_client, quy tắc sở hữu.
45. Nhóm quyền lợi và lỗ hổng chỉ khi có chi tiết sản phẩm; tín hiệu và đếm tab (0 khi trống).

Báo cáo
46. Bố cục cây với dòng riêng của quản lý và tổng nhóm; FC thấy dòng mình; dòng chưa phân công cho người quản lý lead; liên hệ 24 giờ chỉ với liên hệ có giờ trên CRM.
47. Khoảng tháng nửa mở theo giờ Việt Nam: ngày cuối tháng (cả tháng 12) được tính, ngày 1 tháng sau không.

AI
48. Provider không bao giờ nhận tên, số điện thoại (lead và khách), email, mã khách hàng, số hợp đồng, câu sức khỏe; token trả về kèm tên cho trình duyệt; AI_READ có audit.
49. Lead / khách ngoài scope → 404 khi tạo hội thoại (cả khi crmData tắt); hội thoại người khác 404; Marketing không có ai.use → 403; endpoint quản trị cần ai.manage.
50. Router chọn loại việc và tầng; câu hỏi nhanh bỏ qua router; trợ lý ghi đè mô hình / tầng; quy tắc từ khóa khi router lỗi; mô hình ngừng hỗ trợ → ai_model_unavailable; thiếu khóa → ai_provider_missing.
51. Kiến thức: chia đoạn theo tiêu đề, tìm không dấu, trích nguồn, chỉ kho gắn và đang bật, GA khác không thấy; tài liệu đổi tên được trích bằng tên mới.
52. Công cụ: list / get trả dữ liệu đã ẩn danh; token lạ không giải được.
53. Luyện tập: không công cụ / router; chấm một lần; quá ngắn bị từ chối; điểm sai định dạng 502; buổi đóng sau khi chấm.
54. Khóa provider: mã hóa khi lưu, không bao giờ trả, chỉ last4, khóa GA ghi đè khóa nền tảng, tách theo GA, khóa sai được báo, xóa thì dùng lại khóa nền tảng.
55. Vượt ngân sách → 429; tắt AI → 403; sử dụng theo người dùng / trợ lý / mô hình / loại việc.
56. Trợ lý tùy chỉnh: tên / vai trò / khả năng / câu hỏi nhanh tự do; crmData tắt thì không gửi dữ liệu CRM; tools tắt thì không gửi công cụ.
57. Nhãn Nhu cầu / Trạng thái GA thêm hiện đúng trong ngữ cảnh AI.
