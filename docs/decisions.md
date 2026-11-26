# Decisions

Where this repo differs from `requirement/` (spec v2.1 since 2026-11-09), and what is still to be built. Rule IDs and section numbers below follow v2.1; entries written earlier were renumbered on 2026-11-09.

## 2026-11-05: differences from the spec

The project owner asked for NestJS, React and MongoDB in Docker. The spec (section 2.2) describes a Next.js monorepo. These follow from that request:

| Spec | This repo | Why | Impact |
|---|---|---|---|
| Next.js route handlers and Server Components | NestJS API + React SPA (Vite) | Owner's request | No server rendering. First paint comes from the client. |
| Better Auth | Own session module: random token in an HTTP-only cookie, SHA-256 hash in `sessions` | Better Auth targets the Next.js setup in the spec | Same behaviour as USER-17. MFA, reset and SSO must be built here. |
| Zod schemas shared by client and server, `zod-to-openapi` | class-validator DTOs and `@nestjs/swagger` on the API; Zod in frontend forms | Standard NestJS approach that drives Swagger UI | Validation is written twice, which section 2.1 #3 wanted to avoid. A shared contract package can be added later. |
| pnpm + Turborepo, `apps/*`, `packages/*` | npm, `backend/` and `frontend/` | Owner asked for backend and frontend projects | Move when shared packages are needed. |
| shadcn/ui, TanStack Table | Small Tailwind components in `frontend/src/components/ui.tsx`, plain tables | Enough for this slice | Revisit with the leads list. |
| MongoDB Atlas, mongodb-memory-server in tests | Docker single-node replica set; e2e uses database `ga_crm_test` | Owner's request | Atlas Search and Vector Search are not available locally; revisit at the AI slice. |
| `/api/v1/openapi.json` requires login | Served with Swagger UI, without login, outside production only | Easier local use | Disabled in production. |
| `accounts.password` (Better Auth) | `users.passwordHash` with `select: false` | No Better Auth | None. |

## 2026-11-05: UI follows requirement/desigin/desigin.md

The project owner asked to refactor the UI to this design system. It replaces the visual rules of section 21.1 (Dai-ichi tokens, pill badges, eyebrow headers) and the bottom navigation of section 21.2. Tokens live in `frontend/src/index.css`.

| Design system | This repo | Why |
|---|---|---|
| Proprietary variable typeface | Inter Variable | The document names it as a substitute; it has the required weight below 400 |
| Vendor name and logo | Own "GA" mark, no vendor branding | Only the visual language is adopted |
| 450 px interior hero band | Compact hero on the home page only; list pages get a plain title | Work screens need the table above the fold |
| 20 px table headers over 14 px cells, hairline rules between all rows | 14 px / 500 headers, hairline under the header, lighter `band` rules between rows | Readable density in wide tables such as the permission matrix |
| Blue is the only colour | One acting colour (blue by default, the user can change it), plus alert red for errors and destructive actions | Section 21.1 keeps red for errors |
| Lavender band, sky panel, gradient promo strip, floating button, link-column footer | Not used | No screen needs them yet |

## 2026-11-05: Cá nhân hóa và đổi mật khẩu

Bổ sung theo yêu cầu của chủ dự án, đặc tả chưa có các mục này.

| Nội dung | Cách làm | Lý do |
|---|---|---|
| `POST /auth/password/change` | Kiểm tra mật khẩu hiện tại, đăng xuất mọi thiết bị khác, cấp session mới | Đặc tả mục 17.2 chỉ có quên và đặt lại mật khẩu qua email |
| `users.appearance` qua `PATCH /me` | Lưu theo tài khoản, dùng được trên mọi thiết bị; `localStorage` chỉ để tránh chớp màn hình khi tải | Yêu cầu là cài đặt của từng người dùng |
| 5 chủ đề + theo hệ thống | Mỗi chủ đề chỉ đổi biến màu trong `index.css`; có test chặn việc đổi bo góc, cỡ chữ hay khoảng cách | Yêu cầu chỉ cá nhân hóa màu, không đổi viền |
| Màu nhấn tùy chọn | Tự chỉnh sáng/tối để đạt WCAG AA trên mọi chủ đề | Tránh tạo ra giao diện không đọc được; khác nguyên tắc "chỉ màu xanh hành động" của design system |
| Màu nhấn đỏ vẫn chọn được | Chưa chặn | Có thể nhầm với màu báo lỗi; chờ Product Owner quyết định nếu cần |

## 2026-11-05: Sidebar, state trên URL, quản trị mật khẩu

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Sidebar thay hàng tab | Thanh trên + sidebar, thu gọn còn icon, dạng drawer dưới 1024px. Khác "two-storey chrome" của design system và thanh dưới đáy ở mục 21.2 | Yêu cầu của chủ dự án; các module sau sẽ nhiều mục, không vừa một hàng ngang |
| State màn hình trên URL | Trang, bộ lọc, tìm kiếm, dialog nhập liệu đang mở nằm trong query string (`lib/useUrlState.ts`) | Reload, nút Back và chia sẻ link giữ nguyên vị trí |
| Không đưa lên URL | Mật khẩu, nội dung form đang gõ, link chứa token, hộp thoại xác nhận thao tác nguy hiểm | Tránh lộ bí mật qua lịch sử trình duyệt, tránh mở lại thao tác nguy hiểm khi reload |
| Từ khóa tìm kiếm trên URL | `q` có thể chứa họ tên, email | Đánh đổi để giữ state; API cũng nhận `q` qua query string. Cần xem lại khi làm PDP cho lead và khách hàng |
| Thao tác phụ trong menu "⋯" | Native Popover API | Cột thao tác không tràn khi nội dung hẹp lại vì sidebar |
| Popover tài khoản, `/settings/appearance`, `/settings/password` | Cấu hình cá nhân mở từ avatar, không nằm trong sidebar | Yêu cầu của chủ dự án |
| `POST /users/:id/password` | Người có `users.manage` đặt mật khẩu trực tiếp, người dùng bị đăng xuất mọi thiết bị | Yêu cầu của chủ dự án, đặc tả không có. Chưa bắt đổi mật khẩu ở lần đăng nhập sau |
| `POST /users/:id/password-reset` + `/auth/password/reset` | Link dùng một lần, hiệu lực 1 giờ (USER-16). Quản trị viên sao chép link vì chưa có email | Lỗi dùng `invite_invalid` theo mục 17.2, màn hình hiện thông báo riêng |
| `GET /auth/password/reset/:token` | Thêm so với mục 17.2 | Màn hình cần hiện email và báo link hỏng trước khi nhập mật khẩu |

## 2026-11-05: Khung cố định theo màn hình, mật độ cho PC

Theo yêu cầu của chủ dự án. Khác design system ở các điểm sau.

| Design system | Dự án | Lý do |
|---|---|---|
| Trang cuộn, các dải nối tiếp, footer | Khung bằng đúng chiều cao màn hình, chỉ vùng nội dung cuộn, bỏ footer | Là ứng dụng làm việc: tiêu đề, bộ lọc, phân trang luôn trong tầm mắt |
| Cột nội dung căn giữa có giới hạn | Nội dung dùng hết chiều rộng cạnh sidebar | Bảng rộng tận dụng màn hình PC |
| Tiêu đề trang 32px, control 44px | Tiêu đề 24px; control 36px từ 768px trở lên, vẫn 44px trên điện thoại | Mật độ phù hợp PC. Dưới 768px vẫn cuộn cả trang như cũ |
| Không có viền ở bảng | Viền trên phân trang và dưới tiêu đề bảng | Phân biệt phần cố định với phần cuộn |

Form: mỗi ô nhập luôn chừa sẵn một dòng lỗi (`Field`), lỗi chung của form có ô riêng (`FormError`), nên báo lỗi không đổi chiều cao. Lỗi từ API như `email_taken` hiện ngay tại ô liên quan. Ô mã đại lý luôn hiển thị thay vì chỉ hiện khi chọn vai trò đại lý, để modal không đổi chiều cao khi chọn vai trò.

Tên GA nằm trên header, canh theo cột nội dung cạnh sidebar. Breadcrumb bắt đầu từ nhóm (`Quản trị › Người dùng`) và nằm phía trên tiêu đề trang.

Cài đặt cá nhân chuyển từ popover avatar vào sidebar; avatar chỉ còn thông tin tài khoản và đăng xuất.

## 2026-11-05: Nhật ký hiện người thực hiện

`GET /audit` trả thêm `actor` và `target` để hiện theo UI-3. Tên chỉ lấy trong GA đang xem. Nhân sự DLVN hiện là "Quản trị nền tảng" thay vì họ tên. Người đã bị thu hồi lời mời hiện "Người dùng đã xóa", vì nhật ký không lưu tên vào `meta`.

## 2026-11-05: Tăng cứng đăng nhập và chống spam

**Giữ session phía server, không dùng JWT.** USER-17 yêu cầu thu hồi ngay khi khóa người dùng, và Actor được dựng lại từ DB ở mỗi request. JWT sẽ cần thêm danh sách thu hồi tra DB ở mỗi request nên không đổi được gì mà còn phức tạp hơn. Cookie là `HttpOnly`, `SameSite=Lax`, `Secure` và có tiền tố `__Host-` ở production; DB chỉ lưu SHA-256 của token.

**Khóa theo tài khoản + IP, không theo riêng tài khoản.** Nếu khóa theo tài khoản, ai cũng có thể khóa GA_HEAD chỉ bằng cách gửi sai mật khẩu. Tấn công từ nhiều IP vẫn chịu chung giới hạn 5 lần sai/phút theo tài khoản. Tài khoản không tồn tại được xử lý y hệt nên không lộ email nào có thật.

**Giới hạn hàng đợi băm mật khẩu ở 64.** Scrypt dùng 64 MB và khoảng 50 ms CPU mỗi lần, nên hàng đợi không giới hạn sẽ khiến mọi người cùng chờ. Quá mức thì trả 503 `server_busy` kèm `Retry-After`. Đo ở 1000 request cùng lúc từ 1000 IP giả lập: 926 bị từ chối ngay, lâu nhất 3,6 giây, `/health` p95 74 ms.

**Giới hạn IP chung nâng lên 3000/phút, thêm 600/phút theo người dùng.** Mục 17.1 ghi 600/phút và cả văn phòng GA có thể dùng chung một IP, nên 600 áp theo người dùng đã đăng nhập.

**Route đăng nhập cho 60 lần/phút theo IP, thay vì 10 như mục 17.1 (PO quyết định ngày 05/11/2026).** Cả văn phòng GA có thể dùng chung một IP, nên 10 lần/phút có thể chặn cả người nhập đúng mật khẩu vào đầu giờ sáng. Việc dò mật khẩu vẫn bị chặn bởi giới hạn số lần sai: 5 lần/phút theo tài khoản, 50 lần/15 phút theo IP và khóa tạm theo tài khoản + IP.

**Không dùng CORS.** Frontend và API cùng origin qua proxy. Yêu cầu ghi có `Origin` lạ, `Origin: null` hoặc `Sec-Fetch-Site` khác cùng origin đều bị 403.

**`TRUST_PROXY_HOPS` phải đúng khi triển khai.** Thấp quá thì mọi người bị tính chung IP của proxy; cao quá thì client giả được IP bằng `X-Forwarded-For`.

**Link cũ mất hiệu lực khi đổi vai trò hoặc trạng thái (ROLE-4).** Nếu không, người giữ link mời hoặc link đặt lại tạo từ trước có thể chiếm tài khoản vừa được nâng thành GA_HEAD. Người giữ `users.manage` không phải GA_HEAD cũng không tự đổi được vai trò và mã đại lý của mình.

## 2026-11-05: Badge có thêm màu trạng thái, bảng phân trang cố định cột

Theo yêu cầu của người dùng, badge có thêm xanh lá, hổ phách và tím ngoài các màu của design system để nhật ký dễ quét. Xanh dương vẫn là màu duy nhất cho thao tác; các màu mới chỉ dùng để gắn nhãn trạng thái và nhãn chữ vẫn mang ý nghĩa chính.

Trong nhật ký: đăng nhập và tạo mới màu xanh lá, cập nhật xanh dương, đăng xuất xám, đăng nhập thất bại hổ phách, xóa đỏ, đổi phân quyền và truy cập của nền tảng màu tím. Đăng nhập thất bại không dùng đỏ vì thường chỉ là gõ sai, còn đỏ dành cho thao tác phá hủy.

Các bảng phân trang dùng `table-layout: fixed` để cột không nhảy khi chuyển trang. Nội dung dài bị cắt và xem đầy đủ khi rê chuột.

## 2026-11-05: Bộ lọc bảng dữ liệu

Nhật ký lọc được theo email, IP, vai trò, hành động và sắp xếp theo thời gian; Người dùng lọc theo từ khóa, vai trò, trạng thái và sắp xếp theo lần đăng nhập gần nhất; GA lọc theo từ khóa và trạng thái. Trạng thái bộ lọc nằm trên URL nên giữ được khi tải lại và gửi link.

Theo yêu cầu của người dùng, bộ lọc không hiện nhãn phía trên: placeholder và lựa chọn mặc định ("Tất cả vai trò") đã đủ rõ. Tên bộ lọc vẫn có cho trình đọc màn hình.

**Lọc vai trò trong nhật ký dùng vai trò hiện tại,** vì sự kiện không lưu vai trò tại thời điểm xảy ra. Người vừa đổi vai trò sẽ hiện theo vai trò mới.

**Email và IP nằm trên URL** nên có thể xuất hiện trong lịch sử trình duyệt và log của proxy. Đây là đánh đổi để giữ được trạng thái lọc theo yêu cầu.

**Không lọc được nhân sự DLVN.** Tìm theo email, vai trò hay IP đều không trả về sự kiện của họ, để GA không dò được thông tin vốn bị ẩn.

**Bảng GA chưa sắp xếp theo hoạt động gần nhất,** vì giá trị này được tính từ bảng người dùng cho từng trang, chưa sắp xếp được ở DB nếu không lưu thêm dữ liệu.

## 2026-11-06: Router dùng createBrowserRouter và lazy load

Có dùng `createBrowserRouter`: mỗi màn hình là một chunk riêng, tải khi mở lần đầu hoặc khi rê chuột vào sidebar. Thư viện đọc Excel nặng khoảng 360 kB chỉ tải ở màn hình Nhập dữ liệu. Màn hình tải lỗi (mạng rớt, vừa có bản mới) hiện thông báo kèm nút tải lại, sidebar vẫn giữ nguyên.

Sidebar chỉ hiện tính năng đã làm xong và người dùng có quyền. Quyền chưa có tính năng hiện nhãn "Sắp có" ở trang chủ, thay vì để link hỏng.

## 2026-11-06: Cây đại lý và nhập dữ liệu

**Nhập tay ngoài đặc tả.** Mục 17.6 chỉ có đổi quản lý. Theo yêu cầu của người dùng có thêm `POST /agents` và `PATCH /agents/{code}`, dùng quyền `agents.edit_tree`, với các trường giống file mẫu.

**Chưa có object storage nên không lưu file gốc.** Khác IMP-1, IMP-14 và `PUT /imports/{id}/file`: file chỉ được đọc trong trình duyệt và không được lưu ở đâu cả. Cột cấm vì vậy cũng không bao giờ rời trình duyệt.

**Thông báo lỗi từng dòng nằm ở backend,** khác quy tắc mọi chữ nằm trong `vi.json`, vì mục 18.6 lưu `messageVi` cùng lỗi và báo cáo Excel do server tạo.

**Hai thư viện Excel.** Trình duyệt đọc file bằng SheetJS theo IMP-1, cài từ CDN chính thức của SheetJS vì bản trên npm đã cũ và có lỗi bảo mật. Server tạo file mẫu và báo cáo bằng `exceljs` vì cần dropdown và ghi chú ô. `npm audit` báo mức trung bình ở `uuid` trong `exceljs`, lỗi này chỉ xảy ra khi truyền buffer vào `uuid`.

**Mã bổ sung ngoài mục 20:** `agent_exists`, `import_too_large`, `manager_change_ignored` (người không có quyền đổi quản lý), `manager_cycle_split` (cảnh báo vòng lặp). Thêm `POST /imports/{id}/cancel` để hủy lần nhập.

**Vòng lặp chỉ cảnh báo trên dòng có trong file.** Nếu báo cả đại lý ngoài file, người tải lên có thể thấy mã đại lý ngoài nhánh của mình.

**Chỉ sheet 01_Agents được nhập.** Các sheet 02-10 và 13 báo "Chưa hỗ trợ" cho tới lát cắt 3 và 4. Vì vậy Marketing có quyền `imports.upload` nhưng chưa nhập được gì.

## 2026-11-06: Lead

**Phạm vi lát cắt 3 theo mục 1.7:** tạo, danh sách, chi tiết, trạng thái, phân công, góp ý, ghi chú, việc cần làm, nhập file. Các mục ghi NEW hoặc thuộc lát cắt sau được liệt kê ở bảng cuối file.

**Chiến dịch mới ở mức tối thiểu.** Chỉ có tên, được tạo khi nhập file (IMP-28) và chọn được khi tạo lead. Màn hình quản lý chiến dịch thuộc lát cắt 5.

**Thời hạn liên hệ 48 giờ là hằng số** cho tới khi có màn hình Cài đặt GA (Cài đặt GA (mục 5.2)).

**`GET /leads/{id}` trả `interactions` thay vì `notes` và `contacts` riêng,** vì NOTE-1 yêu cầu một dòng thời gian chung.

**Quản trị nền tảng chưa xem được lead.** LEAD-6 cho phép xem xuyên GA có kiểm toán; tài khoản này hiện nhận 403 cho tới khi có màn hình tương ứng.

**Nhập file: dòng Đã chốt không bắt buộc số hồ sơ, dòng Chốt xịt không bắt buộc lý do (người dùng chốt ngày 06/11/2026).** Mục 19.7 không có cột số hồ sơ, số hợp đồng, và mục 20.5 không có mã lỗi dòng cho hai trường hợp này. Từ chối sẽ làm mất nhiều dòng trong file GA đang dùng. Khi sửa trên CRM thì hai điều kiện này vẫn bắt buộc (LEAD-11).

**Nhập file không đặt `firstContactAt`.** Theo LEAD-30, trạng thái từ file được tính là đã liên hệ nhưng không đưa vào tỷ lệ đúng giờ.

**Số điện thoại 9 chữ số trong file được thêm lại số 0 kèm cảnh báo `padded_key`,** vì Excel thường cắt số 0 ở đầu.

**Kiểm toán khi nhập file:** một sự kiện `IMPORT` kèm số đếm, còn từng lần phân công nằm trong lịch sử lead kèm mã lần nhập. Không ghi `ASSIGN` cho từng dòng để file lớn không phải khóa chuỗi băm hàng nghìn lần.

**Giới hạn mỗi ô trong API nhập tăng lên 4001 ký tự,** khác giới hạn 2000 của mục 17.10, vì mục 19.7 cho tiến độ tư vấn tới 4000 ký tự.

## 2026-11-06: Nút đóng mở sidebar hình tròn

Theo yêu cầu của người dùng, nút trên mép sidebar là hình tròn, khác quy tắc không bo tròn của design system. Nút nằm ở độ cao cố định, ngang nhóm Đại lý với tài khoản có đủ hai mục trong nhóm Lead, để không xê dịch khi nhóm đóng mở.

## 2026-11-06: Modal rộng và validate form

Theo yêu cầu của người dùng, form dài dùng modal rộng ba cột để giảm chiều cao, và nền sau modal chuyển từ xanh sang xám.

Ngoài đặc tả, ngày sinh không được sau hôm nay, mọi ngày phải có thật và từ năm 1900 trở đi, kiểm tra ở cả giao diện và API. Ngày chấm dứt của đại lý phải không trước ngày bắt đầu, hiện mới kiểm tra ở giao diện.

## 2026-11-06: Dữ liệu demo và mật khẩu demo chung

Theo yêu cầu của người dùng, mọi tài khoản demo dùng chung mật khẩu `Demo@2026`, ghi thẳng trong README, thay cho `SEED_PASSWORD` sinh ngẫu nhiên trong `.env`. Mật khẩu này chỉ được đặt qua lệnh seed, và lệnh seed từ chối chạy khi `NODE_ENV=production`. Mật khẩu của tài khoản Quản trị nền tảng trong môi trường thật vẫn lấy từ `PLATFORM_ADMIN_PASSWORD`.

Dữ liệu demo đi qua các service thật nên lịch sử, việc cần làm và nhật ký kiểm toán đúng như ứng dụng tự ghi; sau đó một số ngày được lùi lại để có lead quá hạn. Nhật ký kiểm toán vẫn mang thời điểm chạy seed.

`seedDemoData` giữ nguyên làm dữ liệu nền cho test; phần đầy đủ nằm trong `seedShowcase`, để thêm dữ liệu demo không làm thay đổi các test hiện có.

## 2026-11-06: Thanh tiến trình và toast

**Thanh tiến trình dùng NProgress, chạy cả khi màn hình mới đang tải dữ liệu lần đầu.** Chỉ theo việc tải code thì thanh biến mất trước khi dữ liệu về. Làm mới ngầm và tải trước không hiện thanh vì không có ai đang chờ. Thanh giữ tối thiểu 250 ms để vẫn nhìn thấy khi màn hình mở ngay từ cache.

**Toast có màu theo trạng thái, là ngoại lệ của quy tắc "chỉ dùng đỏ cho lỗi và thao tác nguy hiểm, xanh cho hành động" (chủ dự án yêu cầu ngày 06/11/2026).** Dùng các token `success`, `warning`, `alert`, `band-blue` có sẵn nên đổi theo chủ đề. Vẫn không có bóng đổ.

**Lỗi không hiện hai lần.** Lỗi trong form và dialog vẫn hiện ngay tại chỗ, vì người dùng cần sửa ở đó. Thao tác ở cấp trang như xác nhận nhập file, lưu phân quyền, đánh dấu việc xong thì báo bằng toast lỗi.

**Khóa tài khoản và tạm đình chỉ GA dùng toast cảnh báo, không phải thành công.** Thao tác đã chạy nhưng có hệ quả cần chú ý. Tương tự, nhập file có dòng bị từ chối dùng toast cảnh báo.

## 2026-11-09: Chuyển sang đặc tả v2.1

Chủ dự án quyết định dùng `spec-v2.1-vi` (06/11/2026) làm đặc tả chính.

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Vị trí đặc tả | 28 file v2.1 nằm ở `requirement/`; bản 2.0 chuyển vào `requirement/v2.0/` và không được trích dẫn nữa. `spec-v2.1-vi/` giữ nguyên làm bản gốc | Mọi skill, `CLAUDE.md` và `npm run docs:rules` vẫn đọc `requirement/` |
| Mã quy tắc trong code | Đánh số lại theo v2.1: LEAD-15..38 → 16..41 (không đều, LEAD-28 mới là Lịch sử phụ trách), USER-6..11 → 10/12, 8, 16, 17, 18, 7 theo nội dung, TENANT-5 → mục 5.2, PERM-3 → PERM-4. Số mục (Section 20.9 → 17.10...) và số kịch bản test (test 12 → 21...) cũng đổi | Mã quy tắc là hợp đồng giữa đặc tả, code và test |
| Miền quy tắc mới trong chỉ mục | OPT, PRG, MAN, POL, PRD, ASG | Có trong v2.1 |
| Stack | Vẫn NestJS + React như mục đầu file này. v2.1 vẫn ghi Next.js + Better Auth | Không đổi quyết định cũ |
| Phần đã làm chưa khớp v2.1 | Ghi ở bảng cuối file và `ROADMAP.md`, chưa sửa code | Đổi hành vi cần làm theo từng lát cắt có test |

## 2026-11-09: Khóa, lưu trữ, kích hoạt lại, đổi email (mục 6.3)

Làm theo USER-6 đến USER-15. Các điểm đặc tả chưa nói rõ hoặc làm khác:

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Khóa / lưu trữ người `INVITED` đã có lịch sử | Cho phép. `invite_pending` chỉ trả khi người đó chưa có lịch sử | Người được kích hoạt lại về `INVITED` nhưng không thu hồi được (`user_has_history`). Nếu cũng không được lưu trữ thì không còn cách nào cho họ nghỉ |
| Thế nào là "có lịch sử" (USER-14) | Đã từng đăng nhập (`lastLoginAt`) hoặc có sự kiện kiểm toán do chính người đó thực hiện | Mọi thao tác đều được kiểm toán (AUD-3) và không ai thao tác được khi chưa đăng nhập, nên không cần dò từng collection |
| Kích hoạt lại người đang hoạt động / đang chờ | `409 not_invited` / `409 invite_pending` | Mục 17.4 chỉ liệt kê `forbidden`, `agent_code_taken` |
| Khóa người đã khóa, khóa người đã lưu trữ, lưu trữ người đã lưu trữ | 204, không đổi gì, không ghi kiểm toán | Bấm lại không phải lỗi; lưu trữ người đã khóa thì vẫn chuyển sang lưu trữ |
| Đổi email | Hủy link mời và link đặt lại mật khẩu đang chờ, phiên đăng nhập giữ nguyên | Địa chỉ cũ có thể chính là chỗ sai cần sửa; mật khẩu vẫn dùng được theo USER-6 |
| Lý do lưu trữ | Lưu ở `users.archiveReason`, không đưa vào `meta` kiểm toán | USER-15 chỉ yêu cầu trạng thái trước / sau; lý do là chữ tự do, có thể chứa thông tin cá nhân |
| `PATCH /users/{id}` | Không nhận `status` nữa; khóa, lưu trữ, kích hoạt lại dùng route riêng như mục 17.4 | Theo API v2.1 |
| Index mã đại lý | Index mới `tenantId_agentCode_unarchived` chỉ tính người chưa lưu trữ (USER-13). Khi khởi động, `UsersService` tự xóa index cũ `tenantId_1_agentCode_1` một lần | Chưa có cơ chế migration. DB dev hiện vẫn còn index cũ cho tới lần chạy backend kế tiếp |
| Ô chọn người được giao lead | Không đổi: vẫn lấy theo cây đại lý. Đại lý của người đã lưu trữ vẫn chọn được nếu đại lý đó còn hoạt động trên cây | USER-9 nói ẩn người đã lưu trữ khỏi ô chọn, nhưng ô chọn lead là đại lý, có cả đại lý không có tài khoản. Khi đại lý nghỉ, cây đại lý (01_Agents) sẽ đánh dấu ngưng hoạt động |
| Xóa thông tin đăng nhập (USER-10) | Xóa mật khẩu, phiên, link đặt lại, lời mời và MFA (`MFA_FIELDS`) | SSO chưa có; khi làm phải thêm vào cùng chỗ (`deactivate`) |
| Chữ "Mở khóa" | Bỏ. Người bị khóa chỉ quay lại qua "Kích hoạt lại" và đặt mật khẩu mới | USER-11: mật khẩu đã bị xóa khi khóa |

## 2026-11-09: Danh mục lead (mục 5.3)

Làm theo OPT-1 đến OPT-13, LEAD-14, LEAD-15, DATA-9, PERM-3, màn hình 16.8 (chỉ thẻ Danh mục lead) và API 17.5 (`/lead-options`).

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Khởi tạo giá trị mặc định (TENANT-2, OPT-2) | Lần đầu một GA đọc danh mục, hệ thống tạo 9 giá trị hệ thống và lấy các nguồn mà lead của GA đang dùng. Ghi bằng upsert nên nhiều request cùng lúc không tạo trùng | GA mới và GA đã có dữ liệu dùng chung một đường, không cần script migration |
| Nguồn khi tạo / sửa lead bằng tay (OPT-13, OPEN) | Giao diện chỉ cho chọn nguồn đang hiện. API: nguồn đã có thì dùng đúng cách viết trong danh mục, nguồn đã ẩn trả `unknown_option`, nguồn mới được thêm vào danh mục như khi nhập file | Câu hỏi 12a chưa có trả lời; cách này không làm hỏng client cũ. Đổi sang bắt buộc chỉ cần sửa `resolveSource` |
| Nguồn trong file | So khớp không phân biệt hoa thường và dấu với danh mục, lưu theo cách viết trong danh mục (`facebook` → `Facebook`) | Tránh một nguồn thành nhiều giá trị chỉ vì cách gõ |
| Nhãn trong file (IMP-25) | Nhãn GA đặt được so trước, rồi mới tới từ đồng nghĩa của giá trị hệ thống. Giá trị đã ẩn bị từ chối với `invalid_list` | OPT-8: giá trị ẩn không được gán mới |
| Trạng thái GA thêm (OPT-7) | Không đổi giai đoạn, kể cả khi lead đang Thất bại hay Đã nộp. Vẫn đặt `firstContactAt` (LEAD-13) và vẫn tính là đã phân loại, nên không còn bị tính quá hạn | Đặc tả nói "chỉ là nhãn"; LEAD-13 nói đặt trạng thái lần đầu là đã liên hệ |
| Bộ lọc Nhu cầu / Trạng thái trên `GET /leads` | Nhận mọi mã; mã không có thì trả danh sách rỗng thay vì 400 | Mã do từng GA tự đặt nên API không còn danh sách cố định để kiểm tra |
| Ai xem màn hình Danh mục | Chủ GA sửa; Admin xem chỉ đọc (theo bảng 4.3) | PERM-3 |
| Đổi thứ tự | Hai lệnh `PATCH sortOrder` liên tiếp, không nằm trong một transaction | API 17.5 không có route sắp xếp; nếu lệnh thứ hai lỗi, màn hình tải lại thứ tự thật |
| `GET /leads/facets` | Vẫn trả `sources`, nhưng giao diện lấy nguồn từ danh mục | Giữ tương thích |
| Chương trình bảo hiểm (PRG) | Chưa làm; màn hình Danh mục mới có thẻ Danh mục lead | Thuộc lát cắt 4, cùng nhập tay hợp đồng |

## 2026-11-09: Lịch sử phụ trách và chọn lead theo bộ lọc

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Lịch sử phụ trách (LEAD-28) | Tính khi mở chi tiết lead, trả trong `handovers` của `GET /leads/{id}` như mục 17.7; không lưu bảng riêng | Đặc tả nói tính từ các dòng `assignee` và lượt liên hệ; tính lại luôn khớp với lịch sử |
| Số ngày giữ | Số ngày tròn (làm tròn xuống), tính tới hiện tại với người đang phụ trách | Đặc tả chỉ ghi "số ngày" |
| Lượt liên hệ được tính | Gọi điện, Zalo, gặp mặt do chính đại lý đó ghi, trong khoảng [ngày nhận, ngày bàn giao). Ghi chú thường không tính | NOTE-4: chỉ ba loại này là liên hệ |
| Khoảng không ai phụ trách | Không tạo dòng | Không có tư vấn viên để tô đỏ hay tính liên hệ |
| Tô đỏ | Dòng đã bàn giao mà 0 lần liên hệ; người đang phụ trách không tô dù chưa liên hệ | Đặc tả: "Người đã bàn giao mà số lần liên hệ bằng 0" |
| Chọn tất cả theo bộ lọc (LEAD-24) | Thêm `GET /leads/ids` (chỉ người quản lý lead), cùng bộ lọc và thứ tự với danh sách, trả tối đa 200 id kèm `total`. Nút hiện khi đã chọn cả trang và bộ lọc còn lead ở trang khác | Mục 17.7 không có route này; tải từng trang 50 dòng để gom id thì chậm và dễ lệch nếu dữ liệu đổi giữa chừng |
| Thanh phân công | Nằm ở chân vùng nội dung, chỉ hiện khi đã chọn lead, không đẩy bảng xuống | LEAD-24: "cố định ở chân màn hình" |
| Báo cáo R8 (lần bàn giao theo đại lý) | Xong | Lát cắt 6a, dùng lại `handoverHistory` |

## 2026-11-09: Cài đặt GA (mục 5.2)

Màn hình `/ga-settings` và API `GET/PUT /settings` (mục 17.4), chỉ Chủ GA.

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi lần này | Hồ sơ (tên hiển thị, địa chỉ), quy tắc lead (hạn liên hệ, ngưỡng liên hệ kịp thời), gói dịch vụ chỉ xem | Đây là các mục đã có chỗ dùng hoặc giá trị mặc định rõ ràng |
| Danh sách phụ (lý do chốt xịt, nhu cầu chi tiết, nguồn SĐT, khu vực, loại chiến dịch) | Chưa làm | Đặc tả nói "có giá trị mặc định" nhưng không nêu giá trị; không tự đặt (câu hỏi D). Các ô này trên lead hiện vẫn là chữ tự do |
| Logo | Chưa làm | Chưa có object storage, giống IMP-14 |
| Lịch làm việc, giờ yên lặng | Chưa có trên màn hình | Chỉ dùng cho nhắc việc và thông báo (lát cắt 6); `notifications.quietHours` vẫn giữ mặc định 21:00-07:30 |
| "Quản lý được phân công lại trong tuyến", "Bắt buộc đồng ý liên hệ cho telesales" | API nhận và lưu, màn hình chưa hiện | Mục đầu còn OPEN (câu hỏi 4); mục sau đi cùng chiến dịch telesales (LEAD-26). Hiện công tắc không có tác dụng sẽ gây hiểu nhầm |
| Tên hiển thị | Lưu ở `tenantSettings.profile.displayName`; `/me` trả tên này thay cho tên do nền tảng đặt. Để trống thì quay về tên nền tảng | Platform Admin vẫn giữ tên gốc của GA (TENANT-4) |
| Hạn liên hệ (LEAD-29) | Thay hằng số 48 giờ: dùng cho quá hạn, số đếm tab, sắp xếp, việc tự động "Liên hệ khách hàng trong n giờ", nhập file. Lead đã giao được tính lại quá hạn ngay theo hạn mới; việc nhắc đã tạo giữ hạn cũ | Quá hạn được tính lúc đọc, còn việc nhắc là bản ghi đã lưu |
| Ngưỡng liên hệ kịp thời (LEAD-30) | Lưu, chưa có chỗ dùng | Dùng cho báo cáo R1 (lát cắt 6) |
| Kiểm tra đồng thời | `version` riêng cho form cài đặt, tăng mỗi lần lưu; ghi có điều kiện `version` khớp, nếu không thì `409 stale_settings`. Lưu ma trận phân quyền không tăng `version` | Lưu phân quyền không nên làm form cài đặt đang mở bị từ chối |
| Form trên giao diện | Nhớ `version` lúc mở form; không tải lại đè lên phần đang sửa | Phát hiện khi thử: tải lại ngầm vừa xóa phần đang gõ, vừa gửi `version` mới nên lần lưu trễ đè được lần lưu của người khác |
| Số người dùng của gói | Không tính người đã lưu trữ | USER-13: người đã lưu trữ không còn dùng hệ thống |
| Giới hạn gói (số người dùng tối đa, token AI, dung lượng) | Chưa có | Do Platform Admin đặt, thuộc lát cắt 8; mô hình tính phí còn là câu hỏi mở 9 |

## 2026-11-10: Lát cắt 4a: nhập Success 02-05, danh sách và chi tiết khách hàng

Lát cắt 4 lớn nên chia 4 phần: **4a** nhập 02-05 + xem khách hàng (xong), **4b** nhập tay khách hàng / hợp đồng + danh mục chương trình, **4c** gia đình, quyền lợi, cơ hội chăm sóc, ghi chú, **4d** phân công khách hàng, nhập 07_Activities, tab Lịch sử.

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Khách hàng tạo gián tiếp (CUS-1) | Chỉ tạo cho bên mua bảo hiểm (PO) của hợp đồng và khách của hồ sơ YCBH khi file không có dòng 02_Clients; không tạo cho người được bảo hiểm | FAM-5: người được bảo hiểm thường không có bản ghi khách và không có trang khách hàng |
| Chủ GA khi nhập | Được coi như có `imports.tenant_wide` | Mục 12.2 ghi "(và không phải Chủ GA)" ở cột phạm vi hẹp |
| Người nhập không có mã đại lý (Marketing, Chủ GA không có mã) | 02_Clients không tạo liên kết `CLIENTS_SHEET_SCOPE` nào; khách vẫn thấy được qua hợp đồng / hồ sơ | Liên kết luôn cần một mã đại lý |
| Tỉ lệ chia để trống | File của FC: giữ tỉ lệ đã có. File GA một dòng: 100%. File GA nhiều dòng mà để trống: `split_total` | IMP-16 |
| Mã lỗi đại lý không có trên cây ở 03 / 05 | `agent_not_found` | Đặc tả chỉ nêu mã này cho file lead; dùng lại cho cùng tình huống |
| Đếm dòng 03_Policies | Mỗi dòng là phần của một đại lý, nên mọi dòng của một hợp đồng mới tính "mới", của hợp đồng đổi tính "cập nhật" | Số đếm khớp với số dòng trong file |
| "Khách hàng của" (CUS-14) | API nhận danh sách mã hoặc `ALL`; giao diện mới cho chọn một: của tôi, tất cả trong phạm vi, hoặc một đại lý theo cây | Đủ cho phần lớn nhu cầu; ô chọn nhiều để sau |
| Cột "HĐ hiệu lực" trên danh sách | Đếm hợp đồng "Đang hiệu lực" mà người xem thấy được (CUS-8). Số "còn / mất hiệu lực" của Success hiện ở trang chi tiết | Không để danh sách lộ hợp đồng ngoài phạm vi |
| "Hạn phí gần nhất" | Ngày đến hạn sớm nhất từ hôm nay, trên hợp đồng đang hiệu lực mà khách là bên mua | Người đóng phí là bên mua |
| Sắp xếp danh sách | Theo tên rồi mã | Đặc tả không nêu |
| `VIEW_CLIENT` | Ghi mỗi lần mở trang chi tiết (`GET /clients/{code}`) | CUS-9 |
| Mã khách hàng sai định dạng trên URL | 404 | Không có khách nào mang mã đó |
| Dữ liệu demo | Chưa có khách hàng trong `npm run seed` | Sẽ thêm khi có nhập tay (4b) |

## 2026-11-10: Lát cắt 4b: nhập tay khách hàng, hợp đồng, danh mục chương trình

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Mã lỗi mã khách hàng sai | `400 invalid_client_code` kèm `issues` chỉ vào ô | MAN-2 ghi `invalid_input` kèm gợi ý; mục 20.4 có mã riêng `invalid_client_code` (NEW). Dùng mã riêng để giao diện hiện đúng câu |
| Quyền mới `catalog.manage`, `clients.assign` | Thêm vào ma trận. `catalog.manage` mặc định cho Admin; `clients.assign` không cấp ai (dùng ở 4d). GA đã có được cấp `catalog.manage` cho Admin một lần khi backend khởi động (`permissionsVersion`); GA bỏ quyền sau đó thì không bị cấp lại | Test 11: "migration cấp quyền" |
| Ai mở màn hình Danh mục | Chủ GA, Admin, và người có `catalog.manage` (chỉ thấy thẻ Chương trình). **Từ 25/11/2026** thẻ Chương trình bị ẩn (dòng hợp đồng chọn sản phẩm của danh mục dùng chung), nên chỉ còn Chủ GA và Admin mở Danh mục; quyền `catalog.manage` còn trong ma trận nhưng chưa có màn hình nào dùng | Bảng 4.3 |
| Danh mục chương trình mặc định | Tạo ở lần đọc đầu tiên của mỗi GA, như Danh mục lead | GA mới và GA cũ dùng chung một đường |
| Đại lý khi FC thêm khách / hợp đồng | FC chỉ chọn được chính mình; quản lý chọn trong tuyến; Chủ GA chọn bất kỳ đại lý nào của GA | MAN-3, POL-2 |
| Đại lý mặc định của hợp đồng thêm sau | Người nhập (nếu có mã đại lý), nếu không thì đại lý của liên kết `MANUAL`, rồi đại lý sở hữu đầu tiên của khách | POL-2 "người nhập hoặc đại lý của khách" |
| Mã người được bảo hiểm trên dòng nhập tay | Dòng của người được bảo hiểm chính mang mã khách hàng của họ. Khi nhập 04_Policy_Products, ô "Mã NĐBH" để trống được coi là cùng người với dòng đó | PRD-3 ghi mã; file 04 để trống cho người được bảo hiểm chính. Không coi như nhau thì lần nhập sau tạo dòng trùng |
| Cùng chương trình cho hai người không phải khách hàng | Cho phép; cả hai dòng có `insuredCode` rỗng | PRD-4 cho phép; điều này lệch với "không trùng (productCode, insuredCode)" ở mục 18.5. Lần nhập file sau không biết khớp dòng nào nên sẽ thêm dòng mới |
| Sửa hợp đồng (POL-4) | API thay toàn bộ dòng chương trình khi gửi `products`. Trên giao diện, hợp đồng từ file Success chỉ sửa được các trường hợp đồng; dòng chương trình giữ nguyên | Dòng từ Success không phải chương trình trong danh mục nên form không biểu diễn được; buộc chọn lại sẽ làm sai dữ liệu |
| `PATCH` hợp đồng | Phải gửi đủ các trường bắt buộc như khi thêm | Mục 17.8 ghi body là "Policy trừ policyNo, agentCode" |
| Đổi tên khách | Tên bên mua bảo hiểm trên các hợp đồng của khách đổi theo | Tránh hai tên khác nhau trên cùng màn hình |
| Lịch sử thay đổi bằng tay | Ghi vào `recordChanges` không kèm `importId`; số điện thoại che như trong audit; dòng chương trình ghi gộp thành một trường `products` | Mục 18.5 (NEW); PDP-9 |
| Lỗi của hợp đồng trong form thêm khách | `issues[].path` dạng `policies.<n>.policyNo`, `policies.<n>.products.<m>.programCode` | UI-2: lỗi hiện dưới đúng ô |
| Xóa hợp đồng nhập tay sai (POL-7) | Xong 14/11/2026 (xem mục cùng tên) | Câu 12b đã trả lời: trong 7 ngày, chỉ hợp đồng nhập tay |
| Dữ liệu demo | `npm run seed` có 5 khách nhập tay mỗi GA (FC, FC2, và một khách Chủ GA thêm cho UM), có hợp đồng, có con được bảo hiểm | Để thử màn hình khách hàng ngay |

## 2026-11-10: Lát cắt 4c: gia đình, quyền lợi bảo hiểm, cơ hội chăm sóc, ghi chú khách hàng

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Nhóm quyền lợi (COV-3) | Chỉ theo tên sản phẩm (và vai trò Chính / Bổ trợ khi không khớp từ khóa) | Chưa có danh mục 11_Products nên chưa có `category` (câu hỏi mở 3, 12c). Khi có, `coverageGroup` đã nhận `category` trước tên |
| Người của một dòng sản phẩm (COV-1) | Có mã thì theo mã; dòng ghi tên khác người được bảo hiểm chính thì theo tên đó (khóa `name:<tên chuẩn hóa>`); còn lại là người được bảo hiểm chính | PRD-3: người không phải khách hàng chỉ có tên. Người thân FC thêm cùng tên được gộp vào cùng một dòng |
| Quyền lợi và tín hiệu | Luôn tính khi mở khách hàng, từ các hợp đồng người xem thấy; không lưu riêng | COV-5 "không lưu riêng"; người xem chỉ thấy phần hợp đồng trong phạm vi (CUS-8) |
| `already_client` (FAM-4) | Từ chối khi có khách cùng tên chuẩn hóa đang có trên hợp đồng của khách này, hoặc khách trong phạm vi cùng tên và cùng đủ ngày sinh | Đặc tả không nói cách nhận ra "thực ra là khách hàng"; chỉ so tên thì chặn nhầm người trùng tên |
| Người thân là khách ngoài phạm vi | Quan hệ do người khác gắn với một khách mà người xem không thấy, và người đó không có trên hợp đồng chung, thì ẩn | FAM-3, TEN-3: không lộ khách ngoài phạm vi |
| Người có bản ghi khách nhưng ngoài phạm vi | Hiện "Là khách hàng" nhưng không có link, không hiện giới tính và ngày sinh | Họ có trên hợp đồng người xem thấy; chi tiết cá nhân chỉ dành cho người được xem khách đó |
| Tạo lead từ người thân (FAM-6) | Dùng đúng luồng tạo lead: FC tạo thì lead `FC_OWN` của FC; Chủ GA / quản lý tạo thì lead giao cho đại lý sở hữu đầu tiên của khách. Nguồn "Giới thiệu" (tự thêm vào danh mục nếu GA chưa có). Số đã có lead mà người dùng xem được thì giao diện đề nghị liên kết lead đó | FAM-6 ghi "REFERRAL / FC_OWN"; giữ `FC_OWN` để lead vẫn được bảo vệ theo quy tắc lead tự tạo của FC |
| Liên kết lead đã có | API nhận `{leadId}` (404 nếu không xem được). Giao diện chỉ đề nghị khi trùng số điện thoại, chưa có ô tìm lead | Đủ cho trường hợp hay gặp; ô tìm lead làm sau nếu cần |
| `POST /clients/{code}/family/{id}/lead` | Luôn trả `200 {leadId}` (cả khi liên kết) | Mục 17.8 ghi "204 / {leadId}"; một dạng trả về cho giao diện đơn giản hơn |
| Tìm khách để gắn quan hệ (FAM-7) | Dùng `GET /clients?q=&agents=ALL&pageSize=10`, chưa làm `GET /clients/search` | Cùng phạm vi và cùng cách tìm như danh sách, tối đa 10 kết quả |
| Ghi chú và liên hệ trên khách hàng | Một dòng thời gian (`notes` gồm cả ghi chú và liên hệ, mới nhất trước), chưa tách `notes[]` và `activities[]` như mục 17.8 | Cùng cách hiển thị với lead (NOTE-3) |
| Tab tín hiệu trên danh sách (SIG-1) | `due`: là PO, hợp đồng hiệu lực, đến hạn phí trong 30 ngày; `debt`: là PO, phí chưa đóng hoặc nợ APL > 0; `maturity`: PO hoặc LI, hiệu lực, đáo hạn trong 12 tháng; `birthday`: tháng sinh là tháng này; `lapsed`: có hợp đồng không hiệu lực (người xem thấy) hoặc Success báo số HĐ mất hiệu lực > 0. Đếm theo cùng bộ lọc "Khách hàng của" | Cùng quy tắc với thẻ "Cơ hội chăm sóc" (mục 10.11), để số đếm khớp nhãn trên từng dòng |
| Sinh nhật khi Success chỉ có ngày sinh | Lấy ngày / tháng từ ngày sinh | `birthMonth` đã tính từ `dob` khi thiếu `birthDayMonth` |
| "Tạo việc" từ tín hiệu, báo tín hiệu mới (SIG-2) | Làm ở 6c và 6d | Xem hai mục đó |

## 2026-11-10: Lát cắt 4d: phân công khách hàng, nhập 07_Activities, tab Lịch sử

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Ai phân công được (ASG-1, ASG-7) | Chủ GA, hoặc người có `clients.assign` và có sổ khách hàng (reach khác NONE). Marketing và Admin bị từ chối kể cả khi được cấp quyền | ASG-7 "không bao giờ"; câu hỏi mở 12d vẫn chờ |
| Người có `clients.assign` không phải Chủ GA | Chỉ phân công khách trong phạm vi của mình (ngoài phạm vi trả `404`) cho đại lý trong tuyến (ngoài tuyến trả `400 agent_not_found`) | ASG-1 nói "một đại lý của GA" vì mặc định chỉ Chủ GA có quyền; cho quản lý tuyến chuyển khách ngoài tuyến thì vượt CUS-5 |
| `agentCode` trong `POST /clients/assign` | Bắt buộc có trong body; `null` mới là bỏ phân công | Body thiếu trường không vô tình xóa phân công |
| Kết quả `{assigned}` | Số khách trong yêu cầu, kể cả khách đã thuộc đúng người đó | Mục 17.8 không nói rõ; audit ghi thêm `changed` là số khách thực sự đổi |
| Audit | Một bản ghi `ASSIGN client` cho cả lượt, `meta` gồm đại lý, số khách, số khách đổi và danh sách mã | ASG-6 "(đại lý, số khách)" |
| Lịch sử của phân công | Mỗi khách đổi người phụ trách ghi một dòng `recordChanges` trường `manualAgent` (cũ → mới, không có lần nhập) | Để tab Lịch sử thấy được ai đã chuyển khách |
| Tab Lịch sử (CUS-15) | Thay đổi của khách, của các hợp đồng và dòng sản phẩm người xem thấy (CUS-8), từ file và từ sửa tay, mới nhất trước, tối đa 200. Trả trong `GET /clients/{code}` (`history`) | Mục 17.8 liệt kê `history[]` trong chi tiết khách |
| 07_Activities: phạm vi ghi | Như sheet 03-05: đại lý của dòng phải có trong cây và trong phạm vi người tải; hoạt động đã có của đại lý ngoài phạm vi thì không ghi đè (`owned_by_other`) | Mục 19.6 ghi "chủ sở hữu: agent_code" |
| 07_Activities: `activity_type_id` | Nhận số 1-7, số kèm tên tiếng Anh ("2 Calls"), hoặc tên tiếng Anh ("Calls"). Số và tên mâu thuẫn ("4 Calls") thì từ chối, không đoán | IMP-31 |
| 07_Activities: `customer_phone` sai định dạng | Cảnh báo và bỏ ô đó, dòng vẫn được nhập | Cột tùy chọn (mới đề nghị); `phoneKey` lấy tiếp từ `call_phone_hash` hoặc `customer_id` |
| 07_Activities: lịch sử thay đổi | Không ghi `recordChanges` | Mục 18.5 chỉ liệt kê agent, client, policy, policy_product, application |
| Thông báo `too_long` khi nhập file | Không ghi cứng "500 ký tự" nữa mà chỉ sang ghi chú của cột trong file mẫu | Cột `activity_id` giới hạn 64, `content_note` 4000 |
| Thanh phân công trên điện thoại | Dính ở chân màn hình (`sticky`), cả ở danh sách lead | ASG-6, LEAD-24 "cố định ở chân màn hình"; trên điện thoại cả trang cuộn nên thanh từng nằm sau dòng cuối |

## 2026-11-10: Lát cắt 5a: liên kết lead - khách hàng, tự chuyển giai đoạn

Lát cắt 5 lớn nên chia 3 phần: **5a** liên kết lead - khách hàng và tự chuyển giai đoạn (LEAD-32 đến 34, xong), **5b** chiến dịch và hội thảo (CMP-1, 2, 3, 5), **5c** form lead công khai (CMP-4).

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Lead chưa tới giai đoạn liên kết | `409 lead_not_linkable` (mã mới) | LEAD-32 chỉ nói "FC mở" từ PROPOSAL / WON; API phải tự kiểm tra (PERM-4) mà mục 20 chưa có mã |
| Phạm vi gợi ý | Khách mà tư vấn viên được giao lead thấy, và người đang thao tác cũng thấy. Lead chưa giao: theo phạm vi người thao tác. Marketing / Admin không có sổ khách nên bị từ chối | LEAD-32 "không bao giờ hiện khách ngoài scope của FC" |
| Ứng viên gợi ý | Khi không tìm: chỉ khách trùng tên chuẩn hóa hoặc trùng số điện thoại, xếp theo điểm, tối đa 5. Khi tìm theo mã / tên / số: tối đa 10, vẫn có điểm. Khách đã liên kết lead khác không hiện | Không có tên hay số trùng thì điểm tối đa 0,4, quá yếu để gợi ý; quét cả sổ khách thì chậm |
| Liên kết lại sang khách khác | Thay liên kết cũ; audit `LINK` ghi `replaced` | Đặc tả không nói; bắt hủy trước rồi mới liên kết thì thừa một bước |
| Hủy liên kết | Giữ số hồ sơ / số hợp đồng trên lead; lý do ghi vào audit `UNLINK` và ghi chú của dòng lịch sử lead | Số hồ sơ có thể do FC nhập khi chốt (LEAD-19), không chỉ do liên kết |
| Người được giao lead thấy và sở hữu khách (CUS-4) | Liên kết `LEAD_LINK` được tính lại từ các lead đã liên kết, như liên kết từ hợp đồng: đổi người được giao (tay hoặc file lead) thì khách đi theo | Bảng CUS-4, mục 18.5 `recomputeClientScope` "sau ... liên kết / hủy liên kết lead, giao lại lead" |
| LEAD-33: hồ sơ nào được tính | Hồ sơ FC chọn khi liên kết; nếu không chọn thì hồ sơ của khách tạo từ ngày lead trở đi | Khách cũ có hồ sơ / hợp đồng từ trước khi thành lead không được làm lead nhảy giai đoạn |
| LEAD-33: khi nào là ISSUED | Hồ sơ trên có tình trạng "Đã phát hành hợp đồng" hoặc có ngày phát hành, hoặc khách là bên mua của một hợp đồng hiệu lực từ ngày lead trở đi | "hồ sơ Đã phát hành hoặc có hợp đồng đã phát hành" |
| LEAD-33: lead Thất bại | Không tự chuyển | "Không bao giờ lùi"; FC đã đánh dấu thất bại thì để người quyết định |
| LEAD-33: khi nào chạy | Sau mỗi lần nhập Success có sheet 02-05 (trong cùng transaction), cho mọi lead đã liên kết của GA. Không chạy ngay lúc liên kết | Đặc tả: "sau khi một lần nhập Success hoàn tất" |
| LEAD-33: dữ liệu ghi thêm | Đặt `careStatus = WON` nếu trống; điền số hồ sơ / số hợp đồng nếu lead chưa có | Để báo cáo chuyển đổi có số liệu |
| Trang khách: "Lead nguồn" (LEAD-34) | Tab chỉ hiện khi khách có lead liên kết; người xem khách thấy tên lead, giai đoạn, nguồn, chiến dịch, người được giao; chỉ có link mở lead khi người đó xem được lead | Mục 16 "+ Lead nguồn khi có liên kết"; TEN-3 |
| `DELETE /leads/{id}/link` | Gửi `{reason}` trong body | Mục 17.7 |
| Thanh tab trang lead / khách trên điện thoại | Cuộn ngang, không gãy chữ; tab đang chọn tự cuộn vào tầm nhìn | Trang lead và trang khách giờ có 4 tab |

## 2026-11-10: Lát cắt 5b: chiến dịch và hội thảo

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Mã lỗi mới | `409 campaign_exists` (trùng tên), `409 campaign_in_use` (xóa chiến dịch đã có lead / người tham dự), `409 campaign_not_seminar` (thêm người tham dự vào chiến dịch không phải hội thảo) | Mục 20 chỉ có `campaign_not_found` |
| Xóa chiến dịch | Có `DELETE /campaigns/{id}` cho chiến dịch tạo nhầm, chưa có lead hay người tham dự; còn lại chỉ kết thúc (status ENDED) | CMP-5, DATA-8. Mục 17.9 không có DELETE nhưng không có thì tên tạo nhầm bị giữ mãi |
| Trạng thái khi tạo | Mặc định `PLANNED` khi tạo trên màn hình; chiến dịch tự tạo khi nhập file lead vẫn là `ACTIVE`, loại `OTHER` | IMP-28 đã có từ lát cắt 3 |
| Số lead trên danh sách và trang chiến dịch | Đếm trên lead người xem thấy (LEAD-6) | CMP-3 "scope"; tránh lộ số lead của nhánh khác |
| Ngân sách và chi phí | Ngân sách hiện cho người có `campaigns.manage` hoặc `leads.manage`; chi phí mỗi lead / mỗi ca phát hành chỉ tính cho người có `leads.manage` (thấy mọi lead) | Chia ngân sách cho số lead đã lọc theo phạm vi sẽ ra con số sai |
| APE phát hành (CMP-3) | Tổng APE của các hồ sơ YCBH đã phát hành gắn với lead đã liên kết khách (số hồ sơ trên lead) | "APE phát hành từ hồ sơ liên kết" |
| Danh sách lead của chiến dịch | Nút "Xem lead của chiến dịch" mở danh sách lead với bộ lọc chiến dịch, không làm bảng lead thứ hai | Bộ lọc và cột của danh sách lead đã đủ (CMP-3 "lọc được") |
| `GET /campaigns/{id}` | Trả cả số liệu (CMP-3) và người tham dự; không làm route `/stats` riêng | Trang chiến dịch luôn cần cả hai |
| Người tham dự hội thảo | Chỉ chiến dịch loại Hội thảo. Người có `campaigns.manage` thêm (tối đa 200 lead họ thấy); người đó hoặc người được giao lead đổi trạng thái. FC chỉ thấy người tham dự là lead của mình | CMP-2, mục 17.9 |
| Đánh dấu Đã tham dự | Ghi một liên hệ `SEMINAR` trên lead (một lần, kể cả khi đánh dấu lại), thời điểm = ngày giờ hội thảo nếu đã qua, không thì lúc đánh dấu. Không đổi "liên hệ đầu / gần nhất" của lead | CMP-2 "tính vào báo cáo hoạt động"; LEAD-29 chỉ tính gọi, Zalo, gặp |
| Người phụ trách chiến dịch | Chọn trong người dùng đang hoạt động của GA (`GET /campaigns/owners`, cần `campaigns.manage`) | CMP-1 |

## 2026-11-10: Lát cắt 6a: khung báo cáo, R1, R2, R8, xuất Excel

Lát cắt 6 lớn nên chia: **6a** khung báo cáo dạng cây, R1 chuyển đổi, R2 hoạt động, R8 bàn giao, xuất Excel (xong); **6b** R3 phễu, R5 pipeline, R7 khối lượng chăm sóc; **6c** "Hôm nay", việc cần làm ngoài lead, lịch; **6d** thông báo. R4 và R6 chờ cột sheet 06 / 08-10 (IMP-33 OPEN).

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Ai thấy cả GA (RPT-3) | Chủ GA, người có `reports.view_all`, và người có `leads.manage` | Mục 17.13 ghi R2 "leads.manage → tenant"; người quản lý lead đã thấy mọi lead ở màn hình Lead |
| Dòng "Chưa phân công" | Chỉ ở R1 (báo cáo lead) và chỉ với người thấy cả GA | RPT-3 |
| Nhãn nhóm | Theo cấp bậc của trưởng nhóm: BM → "Ban kinh doanh", UM và SUM → "Phòng kinh doanh", còn lại "Nhóm" | RPT-1, ROLE-6 |
| Liên hệ trong 24 giờ (R1) | Hiện "số liên hệ trong 24 giờ (số lead có giờ liên hệ trên CRM)" | LEAD-30: lead có trạng thái từ file nhưng không có giờ không được tính vào mẫu số |
| R2: gộp trùng | Gọi / Zalo / gặp mặt cùng số đã che, cùng ngày, cùng loại tính một lần; liên hệ CRM được tính trước nên dòng Success trùng không cộng vào "Từ Success". Số của liên hệ CRM là số của lead hoặc của khách | Mục 13.2 R2, test 33 |
| R2: "Lead chốt trong kỳ" | Lead có lịch sử chuyển trạng thái sang Đã chốt trong kỳ và hiện vẫn Đã chốt, tính cho người đang được giao | Mục 13.2 "theo người được giao hiện tại" |
| R8 | "Nhận": các đoạn phụ trách bắt đầu trong kỳ (kể cả lần giao đầu); "Bàn giao đi", "chưa liên hệ", "số ngày giữ": các đoạn kết thúc trong kỳ, tính từ `handoverHistory` | LEAD-28 |
| Kỳ báo cáo | Ngày Việt Nam, cả hai đầu được tính; API đổi sang nửa mở (đầu ngày đầu → đầu ngày sau ngày cuối). Tối đa 400 ngày | RPT-8, test 47; giới hạn để một yêu cầu không quét nhiều năm dữ liệu |
| Xuất Excel (RPT-6) | Trình duyệt dựng file từ bảng đang xem (mọi dòng mở); API `POST /reports/exports` cần `exports.data` và ghi audit `EXPORT` trước khi tải. Chưa làm job ở server và link ký 15 phút | Báo cáo R1/R2/R8 nhỏ; nhãn tiếng Việt nằm ở `vi.json` (UI-1). Job ở server làm khi có xuất danh sách lớn (lead, khách hàng) |
| Bấm số để xem danh sách (RPT-5) | R1: số lead, quá hạn, từng Nhu cầu, từng trạng thái của một đại lý (hoặc "Chưa phân công") mở danh sách lead đã lọc theo người được giao và ngày lead. Dòng nhóm chưa có link | Danh sách lead chưa lọc được theo cả nhóm |
| Ảnh chụp ban đêm `dailyAgentStats` (RPT-7) | Chưa làm; báo cáo tính trực tiếp bằng aggregation | Dữ liệu demo và GA hiện tại nhỏ |

## 2026-11-10: Lát cắt 6b: R3 phễu, R5 pipeline, R7 khối lượng chăm sóc

| Nội dung | Cách làm | Lý do |
|---|---|---|
| R3 phễu | Lead có ngày lead trong kỳ, nhóm theo nguồn, chiến dịch hoặc nguồn SĐT (một dòng "Chưa có" cho lead thiếu giá trị). Các bước: đã liên hệ, cơ hội, đã chốt, đã liên kết khách, phát hành; APE phát hành từ hồ sơ của lead đã liên kết (như CMP-3). Không xếp theo cây đại lý; phạm vi vẫn theo RPT-3 | Mục 13.2 R3 |
| R3 chi phí | Chỉ khi xem theo chiến dịch có ngân sách, và chỉ người có `leads.manage`; chia ngân sách cho số lead / ca phát hành **trong kỳ** | Như trang chiến dịch (5b); chia cho số lead đã lọc theo phạm vi sẽ sai |
| R5 pipeline | Ảnh chụp hiện tại, không theo kỳ. Chỉ lead ở các giai đoạn còn mở (Mới → Đã nộp HSYCBH); bỏ Đã phát hành và Thất bại. "APE dự kiến" = giá trị của lead (`valueVnd`). Số ngày ở giai đoạn tính từ lần đổi giai đoạn gần nhất, lead chưa đổi thì từ lúc tạo | Mục 13.2 R5; lead chưa có trường APE dự kiến riêng |
| R7 khối lượng chăm sóc | Khách hàng tư vấn viên **sở hữu** đang có từng tín hiệu (tính hôm nay, cùng quy tắc với tab trên danh sách khách, SIG-1), và liên hệ, ghi chú trên khách trong kỳ | Mục 13.2 R7; số khớp với danh sách khách khi bấm vào |
| R7 tổng nhóm | Khách có nhiều người sở hữu được đếm cho mỗi người; dòng nhóm cộng các dòng con nên có thể đếm một khách nhiều lần | Giữ quy tắc cộng dồn của RPT-1 |
| Bấm số (RPT-5) | R3: số lead mở danh sách lead theo nguồn / chiến dịch trong kỳ (nguồn SĐT chưa có bộ lọc). R5: số lead theo giai đoạn mở danh sách lead của người đó ở giai đoạn đó. R7: số khách mở danh sách khách của người đó với tab tín hiệu tương ứng | |

## 2026-11-11: Lát cắt 6c: "Hôm nay", việc cần làm, lịch, việc từ tín hiệu

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Ba loại việc | Việc của lead, việc của khách hàng (`clientCode`), việc cá nhân (không gắn gì). Việc cá nhân chỉ người tạo thấy và sửa; quản lý không thấy việc cá nhân của tuyến | TASK-1; việc cá nhân là ghi nhớ riêng |
| `GET /tasks` | Mặc định: việc giao cho mã đại lý của mình và việc cá nhân mình tạo. `team=1` (chỉ người có phạm vi tuyến / cả GA): việc của mọi mã đại lý trong phạm vi. Tối đa 500 việc, xếp theo hạn | Mục 17.14; mục 9.3 "quản lý: của đội" |
| Quyền sửa việc | Việc lead: ai được làm việc trên lead đó. Việc khách: người sở hữu khách. Việc cá nhân: người tạo. Không xóa việc; "Hủy việc" đổi sang `CANCELLED` và mở lại được | API kiểm tra lại dù giao diện đã ẩn (PERM-4); giữ lịch sử |
| "Hôm nay" | Trên trang chủ, trên phần tài khoản: việc quá hạn và đến hạn hôm nay; số lead của tôi, mới được giao, có góp ý mới, quá hạn liên hệ (quản lý: của cả tuyến); người có `leads.manage` thêm lead chưa phân công và lead mới hôm nay; khách của mình có phí đến hạn trong 7 ngày và sinh nhật tuần này (thứ Hai đến Chủ nhật). Nút nhanh "Thêm lead", "Thêm việc", "Xem báo cáo" | TASK-5, mục 16.2. "Thêm ghi chú nhanh" chưa làm; ghi chú vẫn thêm ở trang lead / khách |
| Dữ liệu Success cũ | Chủ GA và người có `leads.manage` thấy lần nhập Success gần nhất của từng đại lý; quá 14 ngày (hoặc chưa nhập) là "Cũ" | Mục 16.2; đặc tả không nêu ngưỡng nên chọn 14 ngày (`STALE_UPLOAD_DAYS`) |
| Lịch | Một lần đọc tối đa 62 ngày; gồm việc và lead ở giai đoạn Hẹn gặp theo `nextActionAt`. Kéo việc sang ngày khác giữ nguyên giờ Việt Nam; chỉ việc đang mở và mình được sửa mới kéo được. Điện thoại hiện danh sách các ngày có việc thay lưới | TASK-6; lưới 7 cột không đọc được ở 375 px |
| Feed ICS | `POST /calendar/token` tạo link riêng; chỉ lưu băm SHA-256 trong `calendarTokens`, link chỉ hiện một lần. Tạo link mới thì link cũ hết hiệu lực. `GET /calendar.ics` là route công khai, tra token bằng `CROSS_TENANT` như tra lời mời; tài khoản không còn hoạt động trả 404. Feed không chứa số điện thoại | TASK-6 (token riêng, chỉ đọc); PDP |
| "Tạo việc" từ tín hiệu | Chỉ người sở hữu khách. Tên việc lấy từ nội dung tín hiệu; hạn 09:00 ngày của tín hiệu (phí đến hạn, đáo hạn) nếu còn ở tương lai, không thì 09:00 ngày mai. Việc có nguồn `SIGNAL` và lưu mã tín hiệu | SIG-2 |
| Chưa làm trong 6c | Nhắc việc (TASK-7) và báo tín hiệu mới ban đêm (SIG-2) chuyển sang 6d vì cần thông báo và bộ hẹn giờ. Thanh điều hướng dưới màn hình điện thoại chưa làm; sidebar dạng drawer vẫn dùng | Gom phần chạy nền vào một lát cắt |

## 2026-11-11: Lát cắt 6d: thông báo, nhắc việc, báo cơ hội chăm sóc

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Kênh (NTF-1) | Chỉ trong ứng dụng: chuông có số chưa đọc (tải lại mỗi phút và khi quay lại tab), bảng 8 thông báo mới nhất, trang `/notifications`. Web push và email tóm tắt chưa làm | Web push cần PWA và khóa VAPID; email cần chọn dịch vụ email |
| Lưu thông báo | `notifications` lưu `type`, `data` (chỉ số đếm và id), `link`, `readAt`; **không** lưu `title`, `body` như mục 18.7. Câu chữ lấy từ `vi.json`; tên lead / khách / việc / người dùng tra lúc đọc danh sách | Quy tắc 7 (mọi chữ giao diện ở `vi.json`) và NTF-4 / PDP: không chép tên, số điện thoại sang chỗ khác; lead bị xóa thì thông báo cũ không còn tên |
| Ai nhận (NTF-5) | Chỉ người dùng `ACTIVE` của cùng GA; người tự làm thao tác không nhận thông báo về chính thao tác đó (tự giao lead, tự góp ý) | NTF-5; tránh thông báo thừa |
| Tùy chọn (NTF-3) | `GET/PUT /notifications/prefs`, lưu `users.notificationPrefs` dạng `{TYPE: {inApp}}`; thiếu là bật. Có audit `UPDATE user` | Mục 17.1 ghi `PATCH /me {notificationPrefs}`; route riêng cho trang tùy chọn gọn hơn và để dành chỗ cho kênh push / email |
| Thêm `GET /notifications/unread` | Trả `{unread}` cho chuông | Không phải tải danh sách mỗi phút |
| Đọc thông báo không audit | Đánh dấu đã đọc và tạo thông báo không ghi `auditEvents`; thao tác gây ra thông báo đã được audit | Thông báo là tin hệ thống, không phải dữ liệu nghiệp vụ |
| Sự kiện tức thời (NTF-2) | Được giao lead (một lead có tên, nhiều lead "n lead"; cả khi nhập file), góp ý mới trên lead của tôi (CMT-5), được phân công khách (ASG), lời mời được chấp nhận (chỉ khi người mời cùng GA). Ghi trong cùng transaction với thao tác | Thao tác lỗi thì không có thông báo |
| Chưa gửi | Nhập file xong (người nhập đang xem kết quả ngay vì nhập chạy đồng bộ), ngân sách AI 80% / 100% (chưa có AI) | |
| Job nền | Chạy mỗi phút trong tiến trình API (`RemindersService`), không dùng BullMQ / Redis như mục 2.2. Một lease trong `jobLocks` để chỉ một instance chạy; `noticeKeys` (TTL 60 ngày) để mỗi nhắc nhở chỉ gửi một lần | Dự án chưa có Redis; đủ cho quy mô hiện tại. Chuyển sang hàng đợi khi chạy nhiều instance lớn |
| Nhắc việc (TASK-7) | Việc đang mở đến hạn: thông báo một lần (bỏ qua nếu đã quá hạn hơn 2 giờ khi server khởi động lại). Đổi hạn thì nhắc lại theo hạn mới. Lead ở giai đoạn Hẹn gặp: thông báo 15 phút trước `nextActionAt` | TASK-7 |
| Lead sắp quá hạn | 4 giờ trước hạn liên hệ (LEAD-29) của lead chưa liên hệ; gộp một thông báo cho mỗi đại lý mỗi lần chạy | Đặc tả không nêu thời điểm; 4 giờ đủ để gọi trong ngày |
| Giờ yên lặng (NTF-3) | Thông báo trong app vẫn tạo trong giờ yên lặng (không kêu, không hiện trên màn hình khóa). Vòng buổi sáng chạy một lần mỗi ngày ngay khi hết giờ yên lặng (mặc định 07:30): việc quá hạn, lead quá hạn của tuyến cho quản lý (người có phạm vi tuyến / cả GA hoặc `leads.manage`), cơ hội chăm sóc mới. Chủ GA sửa giờ yên lặng ở Cài đặt GA | Giờ yên lặng sẽ chặn push khi có push; "ban đêm" của SIG-2 hiểu là tính đêm, báo buổi sáng |
| Cơ hội chăm sóc mới (SIG-2) | Mỗi sáng, mỗi đại lý sở hữu khách (CUS-6) nhận một thông báo đếm khách có phí đến hạn trong 7 ngày (hợp đồng hiệu lực) và khách sinh nhật trong 3 ngày tới, chỉ những mục chưa báo trước đó | "Báo tín hiệu mới": không lặp lại cùng hạn phí, cùng sinh nhật mỗi ngày |
| Tóm tắt cho quản lý | "Tuyến của bạn có n lead quá hạn liên hệ", chỉ khi n > 0 | NTF-2 "tóm tắt hằng ngày (cho quản lý)" |

## 2026-11-11: Góp ý trên khách hàng và @nhắc tên (CMT-5)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Ai góp ý trên khách | Ai thấy khách hàng (CUS-5): Chủ GA, quản lý tuyến, người sở hữu. Marketing và Admin không có sổ khách nên bị từ chối (403); GA khác 404. Khác với ghi chú (NOTE-5) chỉ người sở hữu viết | CMT-5 "quản lý góp ý được trên trang khách hàng của tuyến"; giống CMT-1 trên lead |
| Hiển thị | Thẻ "Góp ý" dưới "Ghi chú và liên hệ" trên tab Khách hàng & hợp đồng, cũ nhất ở trên như lead (CMT-1). `GET /clients/{code}` trả thêm `comments` | |
| Chưa có cờ "góp ý mới" trên khách | Người sở hữu được báo bằng thông báo `CLIENT_COMMENT`; chưa có nhãn / tab "Có góp ý mới" như CMT-3 của lead | Thông báo đủ để không bỏ sót; nhãn trên danh sách làm sau nếu cần |
| Cách nhắc tên | Gõ @ trong ô góp ý, chọn từ tối đa 8 người đang hoạt động thấy lead / khách đó (`GET .../mentionable?q=`), không có chính mình. Góp ý lưu `body` (chữ có "@Tên") và `mentions` (id). Xóa "@Tên" khỏi chữ trước khi gửi thì người đó không còn được nhắc | Đặc tả chỉ nêu `mentions?: userId[]`; lưu id để tên đổi sau vẫn đúng người |
| Kiểm tra trên server | Mỗi người được nhắc phải đang hoạt động, cùng GA và thấy lead / khách theo quyền của chính họ; nếu không trả `400 mention_not_visible` (mã mới). Tối đa 10 người một góp ý | Không để thông báo dẫn tới hồ sơ người nhận không được xem (PERM-4) |
| Thông báo | Người được nhắc nhận `MENTION`; người phụ trách (lead) hay người sở hữu (khách) nhận `LEAD_COMMENT` / `CLIENT_COMMENT`, trừ người viết và người đã được nhắc, để không ai nhận hai thông báo cho một góp ý | NTF-2 |
| Audit | `CREATE lead_comment` và `CREATE client_comment` ghi thêm số người được nhắc trong `meta` | CMT-6 |

## 2026-11-11: Lát cắt 7a: cài đặt AI, khóa nhà cung cấp

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Chia lát cắt 7 | 7a cài đặt và khóa; 7b trợ lý và trò chuyện; 7c kho kiến thức; 7d luyện tập và báo cáo sử dụng | Chương 14 lớn; 7a không cần thư viện LLM hay khóa thật |
| Nhà cung cấp | Gemini, DeepSeek, Qwen (endpoint quốc tế) như AI-14, gọi qua endpoint tương thích OpenAI bằng `fetch`, chưa dùng LangChain | Đủ cho đọc mô hình và kiểm tra khóa; thư viện chọn ở 7b |
| Khóa (AI-15) | Chủ GA nhập khóa trong ứng dụng; lưu AES-256-GCM, khóa dẫn xuất HKDF-SHA256 từ `AI_KEYS_SECRET`, AAD `tenantId:provider`, dạng `iv.ciphertext`. API chỉ trả `last4`, nguồn (`GA` / `PLATFORM` / không có), thời điểm, `keyUnreadable`. Audit `UPDATE ai_key` / `DELETE ai_key` chỉ có tên nhà cung cấp và `last4` | Đúng AI-15 |
| Khóa nền tảng | Biến môi trường `AI_PLATFORM_KEY_GEMINI`, `_DEEPSEEK`, `_QWEN` (để trống = không có); dùng khi GA không có khóa đọc được | AI-15. Ai trả chi phí khóa nền tảng vẫn là câu hỏi 8 |
| `AI_KEYS_SECRET` | Bắt buộc khi `NODE_ENV=production`; dev và test dùng secret cố định kèm cảnh báo, để `.env` cũ vẫn chạy | Không bắt người đang dev phải tạo lại `.env` |
| Mặc định | AI tắt cho tới khi Chủ GA bật; ba tầng và router mặc định dùng mô hình gợi ý của Gemini; hạn mức 0 (không giới hạn) | AI-13 không nói mặc định; tắt an toàn hơn vì chưa có khóa |
| Danh sách mô hình | `GET /ai/admin/settings` không gọi nhà cung cấp; giao diện gọi `GET /ai/admin/keys/{provider}/models` cho từng nhà cung cấp có khóa. Ô mô hình cho gõ tự do với gợi ý từ danh sách; mô hình không có trong danh sách hiện "có thể đã ngừng hỗ trợ" | Mục 17.13 ghi `providers[].models[]` trong cài đặt; tách ra để trang mở nhanh và một nhà cung cấp lỗi không chặn cả trang |
| Kiểm tra khóa (AI-16) | Gửi 5 token tới mô hình đầu tiên GA đang dùng với nhà cung cấp đó, không có thì mô hình gợi ý tầng Nhanh. Gemini báo khóa sai bằng 400 kèm câu về API key, nên 400 có chữ "API key" cũng đọc là `ai_key_invalid` | Thử thật với Gemini ngày 11/11/2026 |
| `usedThisMonth` | Luôn 0 cho tới 7b | Chưa có `aiMessages` |
| Màn hình | `/ai` trong nhóm Quản trị, chỉ `ai.manage`; hiện chỉ có phần Mô hình và hạn mức, các tab Trợ lý, Kho kiến thức, Sử dụng thêm ở 7b-7d. Ô nhập khóa là ô mật khẩu; URL chỉ giữ tên nhà cung cấp đang sửa (`?provider=`) | Quy tắc giao diện: không đưa chữ đang gõ vào URL |

## 2026-11-11: Lát cắt 3b: xóa và gộp lead

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Ẩn lead đã xóa | Plugin Mongoose `softDeletePlugin` thêm `deletedAt: null` vào mọi truy vấn lead (find, count, update, aggregate) trừ khi truy vấn ghi `WITH_DELETED` hoặc tự nêu `deletedAt` | Như cách chặn thiếu tenant: không chỗ nào (báo cáo, chiến dịch, nhắc việc) quên lọc |
| Số điện thoại của lead đã xóa | Chuyển sang `deletedPhone`, `phone` thành `deleted:<id>` để lead mới được dùng số đó. Khôi phục khi số đã có lead khác thì báo `phone_exists` | LEAD-40 là xóa lead tạo nhầm; không để lead nhầm chặn lead đúng |
| Việc của lead bị xóa | Việc đang mở bị hủy và đánh dấu `suspendedByDelete`; khôi phục thì mở lại đúng các việc đó | Không còn nhắc việc cho lead đã xóa |
| Sau 30 ngày | Vòng buổi sáng xóa hẳn lead cùng ghi chú, liên hệ, góp ý, lịch sử, việc, thành viên chiến dịch; audit `DELETE lead` không có người thực hiện, `meta.purged` = số lead | LEAD-40 "khôi phục trong 30 ngày" |
| Liên kết khách hàng | Xóa, khôi phục, gộp đều tính lại liên kết `LEAD_LINK` của khách | CUS-4 |
| Xóa theo yêu cầu (PDP-6) | `mode: PDP`: xóa họ tên, số điện thoại, email, ngày sinh, tuổi, thông tin thêm, tiến độ tư vấn, link; nội dung ghi chú, kết quả liên hệ, góp ý; giá trị cũ / mới của các trường đó trong lịch sử; bỏ liên kết khách. Giữ giai đoạn, ngày, nguồn, chiến dịch, đại lý. Lead có `erasedAt`, không còn ở danh sách, chi tiết, đếm tab, nhưng vẫn được tính trong báo cáo. Không khôi phục được | PDP-6 "giữ thống kê ẩn danh". Chưa có phiếu yêu cầu chủ thể dữ liệu (`dsrRequests`, lát cắt 8); lý do xóa ghi trong audit |
| Gộp lead (LEAD-41) | Lead được giữ là lead đang mở; lead kia được chọn bằng ô tìm tên / số. Chuyển ghi chú, liên hệ, góp ý, lịch sử, việc (việc tự động liên hệ đang mở của lead kia bị hủy, việc khác chuyển cho người được giao lead giữ lại), thành viên chiến dịch (trùng chiến dịch thì giữ một). Lead giữ lại lấy các trường còn trống từ lead kia (email, ngày sinh, khu vực, tỉnh, thông tin thêm, sản phẩm), liên hệ đầu tiên sớm nhất, liên hệ gần nhất muộn nhất. Lịch sử thêm dòng "Gộp lead (số cũ)". Lead kia vào thùng rác với `mergedInto`, không khôi phục được (`lead_not_restorable`) | Đặc tả không nói trường nào thắng; giữ dữ liệu của lead được chọn giữ, chỉ lấp chỗ trống |
| Hai lead liên kết hai khách khác nhau | Không gộp, `409 lead_merge_conflict` | Tránh ghép nhầm hai khách |
| Quyền | Chỉ `leads.manage` (API kiểm tra lại, PERM-4) | LEAD-40, mục 17.7 |
| Trang "Lead đã xóa" | `/leads/deleted`, link từ trang Lead cho người quản lý lead; lead đã gộp hiện "Đã gộp, mở lead" thay nút Khôi phục | |

## 2026-11-11: Lát cắt 3c: kanban, sửa ghi chú, bộ lọc đã lưu

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Kanban (LEAD-19) | `GET /leads/board`: 8 cột theo giai đoạn, cùng bộ lọc với danh sách nhưng bỏ qua bộ lọc giai đoạn, mỗi cột có tổng và tối đa 50 thẻ theo thứ tự LEAD-38; thẻ có `canWork`. Kéo thả thẻ hoặc chọn từ menu "⋯" của thẻ (cho bàn phím và điện thoại). Mỗi lần chuyển mở hộp thoại: Thất bại cần lý do, Đã nộp HSYCBH cần số hồ sơ hoặc số hợp đồng, mọi lần đều có ghi chú tùy chọn | Mục 16 "kanban"; quy tắc chuyển giai đoạn dùng lại `PATCH /leads/{id}` sẵn có |
| Chuyển giai đoạn | Không kéo về Mới; Đã phát hành HĐ (đến hoặc đi) chỉ người quản lý lead; chỉ lead mình làm việc được (LEAD-7). Kéo sang Đã gặp không tự đặt "liên hệ đầu tiên", nên nhãn "Quá hạn 48 giờ" vẫn còn nếu chưa ghi liên hệ hay Nhu cầu / Trạng thái | LEAD-29 định nghĩa quá hạn theo liên hệ, không theo giai đoạn; không tự suy thêm quy tắc |
| Điện thoại | Kanban hiện một giai đoạn một lúc, chọn bằng tab (`?col=`) | Mục 16 "điện thoại: tab theo giai đoạn" |
| Sửa / xóa ghi chú (NOTE-8) | Chỉ tác giả, trong 24 giờ kể từ lúc viết, chỉ mục ghi trong ứng dụng (không mục nhập file). Sửa được nội dung và kết quả (với liên hệ); xóa chỉ ghi chú thường, không xóa liên hệ đã ghi nhận vì liên hệ được tính vào báo cáo và mốc liên hệ (NOTE-4). Bản cũ ghi vào lịch sử lead (`noteEdited`, `noteDeleted`); có audit. Người quản lý lead cũng không sửa ghi chú của người khác. Lỗi `note_not_editable` (403) | NOTE-8 "giữ bản gốc trong lịch sử" |
| Ghi chú khách hàng | Chưa có sửa / xóa trên trang khách hàng | Mục 17 chỉ liệt kê route cho lead |
| Bộ lọc đã lưu (LEAD-38) | Lưu nguyên tham số URL của trang Lead (tab, bộ lọc, ô tìm, cách xem), trừ trang, số dòng và hộp thoại đang mở. Riêng từng người, tối đa 20, tên không trùng (`filter_exists`, `filter_limit`). Route `/leads/filters` | Đặc tả không có API; đặt dưới `/leads` vì chỉ dùng cho danh sách lead |

## 2026-11-11: Lát cắt 5c: form lead công khai

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Cài đặt form | Trên trang chiến dịch, chỉ `campaigns.manage`: bật / tắt, trường thêm (email, tỉnh, nhu cầu; họ tên, số điện thoại, ô đồng ý luôn có), nội dung đồng ý, thông báo quyền riêng tư (có nội dung mẫu sẵn). `PUT /campaigns/{id}/form`, có audit | CMP-4, mục 16 |
| Link | `/f/<slug>`, slug 10 ký tự ngẫu nhiên, duy nhất toàn hệ thống, giữ nguyên khi sửa cài đặt để QR đã in vẫn dùng được. Form đóng khi tắt, chiến dịch đã kết thúc, quá ngày kết thúc, hoặc GA bị tạm ngưng (`form_unavailable`) | Mục 18 `publicForm.slug (U toàn hệ thống)` |
| Tra form theo slug | Đọc chiến dịch bằng `CROSS_TENANT` chỉ với slug, giống tra lời mời | TEN-6: slug là khóa duy nhất của khách chưa đăng nhập |
| Mã QR | Dựng trong trình duyệt bằng thư viện `qrcode` (npm), tải về dạng PNG | Không gửi link ra dịch vụ ngoài |
| Chống bot | Cloudflare Turnstile theo CMP-4, khóa ở `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`. Không có khóa: dev và test bỏ qua kiểm tra (có cảnh báo), production đóng mọi form | Câu E (ai giữ khóa) còn mở; không để production chạy form không có chống bot |
| Giới hạn | 5 lần / phút theo IP (throttler, tắt khi `NODE_ENV=test` như mọi throttler), 3 lần / ngày theo số điện thoại mỗi GA (`formHits`, lưu băm số, tự xóa sau 2 ngày) → `429 rate_limited` | Mục 17.1 |
| Số mới | Lead `PUBLIC_FORM`, chưa phân công, thuộc chiến dịch; nguồn = kênh của chiến dịch theo danh mục (OPT-13), chiến dịch không có kênh thì "Form công khai"; nhu cầu ghi vào "Sản phẩm quan tâm"; đồng ý `PUBLIC_FORM` + thời điểm + băm IP (theo GA). Chỉ giữ trường form có hỏi. Audit `CREATE lead` không có người thực hiện | CMP-4 |
| Số đã có | Không sửa lead cũ; thêm ghi chú "Đăng ký lại qua form {chiến dịch}" (kèm nhu cầu), báo người được giao (thông báo mới `FORM_REREGISTERED`). Trả lời giống hệt số mới | CMP-4 "không bao giờ tiết lộ số đã tồn tại" |
| Hội thảo | Gửi form của chiến dịch loại SEMINAR thì lead thành thành viên `REGISTERED` | CMP-2 |
| Ghi chú không có tác giả | `interactions.createdBy` nay có thể trống (ghi chú do form viết); trang lead hiện "qua form công khai" | Không gán cho một người dùng không viết nó |
| Tự phân công (LEAD-27) | Chưa làm; lead từ form vào tab "Chưa phân công" | LEAD-27 mặc định tắt |

## 2026-11-11: Xác thực hai lớp (MFA, USER-16)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Thuật toán | TOTP theo RFC 6238 (HMAC-SHA1, 30 giây, 6 số), tự viết bằng `node:crypto`, kiểm bằng vector chuẩn của RFC. Chấp nhận lệch một bước (±30 giây), không nhận lại bước đã dùng | Đặc tả nói Better Auth (TOTP); repo không dùng Better Auth (xem quyết định đầu); không cần thêm thư viện |
| Lưu bí mật | AES-256-GCM, khóa dẫn xuất HKDF từ `MFA_KEYS_SECRET`, AAD là id người dùng. Bắt buộc trong production; dev / test dùng secret cố định kèm cảnh báo | Giống khóa AI (AI-15); lộ database không lộ bí mật |
| Mã dự phòng | 10 mã `xxxxx-xxxxx`, chỉ lưu băm, mỗi mã dùng một lần, chỉ hiện một lần lúc bật hoặc tạo lại | Cách làm phổ biến khi mất điện thoại |
| Đăng nhập | Đúng mật khẩu và đã bật MFA: `POST /auth/sign-in/email` trả `{mfaRequired: true}` thay vì thông tin người dùng, phiên có `mfaPending`; mọi API trả `401 mfa_required` trừ `POST /auth/mfa/verify` và đăng xuất. Nhập mã đúng thì phiên mở. Sai mã tính như sai mật khẩu (5 lần / phút, khóa tạm) | Mục 17.2 `POST /auth/mfa/verify` |
| Bắt buộc | GA_HEAD, ADMIN, PLATFORM_ADMIN luôn bắt buộc; Chủ GA bật "Bắt buộc cho mọi người" trong Cài đặt GA (`security.mfaForAll`). Tài khoản bắt buộc mà chưa cài chỉ gọi được `/me`, các route cài MFA và đăng xuất (`403 mfa_setup_required`); giao diện chuyển sang `/mfa/setup` | USER-16 "tùy chọn cho người khác (cài đặt tenant)" hiểu là GA chọn bắt buộc hay không |
| Tắt MFA | Người không bắt buộc tự tắt được, cần mã. Người bắt buộc không tắt được (`409 mfa_mandatory`) | |
| Mất điện thoại | Người có `users.manage` "Đặt lại xác thực hai lớp": xóa MFA, đăng xuất mọi nơi; người đó cài lại ở lần đăng nhập sau. Có audit `entity: mfa` | Không có email để tự khôi phục |
| `MFA_ENFORCE=false` | Tắt việc ép buộc cài MFA (người đã bật vẫn phải nhập mã). Bộ e2e đặt sẵn, riêng `test/mfa.e2e-spec.ts` bật | Để demo trên máy và các bộ test khác không phải cài MFA cho mọi tài khoản |
| Platform Admin | Bắt buộc như vai trò đặc quyền. Platform Admin đặt lại MFA cho người dùng của GA ở console (8a); đặt lại MFA cho một Platform Admin khác chưa có màn hình | Chưa có danh sách nhân sự nền tảng |

## 2026-11-11: Lát cắt 8a: gói dịch vụ và giới hạn

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Gói | Mỗi GA có tên gói (chuỗi tự do, mặc định `standard`) và `limits` `{maxUsers, aiTokensPerMonth, storageMb}`; trống / null là không giới hạn. Platform Admin sửa ở "Các GA" → "Gói"; GA chỉ xem ở Cài đặt GA. Chưa có danh mục gói định sẵn hay tính cước | Mục 5.2 nêu ba giới hạn; mô hình tính cước còn là câu hỏi 9 |
| Số người dùng | Đếm mọi tài khoản trừ người đã lưu trữ (USER-9), giống số hiện ở Cài đặt GA. Mời mới hoặc kích hoạt lại người đã lưu trữ khi đã đủ → `409 plan_user_limit`. Kích hoạt lại người bị khóa không cần chỗ mới (vẫn được đếm). Hạ giới hạn xuống dưới số hiện có không khóa ai, chỉ chặn thêm người | Không làm mất quyền truy cập của người đang dùng |
| Token AI | Khi gói có giới hạn, hạn mức tháng GA tự đặt phải từ 1 đến mức gói (`400 plan_ai_limit`); "0 = không giới hạn" không dùng được nữa. Chưa trừ token vì chưa có trợ lý (7b) | AI-13 + mục 5.2 |
| Dung lượng | Lưu và hiển thị; chưa chặn vì chưa có chỗ lưu file (IMP-14) | |
| Đếm trên console | Cột người dùng không tính người đã lưu trữ (trước đây tính) và hiện "n / tối đa"; `aiTokensThisMonth` luôn 0 tới 7b | Khớp cách chặn |
| Đặt lại MFA từ console | `POST /platform/tenants/{id}/users/{userId}/mfa/reset`: ghi `CROSS_TENANT_READ` rồi audit `entity: mfa` như đặt lại trong GA | TEN-6; trường hợp GA chỉ có một Chủ GA và người đó mất điện thoại |

## 2026-11-11: Hướng kiến trúc đích (đang thảo luận, chưa làm)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Dữ liệu production | Product Owner xác nhận chưa có GA nào dùng thật trên production (câu K) | Đổi database lúc này không phải chuyển dữ liệu |
| Database đích | PostgreSQL thay MongoDB, có Row-Level Security cho tenant, PgBouncer, TypeORM 1.x (Product Owner chọn thay Drizzle ngày 12/11/2026); chi tiết ở [thiet-ke-he-thong.md](thiet-ke-he-thong.md) | Dữ liệu CRM có quan hệ chặt; RLS chặn lộ dữ liệu tenant ngay trong database; `pg_trgm` cho tìm kiếm tiếng Việt |
| Hạ tầng bất đồng bộ | Redis (cache và queue tách riêng), BullMQ, worker riêng, outbox, WebSocket (Socket.IO) | Việc nặng ra khỏi request; thông báo và kanban cập nhật ngay |
| Phần kỹ thuật của đặc tả | `requirement/02` và `docs/kien-truc-backend.md` không còn là căn cứ kỹ thuật; quy tắc nghiệp vụ và `CLAUDE.md` giữ nguyên | Product Owner yêu cầu thiết kế lại phần kỹ thuật |
| Chưa làm | Code vẫn chạy trên MongoDB. Bắt đầu chuyển khi Product Owner đồng ý bắt đầu giai đoạn 1 (mục 13 của thiết kế) | Đây là thay đổi lớn, cần chốt lộ trình trước |

## 2026-11-12: Giai đoạn 1 kiến trúc mới: nền PostgreSQL (`apps/api`)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Cách chuyển | Ứng dụng mới `apps/api` (NestJS + TypeORM + PostgreSQL) chạy song song với `backend/` (MongoDB) và giữ nguyên hợp đồng HTTP (`/api/v1`, mã lỗi, payload), để frontend và các test e2e dùng lại được. Chuyển từng module kèm test; khi đủ thì đổi frontend sang `apps/api` và bỏ `backend/` | Không chạy hai database trong cùng một nghiệp vụ: audit phải nằm cùng transaction (AUD-3). User model đang được 14 module đọc thẳng, nên sửa tại chỗ từng module sẽ phải đụng gần hết code cùng lúc |
| Trong lúc chuyển | `backend/` chỉ sửa lỗi, không thêm tính năng; tính năng mới làm ở `apps/api` | Không phải làm một việc hai lần |
| Database | PostgreSQL 18 trong Docker, cổng 5433 (máy này đã có PostgreSQL khác ở 5432). Role: `crm_owner` chạy migration, `crm_app` (không bypass RLS) cho API, `crm_platform` (BYPASSRLS) cho đường xuyên tenant. Tạo ở `infra/postgres/init/01-roles.sh` | TEN-1, TEN-6 |
| Cô lập tenant | RLS `FORCE` trên mọi bảng nghiệp vụ, policy theo `app_tenant()`; `app_tenant()` báo lỗi khi chưa đặt tenant nên quên lọc là lỗi chứ không lộ dữ liệu. `TenantDb.run(scope, ...)` đặt tenant bằng `set_config(..., true)` trong transaction | TEN-1, TEN-3, an toàn với PgBouncer chế độ transaction |
| Quyền | Audit: API chỉ `SELECT, INSERT` (mục 22.4). Users: chỉ được xóa người INVITED chưa từng đăng nhập (USER-14), do policy RLS chặn chứ không chỉ code. Tenants: API chỉ đọc. Outbox: API chỉ `INSERT`, relay đọc bằng `crm_platform`. `login_attempts`: chỉ `crm_platform` | Quyền tối thiểu |
| Ràng buộc trong database | Email duy nhất (USER-2); mã đại lý duy nhất trong GA trừ người đã lưu trữ (ROLE-2, USER-13); chỉ Platform Admin không có GA (ROLE-3); `UNIQUE (tenant_id, id)` làm đích cho khóa ngoại ghép | Database là lớp kiểm tra cuối |
| Khóa chính | `uuid` mặc định `uuidv7()` (có sẵn từ PostgreSQL 18), sắp theo thời gian | Index chèn cuối, không phân mảnh |
| Chưa làm | Phân vùng `audit_events` theo tháng, workspaces `packages/`, job dọn session / lời mời / bộ đếm đăng nhập hết hạn (MongoDB dùng TTL, PostgreSQL cần job ở giai đoạn 3) | Chưa cần hoặc chờ worker |

## 2026-11-12: Chuyển nhóm identity sang `apps/api`

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | Đã chuyển audit, tenants (cài đặt GA, ma trận quyền), users, auth (đăng nhập, phiên, lời mời, đặt lại mật khẩu, MFA, giới hạn đăng nhập sai), agents, platform (console GA, Platform Admin đầu tiên), seed demo. Hợp đồng HTTP giữ nguyên: frontend hiện tại đăng nhập và dùng được Người dùng, Cây đại lý với `apps/api` | Giai đoạn 1 |
| Kiểm tra phiên | Một câu SQL (session + user + tenant + cài đặt) thay cho 4-5 lần đọc của MongoDB | Điểm nghẽn B2 |
| Chuỗi hash audit | Giữ như cũ (AUD-1): mỗi GA một dòng `audit_chains`, khóa tới hết transaction; các lệnh ghi cùng GA xếp hàng chờ thay vì xung đột rồi chạy lại như MongoDB | Không đổi nghiệp vụ khi chưa có câu trả lời H |
| ROLE-5 | `SELECT ... FOR UPDATE` trên `tenant_settings` thay cho trường `headGuard` | Khóa dòng có sẵn trong PostgreSQL |
| `authVersion` | Tăng khi đổi vai trò / mã đại lý, khóa, lưu trữ, kích hoạt lại, đổi / đặt lại mật khẩu, đặt lại MFA | Chuẩn bị cache phiên ở Redis (giai đoạn 3) mà vẫn thu hồi ngay |
| Thông báo "lời mời đã được nhận" (NTF-2) | Ghi vào outbox (`notification.invite_accepted`); chưa hiện chuông tới khi module notifications chuyển sang | Module notifications chưa chuyển |
| Migration quyền theo phiên bản (`permissionsVersion`) | Không chạy lúc khởi động như `backend/`; GA mới đã có đủ quyền mặc định. Quyền thêm sau này đi bằng migration SQL | Không có dữ liệu cũ trên PostgreSQL |
| Id | UUID (v7). Đường dẫn có id sai định dạng trả `400`, như `MongoIdPipe` trước đây | Giữ hợp đồng |
| Test | 4 bộ e2e chép từ `backend/test` (auth, settings, mfa, plan-limits) chạy trên PostgreSQL; các câu kiểm tra database đi qua `test/support/collections.ts` (dịch bộ lọc kiểu MongoDB sang SQL). TEN-2 nay kiểm tra mọi bảng có `tenant_id` đều bật và ép RLS. 2 case để lại cho module leads và AI (`it.todo`) | Giữ nguyên ý nghĩa các test cũ |
| Module `access` | Chưa tách; `scopeCodes` vẫn ở AgentsService như `backend/`. Tách khi chuyển leads, là nơi đầu tiên dùng nó | Không làm module chưa có ai dùng |
| Cấu trúc thư mục | Giữ phẳng như `backend/` (`modules/<tên>/*.service.ts`), entity nằm trong `infrastructure/`. Chia lớp `api/application/domain` làm sau, khi module lớn | Chuyển và đổi cấu trúc cùng lúc thì khó so với bản cũ |

## 2026-11-12: Chuyển leads sang `apps/api`

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | Đã chuyển: lead (tạo, danh sách, kanban, chi tiết, sửa, phân công, chọn theo bộ lọc, đếm tab, bộ lọc gợi ý), ghi chú và liên hệ, góp ý và @tên, việc của lead, bộ lọc đã lưu, danh mục lead, xóa / khôi phục / gộp / xóa vĩnh viễn (PDP), và module thông báo (chuông, danh sách, đánh dấu đã đọc, cài đặt) | Giai đoạn 2 |
| Chưa chuyển | Nhập lead từ file (module imports), form công khai (module campaigns), tên khách hàng liên kết trên lead (module clients: hiện trả `clientName: null`) | Đi cùng module của chúng |
| Bảng | `leads`, `lead_history`, `interactions`, `comments`, `tasks`, `saved_filters`, `lead_options`, `notifications`, `notice_keys`; `campaigns` và `campaign_members` mới có bảng. Mọi bảng có RLS. Ghi chú, góp ý, lịch sử, việc, thành viên chiến dịch gắn với lead bằng khóa ngoại ghép `(tenant_id, lead_id)` | Database chặn tham chiếu chéo GA |
| Xóa mềm | Không còn plugin tự lọc: mọi truy vấn lead đi qua `live()` (`deleted_at IS NULL AND erased_at IS NULL`). Xóa vĩnh viễn sau 30 ngày chỉ cần một `DELETE`, phần còn lại theo `ON DELETE CASCADE` | Rõ ràng hơn plugin |
| Phạm vi nhìn thấy | Module `access` mới (`leadAgentCodes`) là nơi duy nhất trả về đại lý mà một người được xem lead | Theo thiết kế: một chỗ cho quy tắc nhìn thấy |
| Tìm kiếm | Index trigram trên `name_norm` và `phone`, nên tìm theo một phần tên hoặc số vẫn dùng được index | Điểm nghẽn tìm kiếm trên MongoDB |
| Phân công | Khóa các lead được giao (`FOR UPDATE`) để hai người phân công cùng lúc không chen nhau | Thay cho xung đột ghi của MongoDB |
| Thông báo | Vẫn ghi trong cùng transaction như `backend/` (chưa có worker). Lời mời được nhận nay gửi thông báo thật, không qua outbox nữa | Worker và outbox relay là giai đoạn 3 |
| Test | Chép `leads`, `lead-board`, `lead-removal`, `lead-options` từ `backend/test`: 165 case tích hợp / e2e xanh; 3 case về nhập file để `todo`. `test/support/collections.ts` thêm `insertOne`, `insertMany`, `$or`, `$regex`, và đọc cột `date` thành chuỗi | Giữ nguyên ý nghĩa test cũ |

## 2026-11-12: Chuyển clients sang `apps/api`

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | Đã chuyển: danh sách khách theo phạm vi và tab tín hiệu, trang 360° (có audit lần xem), thêm / sửa khách và hợp đồng nhập tay, phân công khách, gia đình, quyền lợi bảo hiểm, cơ hội chăm sóc, ghi chú và góp ý trên khách, danh mục chương trình bảo hiểm, liên kết lead với khách (gợi ý, liên kết, bỏ liên kết, khách đi theo người phụ trách lead) | Giai đoạn 2 |
| Chưa chuyển | Ghi dữ liệu file Success vào khách và hợp đồng (`applyImport`), và tên file nhập trong tab Lịch sử: đi cùng module imports. `advanceLinkedLeads` đã chuyển, chờ imports gọi | Cần kiểu dữ liệu và bước commit của imports |
| Hợp đồng | Đại lý, người trên hợp đồng và dòng sản phẩm giữ dạng mảng JSON như Success gửi (`agents`, `clients`, `products` kiểu `jsonb`). Truy vấn dùng cột mảng: `current_agent_codes` (code ghi) và `client_codes` (trigger tự tính từ `clients`), cùng index GIN; tìm hợp đồng theo chương trình dùng `products @> ...` | Chuyển đúng hành vi mà không phải viết lại phần đọc file Success; vẫn có index |
| Số tiền | Cột `bigint` cho VND, đọc ra số nhờ transformer | `bigint` của PostgreSQL trả về chuỗi |
| Truy vấn ghép | `core/persistence/fragment.ts`: dựng điều kiện SQL bằng `sql`, `and`, `or`, giá trị luôn là tham số | Bộ lọc khách hàng nhiều điều kiện tùy chọn, không ghép chuỗi tay |
| Lịch sử thay đổi | Bảng `record_changes`: API chỉ được thêm, không sửa / xóa | Mục 22.4 |
| Quyền thêm sau (test 11, PERM-2) | Khôi phục bước khởi động cấp `catalog.manage` cho ADMIN của GA cũ một lần (`TenantsService.onModuleInit`), chạy bằng SQL. Mục 2026-11-12 trước ghi bỏ bước này, nay không còn đúng | Test bắt buộc 11 cần hành vi này |
| Lead | Trang lead hiện tên khách liên kết; thông báo về khách hiện tên khách | Hết phần chờ ở mục chuyển leads |
| Test | Chép `client-care`, `manual-clients`, `comments`: 194 case tích hợp / e2e xanh; 1 case cần file Success để `todo`. `clients`, `client-assign`, `lead-link` tạo dữ liệu bằng file Success nên chuyển cùng imports; bản gốc vẫn chạy ở `backend/` | Giữ nguyên ý nghĩa test cũ |

## 2026-11-12: Chuyển imports sang `apps/api`

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | Đã chuyển toàn bộ luồng nhập: tạo lần nhập, nhận dòng vào bảng tạm, xem trước, commit, hủy, danh sách, lỗi, báo cáo lỗi Excel, file mẫu, ghép cột và đại lý cho file lead. Ba loại dữ liệu: cây đại lý (01_Agents), Success (02-05, 07_Activities), lead. Các hàm thuần (đọc ô, lập kế hoạch từng sheet, file mẫu) chép nguyên | Giai đoạn 2 |
| Một transaction | Commit vẫn ghi cả file trong một transaction, như `backend/`. Lần nhập bị khóa dòng (`FOR UPDATE`) trong lúc commit, nên bấm hai lần không ghi hai lần | Giữ nghĩa "tất cả hoặc không có gì" tới khi Product Owner trả lời câu I (open-questions) |
| Ghi hàng loạt | `core/persistence/upsert.ts`: thêm mới theo lô 500 dòng; cập nhật theo khóa tự nhiên bằng một câu `UPDATE ... FROM jsonb_to_recordset`, chỉ ghi các cột dòng đó có, nên ô trống không xóa dữ liệu (IMP-5) | Không dùng `INSERT ... ON CONFLICT`: PostgreSQL kiểm tra NOT NULL trước khi xét trùng, nên dòng chỉ có vài cột của bản ghi cũ sẽ bị từ chối |
| Id tạo trong code | `newId()` tạo UUID v7 (theo thời gian, như mặc định của database) cho lead mới của file, vì lịch sử, ghi chú và việc cần làm phải trỏ tới lead trước khi chèn | Thứ tự lead giống khi database tạo id |
| Bảng mới | `imports`, `import_errors`, `import_rows` (bảng tạm, xóa khi commit hoặc hủy), `success_activities`. Lỗi và dòng tạm đi theo lần nhập qua khóa ngoại `ON DELETE CASCADE` | Bảng tạm cũ dùng TTL 7 ngày của MongoDB; trên PostgreSQL cần job dọn ở giai đoạn 3 |
| Tab Lịch sử của khách | Hiện tên file nhập của mỗi thay đổi | Hết phần chờ ở mục chuyển clients |
| Test | Chép `imports` và bật lại `clients`, `client-assign`, `lead-link`, phần file của `leads`, `lead-options`, `manual-clients`, case LEAD-29 của `settings`: 277 case tích hợp / e2e xanh. Còn 1 case `todo`: giới hạn token AI (module ai). Một chỗ sửa test: ngày kết thúc phần chia hợp đồng lưu trong JSON nên đọc ra là chuỗi ISO, không phải `Date` | Test kiểm tra dạng lưu bên trong, không phải hành vi |
| Giới hạn request | Khôi phục giới hạn 4 MB riêng cho `/api/v1/imports` (lô 500 dòng), đã lỡ bỏ khi chép `configure-app` | Mục 17.10 |

## 2026-11-12: Chuyển campaigns sang `apps/api`

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | Đã chuyển chiến dịch và hội thảo (danh sách, tạo, sửa, xóa, trang số liệu, người tham dự, điểm danh) và form đăng ký công khai (cấu hình, trang `/f/:slug`, gửi đăng ký kèm Turnstile). Nhận lead từ form (`LeadsService.createFromForm`) chuyển cùng | Giai đoạn 2 |
| Tra form theo slug | Đọc chiến dịch, trạng thái GA và tên hiển thị qua `PlatformDb.run('public-form')`, vì slug là khóa duy nhất. Ghi lead và bộ đếm thì quay về `TenantDb` của GA đó | TEN-6: chỉ một lần đọc vượt tenant, có lý do ghi rõ |
| Bộ đếm theo số điện thoại | Bảng mới `form_hits` (RLS như mọi bảng nghiệp vụ). Mỗi lần gửi tăng bộ đếm bằng `INSERT ... ON CONFLICT DO UPDATE` rồi xóa các bộ đếm đã hết hạn của GA đó | MongoDB dùng TTL; PostgreSQL không có. Job dọn định kỳ để giai đoạn 3 |
| Số liệu chiến dịch | Chỉ đếm lead còn sống: lead trong thùng rác (LEAD-40) và lead đã xóa dữ liệu (PDP-6) không vào số lead, giai đoạn, người tham dự | `backend/` vô tình đếm cả lead trong thùng rác. Chiến dịch vẫn không xóa được khi còn lead trong thùng rác trỏ tới |
| Test | Chép `campaigns` và `public-form`: 288 case tích hợp / e2e xanh. `startApp` nhận thêm hàm thay provider (Turnstile giả) | |

## 2026-11-12: Chuyển work sang `apps/api`

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | Đã chuyển việc cần làm (danh sách của tôi và của tuyến, thêm việc cá nhân và việc của khách, sửa, hoàn thành, mở lại, hủy), "Hôm nay", lịch, link lịch ICS riêng, và vòng nhắc việc (việc tới hạn, hẹn trong 15 phút, lead sắp quá hạn liên hệ, buổi sáng: việc quá hạn, lead quá hạn của tuyến, cơ hội chăm sóc, xóa hẳn lead trong thùng rác quá 30 ngày) | Giai đoạn 2 |
| Bảng mới | `calendar_tokens` (RLS như mọi bảng nghiệp vụ, chỉ lưu mã băm của token) và `job_locks` (khóa chạy vòng nhắc việc, không thuộc GA nào: bật FORCE RLS không kèm policy nên chỉ `crm_platform` đọc được, như `login_attempts`) | TASK-6, TASK-7 |
| Đọc feed ICS | Chỉ việc tra token đi qua `PlatformDb.run('calendar-feed')`; đọc người dùng, việc và cuộc hẹn chạy trong `TenantDb` của GA đó | TEN-6: token là khóa duy nhất, như link mời |
| Vòng nhắc việc | Vẫn chạy mỗi phút trong tiến trình API. Khóa `job_locks` (lý do `scheduler`) giữ cho một instance chạy; danh sách GA đang hoạt động đọc qua `PlatformDb`, còn mọi việc của từng GA chạy trong `TenantDb` của GA đó | Giai đoạn 3 chuyển sang worker BullMQ |
| Chỉ lead còn sống | "Hôm nay" (lead mới hôm nay), lịch hẹn, nhắc hẹn và nhắc lead sắp quá hạn bỏ qua lead trong thùng rác (LEAD-40) và lead đã xóa dữ liệu (PDP-6) | `backend/` vô tình đếm và nhắc cả những lead này |
| Sửa thêm | Ba chỗ chạy nhiều câu SQL song song trên cùng một transaction (tên trong thông báo, kiểm tra người được nhắc tên ở lead và khách hàng) nay chạy lần lượt | Một transaction là một kết nối; `pg` 9 sẽ báo lỗi thay vì cảnh báo |
| Test | Chép `work` và `notifications`: 305 case tích hợp / e2e xanh, còn 1 case `todo` (giới hạn token AI). Test TEN-2 thêm `job_locks` vào danh sách bảng không có `tenant_id` | |

## 2026-11-12: Chuyển seed showcase sang `apps/api`

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | `apps/api/src/seed/showcase.ts`: cùng dữ liệu demo như `backend/` (thêm đại lý và người dùng, một lời mời đang chờ, một tài khoản bị khóa, một người đã nghỉ, 3 chiến dịch, 44 lead mỗi GA đủ mọi tab và trạng thái, góp ý, việc cần làm, một lần nhập lead có lỗi, một lần nhập cây đại lý chờ xác nhận, 5 khách hàng có hợp đồng). `npm --prefix apps/api run seed` chạy lại an toàn: lần hai không thêm gì | Giai đoạn 2 |
| Qua service thật | Lead, việc, góp ý, nhập dữ liệu, khách hàng đều tạo qua service, nên lịch sử và nhật ký audit giống khi người dùng thao tác. Chỉ lùi ngày (lead, lịch sử, liên hệ đầu, việc tự tạo) và chèn chiến dịch, ghi giờ đăng nhập gần nhất bằng SQL trong `TenantDb` của GA | Lead quá hạn phải được giao từ nhiều ngày trước |
| Mật khẩu demo | `applyDemoPasswords` đặt `Demo@2026` cho mọi tài khoản demo không ở trạng thái mời, và xóa bộ đếm đăng nhập sai. Tài khoản bị khóa hay đã nghỉ vẫn giữ trạng thái nên vẫn không đăng nhập được | Như `backend/` |
| Chưa chuyển | Lệnh `seed:reset` (xóa database rồi tạo lại) chưa có ở `apps/api`; `npm run seed` ở thư mục gốc vẫn chạy seed của `backend/` (MongoDB) | Frontend mặc định vẫn gọi `backend/` |
| Test | Chép `seed`: 316 case tích hợp / e2e xanh, còn 1 case `todo` (giới hạn token AI). Mọi bộ test e2e của `backend/test` đã có ở `apps/api` trừ `reports` và `ai-settings` | |

## 2026-11-12: Chuyển reports sang `apps/api`

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | Đã chuyển R1 chuyển đổi, R2 hoạt động đại lý, R3 phễu theo nguồn / chiến dịch / nguồn SĐT, R5 pipeline theo đội, R7 khối lượng chăm sóc, R8 bàn giao lead, và ghi nhận xuất báo cáo (RPT-6). Hàm thuần dựng cây báo cáo, đếm hoạt động, kỳ báo cáo chép nguyên | Giai đoạn 2 |
| Tính bằng SQL | Đếm theo đại lý trong một câu `count(*) FILTER (...) GROUP BY`; R5 lấy ngày vào giai đoạn bằng truy vấn con trên `lead_history`; R7 dùng đúng điều kiện tín hiệu của danh sách khách hàng (`ClientsService.signalClause`) | Thay cho aggregate của MongoDB, cùng kết quả |
| Một transaction cho mỗi báo cáo | Phạm vi người xem (RPT-3) và mọi lần đọc của một báo cáo chạy trong cùng một transaction `TenantDb` | Các con số của một báo cáo khớp nhau |
| Lead trong thùng rác | Không tính, như `backend/` (plugin xóa mềm). Lead đã xóa dữ liệu (PDP-6) vẫn được đếm, vì chỉ mất thông tin cá nhân | Giữ nguyên nghĩa |
| Test | Chép `reports`: 326 case tích hợp / e2e xanh, còn 1 case `todo` (giới hạn token AI). Chỉ còn `ai-settings` của `backend/test` chưa chép | |

## 2026-11-12: Chuyển ai sang `apps/api`, xong giai đoạn 2

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | Đã chuyển lát cắt 7a: cài đặt AI của GA (bật / tắt, model theo mức FAST / BALANCED / DEEP, model phân loại, hạn mức token tháng), khóa API theo nhà cung cấp (lưu, xóa, xem 4 ký tự cuối), đọc danh sách model và kiểm tra khóa. Client gọi nhà cung cấp và danh mục nhà cung cấp chép nguyên | Giai đoạn 2 |
| Bảng mới | `ai_settings` (một dòng mỗi GA, tạo với giá trị mặc định ở lần đọc đầu) và `ai_provider_keys`, đều có RLS. Hạn mức token là `bigint` | Mục 18.8 |
| Mã hóa khóa | Dùng `common/secret-box.ts` (AES-256-GCM, HKDF, dữ liệu gắn kèm "tenantId:provider") như bí mật MFA, mục đích `ai-provider-keys/v1`, khóa từ `AI_KEYS_SECRET`. Khóa đã lưu ở MongoDB không đọc được ở đây; GA nhập lại khóa | Một cách mã hóa cho cả dự án; chưa có dữ liệu thật |
| Biến môi trường | `apps/api` nhận `AI_KEYS_SECRET` (bắt buộc ở production) và `AI_PLATFORM_KEY_GEMINI / DEEPSEEK / QWEN`; dòng trống coi như chưa đặt | AI-15 |
| Gọi nhà cung cấp | Kiểm tra khóa và đọc model gọi ra ngoài sau khi transaction đã đóng | Nhà cung cấp chậm không giữ kết nối database |
| Test | Chép `ai-settings` và bật case giới hạn token của `plan-limits`: 335 case tích hợp / e2e xanh, không còn case `todo`. Mọi bộ test e2e của `backend/test` đã chạy trên `apps/api` | |

## 2026-11-12: Đổi mặc định sang `apps/api`, dừng `backend/`

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Mặc định | Proxy của frontend gọi cổng 4200. `npm run dev:api`, `seed`, `seed:reset`, `build`, `test`, `setup`, `db:up` ở thư mục gốc chạy `apps/api` và PostgreSQL; bỏ `dev:api2` | Product Owner đồng ý 12/11/2026 |
| `backend/` | Giữ nguyên thư mục để tra cứu, không chạy, không sửa, không nằm trong `npm test`. Container MongoDB và volume của nó vẫn còn; `npm run db:up` không bật MongoDB nữa | Chưa xóa vì là thao tác không đảo ngược được |
| Seed | `npm run seed` chạy migration rồi mới seed, nên máy mới chỉ cần `db:up` và `seed`. `npm run seed:reset` (`apps/api/src/seed/reset.ts`) xóa database của `DATABASE_OWNER_URL`, tạo lại từ migration rồi seed; từ chối khi `NODE_ENV=production` | Thay cho bản MongoDB |
| Chỉ mục quy tắc | `npm run docs:rules` quét `apps/api/src`, `apps/api/test` và `frontend/src` | Code đã chuyển |
| Dọn dẹp | Bỏ script `db:generate` (drizzle-kit) và thư mục `apps/api/drizzle` rỗng còn sót từ giai đoạn 1 | Dự án dùng TypeORM, không dùng Drizzle |
| Kiểm tra trên trình duyệt | Cấu hình `api-check` (cổng 4201) dùng database riêng `ga_crm_check`, nên kiểm tra giao diện không đụng dữ liệu dev | Skill `ga-crm-verify` |
| Hồ sơ | `CLAUDE.md`, `README.md`, các skill `ga-crm-*` viết lại theo `apps/api` | |

## 2026-11-13: Giao diện dùng shadcn/ui; chuyển nhanh tài khoản khi thử

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Bộ thành phần | `frontend/src/components/ui.tsx` dựng lại trên shadcn/ui (Radix), giữ nguyên tên và props nên mọi màn hình đổi theo. Button, Input, Textarea, Select (NativeSelect, vẫn dùng `register`), Field (Label), Dialog, ConfirmDialog (AlertDialog), RowMenu (DropdownMenu), Badge, Alert, Notice, ChipGroup (ToggleGroup), TabBar (Tabs, thay 9 hàng tab tự viết), toast (Sonner). Menu tài khoản dùng DropdownMenu, chuông thông báo dùng Popover, menu trên điện thoại dùng Sheet | Người dùng yêu cầu dùng shadcn/ui; Radix lo focus, bàn phím, ARIA |
| Giữ hệ thiết kế | Màu của shadcn ánh xạ vào token sẵn có (`@theme inline` trong `index.css`), nên 5 theme và màu nhấn vẫn đúng. Bỏ đổ bóng, lớp `dark:`, vòng focus của shadcn; `rounded-full` thành `rounded-sm`; chữ tiếng Anh trong component đưa vào `vi.json` | `desigin.md` và CLAUDE.md quy tắc 10 vẫn áp dụng |
| Khác bản cũ | Hộp thoại không đóng khi bấm ra ngoài (tránh mất dữ liệu đang gõ); ô văn bản cao theo `rows`, không tự giãn; tooltip của sidebar thu gọn giữ bản tự viết | Không để form đổi chiều cao hay mất nội dung |
| Toast | `lib/toast.ts` gọi Sonner, giữ API cũ và thời gian hiển thị (lỗi 8 giây, cảnh báo 7 giây, còn lại 4 giây). Sonner thông báo mọi toast ở mức lịch sự (`polite`), kể cả lỗi | Bản cũ dùng `role="alert"` cho lỗi; lỗi trong form và hộp thoại vẫn hiện tại chỗ với `role="alert"` |
| Chuyển nhanh tài khoản | `DEV_ACCOUNT_SWITCHER=true` trong `.env` bật `GET /api/v1/dev/accounts` (mọi tài khoản của mọi GA) và `POST /api/v1/dev/switch` (vào bằng tài khoản đó, không cần mật khẩu hay MFA, ghi kiểm toán LOGIN kèm `via: dev-switch`). Tắt thì cả hai trả 404. Giao diện: nút "Đổi tài khoản" trên thanh trên cùng và "Đăng nhập nhanh bằng tài khoản thử" ở trang đăng nhập, mở danh sách tìm nhanh (Command) nhóm theo GA | Thử nhanh các vai trò. Không có ở production: API từ chối khởi động khi `NODE_ENV=production` và cờ bật; bản build production không chứa component và không gọi API này. Đọc danh sách qua `PlatformDb` với lý do `dev-switcher` |
| Test | 1 unit test cấu hình môi trường, 3 case e2e khi bật cờ, 1 case khi tắt; test mặc định tắt cờ dù `.env` bật. `toast.test` viết lại theo Sonner | |

## 2026-11-14: Dọn tài liệu không còn dùng

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Đã xóa | `spec-v2.1-vi/` và `spec-v2.1-vi.zip` (bản sao giống hệt `requirement/`), `requirement/v2.0/` (đặc tả 2.0 đã được v2.1 thay), `nestjs_core_researching.md` ở thư mục gốc | Người dùng yêu cầu bỏ file không dùng. Các mục cũ bên dưới còn nhắc tới những file này là ghi chép lịch sử |
| Giữ lại | `docs/kien-truc-backend.md` (bản đánh giá kiến trúc MongoDB cũ, chỉ để tham khảo) | Người dùng chọn giữ |

## 2026-11-14: Đồng bộ các thành phần giao diện còn viết tay bằng shadcn/ui

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Thêm vào bộ kit | `Checkbox`, `RadioGroup` / `Radio` / `RadioCard`, `Segmented` (ToggleGroup một giá trị), `PickList` (Command), `IconButton` (kèm Tooltip), `Panel` (Card), đều trong `components/ui.tsx` trên nền shadcn/ui | Người dùng yêu cầu đồng bộ component bằng shadcn |
| Thay ở các màn hình | 18 ô đánh dấu thô (3 ô của React Hook Form chuyển sang `Controller`), radio ở hộp xóa lead và trang Giao diện, 4 nhóm nút đổi kiểu xem (Bảng / Kanban, Tháng / Tuần, kỳ báo cáo, loại liên hệ của ghi chú), 5 danh sách tìm rồi chọn (giao lead, giao khách, chọn quản lý, tìm người thân, chọn lead để gộp), 9 khung viền lặp lại, các nút chỉ có biểu tượng (phân trang, lịch, menu, xóa dòng) | Mỗi nơi trước đây viết một kiểu |
| Tooltip | Sidebar thu gọn và nút `…` của bảng dùng Tooltip của shadcn (`TooltipProvider` ở gốc, chờ 300 ms) thay cho tooltip tự viết và thuộc tính `title` | Một kiểu tooltip cho cả ứng dụng |
| Cố ý giữ viết tay | Bảng dữ liệu (`.data-table`), ô nhắc tên trong góp ý, dòng của cây đại lý và cây báo cáo (không gắn tooltip từng dòng vì cây có thể rất dài), ô ngày và ô chọn file của trình duyệt | Đã thống nhất bằng CSS chung, hoặc dùng thành phần của trình duyệt hợp hơn trên điện thoại |

## 2026-11-14: Realtime lát C0 (WebSocket, Valkey, chuông cập nhật ngay)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Phạm vi | Lát C0 của [thiet-ke-chat-realtime.md](thiet-ke-chat-realtime.md): Socket.IO trong tiến trình `apps/api`, chỉ transport `websocket`, path `/socket.io`. Chưa có chat và trạng thái trực tuyến (C1, C2) | Người dùng chọn làm realtime; câu J (thông báo chậm 60 giây hay realtime) coi như đã trả lời |
| Redis | Valkey 8.1 trong `docker-compose.yml` (`127.0.0.1:6380`, không lưu xuống đĩa, `allkeys-lru`), `npm run db:up` bật cùng PostgreSQL. `REDIS_URL` bật `@socket.io/redis-adapter` để sự kiện tới mọi bản API; để trống thì sự kiện chỉ trong một tiến trình (test chạy như vậy). Production bắt buộc có `REDIS_URL` | Mục 7 và 9.1 của thiết kế hệ thống. Valkey vì giấy phép BSD |
| Redis chết | API vẫn chạy: mỗi bản vẫn đẩy được tới socket của mình, lệnh publish chờ trong hàng đợi của ioredis (`maxRetriesPerRequest: null`) tới khi kết nối lại. Chuông quay về poll 60 giây khi mất socket | Redis cache được phép mất (mục 7); adapter không bắt lỗi publish, một promise bị từ chối sẽ làm dừng tiến trình |
| Xác thực socket | Cookie phiên như REST (`AuthService.authenticate`), từ chối khi chưa xong MFA. Origin lạ bị từ chối (`forbidden_origin`), không có Origin thì cho qua như `CsrfOriginGuard` (USER-18). Socket vào room `user:{id}` và `tenant:{id}` | Chống cross-site WebSocket hijacking; một nguồn sự thật cho phiên |
| Thu hồi socket | Ngắt ngay sau commit khi: đăng xuất, đăng xuất thiết bị khác, đổi / đặt lại mật khẩu, đặt lại MFA, khóa / lưu trữ người dùng, đổi trạng thái GA. Ngoài ra mỗi bản kiểm tra socket của mình mỗi 60 giây (một câu SQL cho mọi phiên). Trước khi ngắt gửi `session.ended`; trình duyệt hỏi lại `/me` và về trang đăng nhập nếu phiên đã hết | Phiên hết hạn hay bị xóa mà không có sự kiện vẫn bị ngắt trong tối đa 1 phút |
| Sau commit | `afterCommit(db, fn)` (`core/persistence/after-commit.ts`): `TenantDb` / `PlatformDb` chạy các hàm đã xếp sau khi transaction commit, bỏ khi rollback. Lỗi trong hàm chỉ ghi log | Không báo cho trình duyệt một thay đổi đã bị hoàn tác. Chưa cần outbox vì sự kiện chỉ mang id, mất thì trình duyệt tự đọc lại khi kết nối lại |
| Sự kiện | `notification.new` (NTF-1, tới người nhận), `notification.read` (các tab khác của cùng người), `session.ended`. Không chứa dữ liệu nghiệp vụ | Mục 9.2 |
| Frontend | `lib/realtime.ts` (`useRealtime` trong `AppShell`), `lib/realtimeStatus.ts`. Số trên chuông chỉ poll 60 giây khi không có socket; khi kết nối lại đọc lại thông báo một lần. Vite proxy `/socket.io` (ws) sang API | Bỏ poll mỗi phút của mọi tab |
| Production | Reverse proxy phải chuyển `/socket.io` (WebSocket, header `Upgrade`) tới API, cùng origin với ứng dụng để cookie đi kèm | Ghi lại để khi triển khai không quên |
| Test | 6 case e2e (`test/realtime.e2e-spec.ts`): từ chối không có phiên / token sai / origin lạ; thông báo chỉ tới người nhận, không tới GA khác, không gửi khi rollback; đã đọc tới tab khác; khóa người dùng ngắt ngay; đăng xuất chỉ ngắt phiên đó; vòng kiểm tra ngắt phiên hết hạn. 1 unit test `REDIS_URL`, 2 test frontend | |

## 2026-11-14: Realtime lát C1 (trạng thái trực tuyến, người dùng hoạt động bằng Redis bitmap)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Số thứ tự trong GA | Cột mới `users.member_no`, đánh số 1, 2, 3... theo từng GA, do trigger gán khi thêm người dùng (khóa advisory theo GA để không trùng số). Người dùng nền tảng không có số. Migration `Presence1763568000000` đánh số người cũ theo thứ tự tạo | Bitmap cần vị trí bit là số nhỏ, liền nhau; `uuid` không dùng được. Khác thiết kế (bộ đếm `tenants.member_seq`): `crm_app` không có quyền ghi bảng `tenants`. Chỉ lời mời chưa từng đăng nhập mới bị xóa hẳn (USER-12), nên một số có dùng lại cũng chưa từng có hoạt động |
| Trực tuyến | Mỗi tab gửi `presence.heartbeat {active}` mỗi 30 giây và ngay khi đổi trạng thái; API bật bit trong bitmap theo phút `t:{tenant}:on:<phút>` (và `act:` khi có thao tác trong 5 phút, tab đang hiện), TTL 3 phút. Trực tuyến = OR của phút này và phút trước; vắng mặt = có `on` mà không có `act`. Đóng tab cuối thì sau 5 giây xóa bit và báo ngay. Mỗi 15 giây một bản API (khóa theo vòng) so sánh với lần báo trước và gửi `presence.changed {online, idle, offline}` tới room của GA | Như thiết kế mục 6. Bản API chết thì người dùng của nó tự thành ngoại tuyến trong tối đa 2 phút |
| Vắng mặt | Chuyển sang vắng mặt khi không còn bit `act` trong 2 phút gần nhất, tức khoảng 5-7 phút sau thao tác cuối. Không xóa bit `act` khi một tab báo không thao tác | Người mở nhiều tab: tab ẩn không được làm người đó nhảy sang vắng mặt khi tab khác đang dùng |
| Người dùng hoạt động | Mỗi request REST và mỗi heartbeat bật bit trong `t:{tenant}:dau:<ngày VN>` (TTL 35 ngày), mỗi người một lần mỗi ngày mỗi bản API. WAU / MAU bằng `BITOP OR` rồi `BITCOUNT`. Màn hình mới `/users/activity` "Người dùng hoạt động" (quyền `users.manage`, nhóm Quản trị): đang trực tuyến, hôm nay, 7 ngày, 30 ngày, biểu đồ 30 ngày. Route `GET /presence`, `GET /presence/activity` | Thiết kế mục 6.3 |
| Lưu bền | Mỗi giờ một bản API gộp (OR) bitmap hôm nay và hôm qua vào bảng mới `activity_days` (`bytea`, RLS). Khi đọc báo cáo, ngày Redis đã mất được đặt lại từ PostgreSQL bằng `BITOP OR` (không mất bit vừa bật) | Redis cache dùng `allkeys-lru`, có thể xóa key. Nếu Redis mất key giữa ngày, người đã được đếm trên một bản API chỉ được tính lại từ bản lưu gần nhất (tối đa 1 giờ) |
| Chưa làm | Hash `seen` và cột `users.last_seen_at` ("Hoạt động 5 phút trước") | Chưa màn hình nào cần; làm cùng chat (C2) |
| Hiển thị | Chấm xanh (trực tuyến) hoặc vòng (vắng mặt) cạnh tên ở trang Người dùng (`PresenceDot` trong bộ kit, có tooltip và tên cho trình đọc màn hình). Biểu đồ dùng màu trung tính, không dùng màu primary | Quy tắc "blue acts" |
| Guard REST với WebSocket | Các guard toàn cục (origin, phiên, giới hạn theo người, quyền, throttler) bỏ qua ngữ cảnh không phải HTTP; socket đã được kiểm tra lúc bắt tay | Nest chạy guard toàn cục cả cho tin nhắn WebSocket, gây lỗi `request.get is not a function` |
| Test | Test tích hợp dùng Redis database 15 (`REDIS_URL` trong `vitest.config.int.ts`), không đụng database 0 của dev; cần `npm run db:up` để Valkey chạy. 7 case e2e `test/presence.e2e-spec.ts`, 5 unit test bitmap, 2 test frontend | |

## 2026-11-14: Chat 1:1 và chat nhóm (realtime lát C2, C3)

Chủ dự án trả lời câu K1, K3, K4 ngày 14/11/2026 (các câu K2, K5-K8 vẫn mở).

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Ai nhắn cho ai (K1) | Mọi tài khoản đang hoạt động trong cùng GA. Không có chat giữa các GA; người của GA khác, hoặc người không phải thành viên, nhận 404 | Chủ dự án chọn |
| Chủ GA đọc chat (K3) | Màn hình `/chat/review` "Tra cứu trò chuyện" (chỉ GA_HEAD): danh sách mọi cuộc trò chuyện của GA (tên nhóm, thành viên, số tin), mở xem 100 tin gần nhất. Mỗi lần mở ghi audit `CHAT_READ` trong cùng transaction. Admin không có quyền này | Chủ dự án chọn: Chủ GA đọc được, có audit |
| Số nhạy cảm (K4) | Trình duyệt cảnh báo khi tin có dãy giống số CCCD (12 số) hoặc số tài khoản (9-16 số, bỏ qua số điện thoại); người gửi xác nhận mới gửi. API không chặn | Chủ dự án chọn: cảnh báo, vẫn cho gửi (mã hợp đồng, số điện thoại dễ bị nhận nhầm) |
| Bảng | `conversations` (DIRECT có `direct_key` duy nhất theo cặp, GROUP có `title`), `conversation_members` (vai trò OWNER / ADMIN / MEMBER, `joined_seq`, `last_read_seq`, `muted`, `pinned_at`, `left_at`), `messages` (khóa `(conversation_id, seq)`, `client_msg_id` chống gửi trùng). RLS trên cả ba. Migration `Chat1763654400000` | Thiết kế mục 3 |
| Đánh số tin | Gửi tin khóa dòng `conversations` rồi tăng `last_seq`, nên tin của một cuộc trò chuyện được đánh 1, 2, 3... không hụt; số chưa đọc = `last_seq - max(last_read_seq, joined_seq)` | Không cần một dòng cho mỗi lần xem; trình duyệt biết khi bị thiếu tin |
| Đẩy tin | `chat.message` (tin đầy đủ), `chat.updated`, `chat.read`, `chat.conversation`, `chat.typing` tới room `user:` của từng thành viên, sau commit. Trình duyệt ghép tin theo `seq`, thấy hụt thì tải lại; khi kết nối lại thì đọc lại mọi thứ | Thiết kế mục 5; `chat.message` mang cả nội dung vì mọi thành viên thấy như nhau |
| Nhóm (C3) | Người tạo là chủ nhóm; chủ nhóm và phó nhóm đổi tên, thêm người; chỉ xóa được người có vai trò thấp hơn; chỉ chủ nhóm đặt phó nhóm. Chủ nhóm rời thì giao cho phó nhóm vào sớm nhất, không có thì thành viên vào sớm nhất. Người vào sau không thấy tin trước đó. Nhóm tối đa 500 người. Tin hệ thống lưu tên người tại thời điểm đó | Thiết kế mục 4 |
| Sửa, thu hồi | Người gửi sửa trong 15 phút (`chat_edit_window_closed`), thu hồi bất kỳ lúc nào; thu hồi xóa hẳn nội dung, không chỉ ẩn | PDP: tin gửi nhầm số nhạy cảm có thể xóa thật |
| 1:1 với người đã nghỉ | Chỉ đọc (`chat_member_inactive` khi gửi) | |
| Audit | Ghi cho tạo cuộc trò chuyện, đổi tên, thêm / xóa / rời, đổi vai trò, Chủ GA đọc. **Không** ghi cho từng tin nhắn | Khác CLAUDE.md quy tắc 4 ("audit mọi thao tác tạo"): bảng `messages` đã là bản ghi; ghi audit từng tin sẽ làm chuỗi hash của GA (câu H) thành nút thắt |
| @nhắc tên | Chỉ trong nhóm, chỉ giữ người đang là thành viên; tô màu trong tin. Chưa gửi thông báo riêng cho người được nhắc | Làm cùng thông báo tin chưa đọc (C4) |
| Giao diện | `/chat` (nhóm Công việc) hai cột, trên điện thoại một cột; cuộc trò chuyện đang mở và hộp thoại nằm trên URL. Biểu tượng chat có số chưa đọc trên thanh trên cùng (bỏ cuộc trò chuyện đã tắt thông báo). Enter gửi, Shift+Enter xuống dòng, không gửi khi bộ gõ tiếng Việt đang ghép chữ. "Đã xem" (1:1) / "Đã xem bởi N người" (nhóm) dưới tin cuối của mình. Ghim, tắt thông báo theo từng người | |
| Chưa làm (C4) | Gửi file và ảnh (chờ S3), gửi thẻ lead / khách, tìm trong tin nhắn, thông báo / email khi chưa đọc sau vài phút, thời gian lưu tin (K3 phần thời hạn), trả lời một tin cụ thể | Chờ worker, S3 và câu K6, K8 |
| Test | 17 case e2e `test/chat.e2e-spec.ts` (TEN-7, không phải thành viên, đánh số khi gửi song song, gửi trùng, đã đọc, sửa / thu hồi, đang gõ, nhóm, chủ nhóm rời, tắt thông báo, Chủ GA đọc có audit); 5 unit test quy tắc; 5 test frontend (ghép tin, câu tin hệ thống, phát hiện số nhạy cảm, đang gõ) | |

## 2026-11-14: Chat lát C4 (file và ảnh, tìm kiếm, thông báo tin chưa đọc)

Chủ dự án trả lời câu K6, K8 và phần thời hạn của K3 ngày 14/11/2026.

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Kho file | Lưu theo chuẩn S3 (`@aws-sdk/client-s3`, `core/storage/object-storage.ts`). Dev chạy MinIO trong docker-compose (`127.0.0.1:9100`, bucket `ga-crm`; test dùng `ga-crm-test`, bộ chạy thử dùng `ga-crm-check`), `npm run db:up` bật cùng PostgreSQL và Valkey. Production dùng S3 thật qua cùng biến `S3_*`; API từ chối khởi động khi thiếu `S3_BUCKET` | Chủ dự án chọn MinIO. MinIO ngừng phát hành image từ 2025, nên dùng bản Bitnami cuối có gắn phiên bản (`bitnamilegacy/minio:2025.7.23-debian-12-r5`): không còn được cập nhật, chỉ dùng trên máy dev |
| Loại và cỡ file (K8) | Ảnh JPG, PNG, WebP, HEIC; PDF; Word, Excel, PowerPoint (cả định dạng cũ). Tối đa 10 MB mỗi file, 5 file mỗi tin. Loại file đọc từ các byte đầu, không tin tên hay `Content-Type` của trình duyệt; SVG và HTML luôn bị từ chối. HEIC hiện như file tải về vì đa số trình duyệt không xem được | Chủ dự án chọn; khớp mức 10 MB của NOTE-8 |
| Tải lên, xem | Tải lên qua API (`POST /chat/conversations/{id}/files`, multipart), API kiểm tra rồi ghi vào kho; gửi tin với `fileIds`. Xem / tải qua `GET /chat/files/{id}`: API kiểm tra quyền rồi truyền file về, kèm `Content-Security-Policy: sandbox`. Trình duyệt không bao giờ nhận địa chỉ bucket | Một chỗ kiểm tra quyền; không cần mở CORS cho bucket |
| Ai xem được file | Thành viên thấy được tin chứa file (người vào sau không thấy file cũ), người tải lên khi chưa gửi, và Chủ GA (K3) | Như quyền đọc tin |
| Hạn mức gói | Tổng dung lượng file chat của GA không vượt `tenants.storage_mb` (`plan_storage_limit`) | Mục 5.2, lát 8a đã có cột này |
| Thu hồi, dọn | Thu hồi tin xóa luôn file trong kho (PDP). File tải lên mà không gửi trong 1 ngày bị xóa trong vòng chạy mỗi phút | |
| Tên file tiếng Việt | multer đọc tên theo Latin-1, nên API đọc lại theo UTF-8; tải về dùng `filename*=UTF-8''` kèm tên không dấu | |
| Tìm kiếm | `GET /chat/search?q=` (từ 2 ký tự): tin trong các cuộc trò chuyện của mình, không phân biệt dấu và hoa thường (hàm `immutable_unaccent` + index trigram), không ra tin trước khi vào nhóm và tin đã thu hồi, 30 tin mới nhất. Ô tìm ở cột trái trang chat; bấm kết quả thì mở cuộc trò chuyện, tải các trang cũ tới khi có tin đó và làm nổi tin trong 2,5 giây | |
| Thông báo tin chưa đọc (K6) | Mỗi phút một bản API (lease `chat-notices` trong `job_locks`) tìm người có tin chờ quá 5 phút: một thông báo trong app `CHAT_UNREAD` mỗi cuộc trò chuyện ("3 tin nhắn chưa đọc từ Lan" / "trong nhóm X"), không gửi lại tới khi có tin mới sau lần báo đó (`conversation_members.notified_seq`). Không gửi khi cuộc trò chuyện tắt thông báo hoặc người nhận đang trực tuyến và đang thao tác. Người được @nhắc tên nhận `CHAT_MENTION` ngay, kể cả khi đã tắt thông báo nhóm; bấm vào thì nhảy tới đúng tin. Hai loại mới có công tắc ở Cài đặt thông báo | Chủ dự án chọn thông báo trong app sau 5 phút. Chưa có email vì chưa chọn dịch vụ email (câu C); web push để khi có PWA |
| Thời gian lưu (K3) | Giữ mãi, chưa có job tự xóa tin và file | Chủ dự án chọn; thêm job khi pháp chế DLVN chốt thời hạn |
| Chưa làm | Gửi thẻ lead / khách trong chat, trả lời một tin cụ thể, ảnh thu nhỏ (ảnh gốc tối đa 10 MB được tải nguyên), quét virus file tải lên | Chưa có yêu cầu; quét virus cần dịch vụ riêng |
| Test | 11 case e2e `test/chat-files.e2e-spec.ts` (loại / cỡ / số file, quyền xem, TEN-7, thu hồi xóa file trong kho, dọn file chưa gửi, hạn mức gói, tìm không dấu, người vào sau, thông báo 5 phút, tắt thông báo / đã đọc / đang trực tuyến, @nhắc tên); 5 unit test nhận diện file và tên file; 1 test frontend | |

## 2026-11-14: Trả lời các câu hỏi mở

Chủ dự án trả lời ngày 14/11/2026: câu A, D, F, I trả lời riêng; các câu còn lại đồng ý theo đề xuất. Việc phát sinh nằm ở ROADMAP mục "Việc phát sinh từ câu trả lời 14/11/2026".

| Câu | Quyết định | Ảnh hưởng |
|---|---|---|
| A | Giữ NestJS + React; MFA tự làm (không dùng Next.js + Better Auth như đặc tả mục 2.2) | Không đổi gì: đang chạy như vậy |
| D | Không có giá trị mặc định do hệ thống đặt cho các danh sách phụ trong Cài đặt GA (lý do chốt xịt, nhu cầu chi tiết, nguồn số điện thoại, khu vực, loại chiến dịch). Chủ GA tự tạo: nhập tay, hoặc gửi cả danh sách một lần | Nhập tay đã có ở `/catalog`. Cần thêm "Thêm nhiều giá trị" (dán danh sách hoặc tải file). Các giá trị mặc định mà đặc tả liệt kê rõ (OPT-2) vẫn giữ |
| F | "2.000 người dùng đồng thời" là 2.000 phiên đang mở, rải trên nhiều GA. Giờ cao điểm tạm giả định 8:00–11:30 và 13:30–17:00 giờ Việt Nam [Giả định], sẽ kiểm lại bằng số liệu người dùng hoạt động thật | Kịch bản tải ở `thiet-ke-he-thong.md` mục 12 tính theo số phiên, không theo số request cùng lúc |
| I | File dưới 2.000 dòng: tất cả hoặc không có gì (như hiện nay). File từ 2.000 dòng: nhập theo từng lô, lô lỗi không chặn lô khác, cuối cùng báo các dòng lỗi | Đã làm 14/11/2026, xem mục "Nhập file lớn theo lô" |
| K2 | Nhân viên nền tảng không chat với GA | Không làm |
| K5 | Người dùng không được ẩn trạng thái trực tuyến. Đồng nghiệp trong GA xem được ai đang trực tuyến từ lúc nào, ai đã ngoại tuyến bao lâu | Làm ngay (mục kế tiếp của tài liệu này) |
| K7 | Chấp nhận trạng thái ngoại tuyến chậm tới 2 phút khi mạng rớt hoặc máy chủ lỗi | Không đổi |
| 4 | Quản lý tuyến (GAD, BM, UM) được phân công lại lead trong tuyến của mình. Xem điểm luyện tập của FC để lại tới lát AI | Cần làm: hiện chỉ người có `leads.manage` phân công được |
| 5, 12f | Chưa tự xóa hay ẩn danh lead và người dùng đã lưu trữ; giữ tới khi pháp chế DLVN chốt thời hạn (câu 1) | Không đổi |
| 12e | Khi một người dùng bị lưu trữ, Chủ GA phân công lại lead và khách bằng tay (như hiện nay), có nhắc "còn N lead / khách của người đã nghỉ" | Cần làm: lời nhắc |
| 6 | "Hẹn liên hệ tiếp" vẫn tự tạo việc cần làm (LEAD-31) | Không đổi |
| 8 | GA tự nhập khóa AI (đã làm ở 7a); khóa của nền tảng là dự phòng. Ngân sách mặc định mỗi GA vẫn là "không giới hạn" tới khi có con số | Không đổi |
| 11 | Zalo OA để sau v2.1 | Không làm |
| 12a | Nguồn lead tạo tay chỉ chọn từ Danh mục; nguồn mới từ file nhập vào được tự thêm vào Danh mục | Không đổi. **Đã thay ngày 24/11/2026:** form cho gõ giá trị mới, xem mục "Một ô Nguồn gốc" |
| 12b | Cho xóa hợp đồng nhập tay trong 7 ngày sau khi nhập, chỉ hợp đồng nhập tay (không phải từ Success), có ghi audit | Cần làm |
| 12c | Danh mục chương trình bảo hiểm chỉ gợi ý từ 11_Products, GA tự chọn | Làm cùng lát 8c (nạp 11_Products) |
| 12d | Quyền "Phân công khách hàng" (`clients.assign`) không cấp mặc định cho vai trò nào ngoài Chủ GA; Chủ GA tự cấp khi cần | Không đổi |
| G | Hướng hạ tầng: PostgreSQL, Redis và S3 dạng dịch vụ có sẵn của nhà cung cấp cloud; region Việt Nam hoặc Singapore tùy câu 1 (lưu trú dữ liệu) | Chọn nhà cung cấp cụ thể vẫn mở |

## 2026-11-14: Trạng thái trực tuyến kèm thời gian (K5)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Hiển thị | Trực tuyến: "Trực tuyến từ 08:15" (hôm khác: "từ 13/11 08:15"); vắng mặt: "Vắng mặt · trực tuyến từ 08:15"; ngoại tuyến: "Vừa hoạt động", "Hoạt động 12 phút trước", "Hoạt động 3 giờ trước", "Hoạt động hôm qua lúc 17:40", "Hoạt động ngày 10/11". Ở trang Người dùng (dòng dưới email, và tooltip của chấm), đầu luồng chat 1:1, danh sách thành viên nhóm. Chữ tự cập nhật mỗi 30 giây và ngay khi trạng thái đổi | K5: chủ dự án muốn biết ai đã ngoại tuyến bao lâu, trực tuyến từ lúc nào; không cho ẩn |
| "Trực tuyến từ" | Hash Redis `t:{tenant}:since` (member_no → thời điểm): đặt khi một vòng presence thấy người đó trực tuyến lần đầu (HSETNX), xóa khi ngoại tuyến. Có trong `GET /presence` (`since`) và sự kiện `presence.changed` | Không cần thêm lệnh Redis ở mỗi heartbeat |
| "Hoạt động lần cuối" | Mỗi heartbeat và mỗi lần ngắt ghi vào hash `t:{tenant}:seen`. Chép sang cột mới `users.last_seen_at` khi người đó ngoại tuyến và khoảng 5 phút một lần (không bao giờ lùi). `GET /presence/last-seen?ids=` (tối đa 100) lấy giá trị mới hơn giữa Redis và PostgreSQL; lần đăng nhập (`last_login_at`) cũng tính là hoạt động. Sự kiện `presence.changed` mang `lastSeen` của người vừa ngoại tuyến | Redis là cache có thể mất (mục 7); người dùng cũ chưa có `last_seen_at` vẫn có thời điểm từ lần đăng nhập |
| Phạm vi | Mọi người trong cùng GA xem được của nhau; người của GA khác không tìm thấy (TEN-7) | K5, K1 |
| Test | 1 case e2e mới và thêm kiểm tra vào 2 case cũ của `test/presence.e2e-spec.ts` (thời điểm trực tuyến, thời điểm ngoại tuyến và bản trong PostgreSQL, đọc lại khi Redis mất, TEN-7); 3 test frontend (câu chữ, ghép sự kiện) | |

## 2026-11-14: Quản lý tuyến phân công lại lead trong tuyến (câu 4)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Quyền | Quyền mới `leads.assign_line` "Phân công lead trong tuyến", mặc định cấp cho GAD, BM, UM; Chủ GA bật / tắt trong Phân quyền như mọi quyền. GA đã có nhận quyền này một lần khi API khởi động (`PERMISSION_STEPS`, phiên bản quyền 2); GA tắt nó sau đó thì giữ lựa chọn của mình | Câu 4 (14/11/2026). Đặc tả LEAD-21 chỉ cho người có `leads.manage`; đây là phần mở rộng có chủ ý |
| Phạm vi | Người có quyền này và có mã đại lý cấp quản lý (phạm vi tuyến) chỉ: giao lead đang thuộc tuyến của mình (chính mình và tuyến dưới) cho đại lý trong tuyến. Lead ngoài tuyến hoặc chưa giao ai trả 404 (như LEAD-6); giao cho đại lý ngoài tuyến trả `403 agent_out_of_line`; bỏ phân công (trả lead về GA) trả 403. FC được cấp quyền này cũng không dùng được, vì không có tuyến dưới | Không để quản lý tuyến chạm lead hay đại lý ngoài tuyến |
| Giữ nguyên | LEAD-9 (lead tự khai thác của người còn làm việc không chuyển được), LEAD-22 (lịch sử, audit ASSIGN, việc "liên hệ trong 48 giờ", thông báo cho người nhận), giới hạn 200 lead mỗi lần | Cùng một luồng `assignMany` |
| Giao diện | Danh sách lead: quản lý tuyến có ô chọn, "Chọn tất cả theo bộ lọc" và thanh phân công. Ô chọn người chỉ có đại lý trong tuyến, không có "Bỏ phân công", kèm dòng giải thích. Trang chi tiết lead: nút "Phân công" theo `canAssign` (mới); Gộp / Xóa vẫn chỉ cho người quản lý lead | |
| Test | 9 case e2e `test/lead-line-assign.e2e-spec.ts` (giao trong tuyến, đại lý ngoài tuyến, lead ngoài tuyến / chưa giao, bỏ phân công, LEAD-9, ô chọn người, chọn theo bộ lọc, nút trên trang chi tiết, tắt quyền, nâng cấp quyền cho GA cũ) | |

## 2026-11-14: Danh sách phụ của GA và "Thêm nhiều" (câu D, mục 5.2)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Danh sách phụ | Ba danh sách mới trong Danh mục: Khu vực (`region`), Nguồn SĐT (`phone_source`), Lý do chốt xịt (`lost_reason`), cùng bảng `lead_options` với Nhu cầu, Trạng thái, Nguồn (migration `GaLists1763913600000`). Bắt đầu trống, không có giá trị mặc định; mã chính là nhãn (như Nguồn, OPT-3) | Câu D: GA tự tạo. Ba danh sách này ứng với ba cột có sẵn của lead |
| Cách dùng | Chỉ là gợi ý: ô Khu vực (thêm / sửa lead) và ô Lý do chốt xịt đưa ra các giá trị đang hiện của GA, vẫn gõ được giá trị khác; API không bắt giá trị phải nằm trong danh sách (khác OPT-8 của Nhu cầu, Trạng thái, Nguồn) | Lead cũ và file nhập đã mang giá trị tự do; bắt buộc sẽ làm hỏng dữ liệu có sẵn |
| Quy tắc giữ nguyên | Không trùng nhãn khi bỏ qua hoa thường và dấu (OPT-4); giá trị đang có lead dùng chỉ ẩn được, không xóa (OPT-5); chỉ Chủ GA sửa, Admin xem | Như Danh mục lead |
| Thêm nhiều | Nút "Thêm nhiều" ở mọi danh sách: dán (mỗi dòng một giá trị; dán từ Excel lấy ô đầu), hoặc chọn file Excel / CSV / TXT (cột đầu; bỏ dòng tiêu đề nếu là tên danh sách hoặc "Giá trị", "Tên", "Nhãn"). Xem trước số giá trị mới, giá trị bỏ qua vì đã có / lặp lại, giá trị dài quá 60 ký tự. `POST /lead-options/bulk` (tối đa 200 nhãn), mỗi giá trị thêm vào ghi audit `CREATE` như thêm từng cái | Câu D: "có thể tự gửi danh sách" |
| Chưa làm | Nhu cầu chi tiết (lead chưa có trường này), Loại chiến dịch (đang là danh sách cố định CMP điều khiển hành vi chiến dịch) | Cần thêm trường / đổi luật chiến dịch; hỏi lại khi cần |
| Kèm theo | Thanh tab (`TabBar`) tự cuộn tới tab đang chọn trên điện thoại | Trang Danh mục có 7 tab; mở từ URL thì tab đang chọn nằm ngoài màn hình |
| Test | 6 case e2e `test/ga-lists.e2e-spec.ts`; 4 test frontend (tách dòng, CSV, bỏ tiêu đề, xem trước) | |

## 2026-11-14: Xóa hợp đồng nhập tay sai (POL-7, câu 12b)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Điều kiện | Chỉ hợp đồng nhập tay (`origin = MANUAL`), chưa lần nhập Success nào ghi vào (`last_import_id` trống), và nhập chưa quá 7 ngày (`policyDeletable` trong `client-rules.ts`). Ngoài điều kiện → `409 policy_not_deletable` | Câu 12b (14/11/2026): 7 ngày, chỉ hợp đồng nhập tay. Khớp đề xuất của POL-7: hợp đồng đã được Success ghi vào là dữ liệu của DLVN |
| Ai xóa | Người sửa được khách hàng (đại lý sở hữu khách, Chủ GA), như sửa hợp đồng (POL-4); quản lý tuyến không sở hữu khách nhận `403 client_not_yours`; chỉ hợp đồng có tên khách đang mở; GA khác 404 | Cùng quyền với sửa |
| Thực hiện | `DELETE /clients/{code}/policies/{policyNo}`: xóa hợp đồng, tính lại liên kết của các khách trong hợp đồng, audit `DELETE policy` kèm khách, đại lý phục vụ, ngày nhập, số dòng chương trình (không giữ số tiền hay thông tin cá nhân) | AUD-3: audit trong cùng transaction |
| Giao diện | Trang khách hàng: thẻ hợp đồng có menu "⋯" → "Xóa hợp đồng" khi API trả `canDelete`; hộp xác nhận nói rõ không hoàn tác được. Hộp xác nhận không nằm trên URL (quy tắc với thao tác xóa) | |
| Test | 5 case e2e `test/policy-delete.e2e-spec.ts` (xóa và audit, quá 7 ngày, đã có lần nhập / từ Success, quản lý tuyến / Chủ GA / GA khác, hợp đồng của khách khác); 2 unit test quy tắc | |

## 2026-11-14: Nhắc lead và khách của người đã nghỉ (câu 12e)

| Nội dung | Cách làm | Lý do |
|---|---|---|
| Ai là "người đã nghỉ" | Mã đại lý mà một tài khoản đã khóa / lưu trữ từng giữ và không tài khoản đang hoạt động hay đang mời nào giữ nữa, hoặc đại lý "Ngưng hoạt động" (AGT-7). Định nghĩa dùng chung ở `modules/access/departed.ts` | Cùng nghĩa "người tạo còn làm việc" của LEAD-9 |
| Đếm | Lead đang mở (trạng thái khác Đã chốt, Chốt xịt, Không quan tâm, như LEAD-23) và khách đứng tên (sở hữu) của từng người. `GET /leads/departed` (quyền `leads.manage`) | |
| Nhắc ở đâu | (1) Toast khi khóa / lưu trữ: "Còn N lead đang mở và M khách đứng tên người này". (2) Dải nhắc ở đầu trang Người dùng, từng người kèm lối tắt "Phân công lại lead" (`/leads?assignee=<mã>`) và "Xem khách hàng" (`/clients?agents=<mã>`). (3) Dải nhắc ở đầu danh sách Lead, nút "Xem để phân công lại" lọc `assignee=DEPARTED`; bộ lọc người được giao có thêm "Người đã nghỉ". (4) Thông báo `DEPARTED_WORK` cho các Chủ GA khác (người vừa khóa đã thấy toast), có công tắc ở Cài đặt thông báo | Câu 12e: Chủ GA phân công lại bằng tay, có nhắc và lối tắt |
| Không lặp | Chỉ báo khi người đó rời đi lần đầu (khóa hoặc lưu trữ từ đang hoạt động / đang mời); lưu trữ một người đã khóa không báo lại. Không báo khi người khác đang giữ mã đó | |
| Không tự chuyển | Lead và khách không tự chuyển cho ai; phân công lại dùng luồng có sẵn (LEAD-21, ASG) | Câu 12e |
| Test | 7 case e2e `test/departed-work.e2e-spec.ts` (chưa ai nghỉ, khóa thì liệt kê và bỏ lead đã đóng, thông báo cho Chủ GA, bộ lọc DEPARTED và phân công lại, lưu trữ sau không báo lại, đại lý ngưng hoạt động, quyền và TEN-7) | |

## 2026-11-14: Nhập file lớn theo lô (câu I)

| Điểm | Quyết định | Lý do |
|---|---|---|
| Ngưỡng | Tính theo tổng số dòng của file (cộng mọi sheet, kể cả dòng bị từ chối ở bước kiểm tra). Dưới 2.000 dòng: một transaction như cũ, lỗi thì không ghi gì. Từ 2.000 dòng: ghi theo lô | Chủ dự án chọn |
| Cách chạy | Bấm "Xác nhận ghi" thì API chỉ chuyển lần nhập sang `COMMITTING` rồi trả về ngay; phần ghi chạy nền trong chính tiến trình API. Kế hoạch ghi (plan) được tính lại một lần lúc bắt đầu, như trước | Chưa có hàng đợi (BullMQ ở giai đoạn 3). Yêu cầu HTTP có hạn 30 giây, file 20.000 dòng không ghi kịp trong một yêu cầu |
| Lô | 500 bản ghi mỗi lô, mỗi lô một transaction: lead; đại lý (rồi một bước dựng lại cây); khách hàng, khách suy ra từ hợp đồng, hợp đồng kèm sản phẩm, hồ sơ; hoạt động. Bước cuối của Success (lịch sử thay đổi IMP-21, tính lại liên kết CUS-4, chuyển lead LEAD-33) chạy một lần sau mọi lô. Thứ tự giữ như ghi một lần | Lô đại lý ở sau vẫn trỏ được quản lý ở lô trước vì cây được dựng lại sau cùng |
| Lô lỗi | Lô lỗi bị hủy, các lô khác vẫn ghi. Mỗi dòng của lô lỗi có một lỗi `batch_failed` (đúng sheet, dòng, mã bản ghi) để người dùng lọc và nhập lại; số đếm "Mới / Cập nhật" trừ đi các dòng đó và chúng được tính vào "Từ chối". Lịch sử thay đổi của bản ghi trong lô lỗi không được ghi | Chủ dự án chọn: báo dòng lỗi ở cuối |
| Tiến độ | Cột `imports.progress` `{done, total, failedBatches, failedRows}` cập nhật sau mỗi lô; sự kiện WebSocket `import.progress` tới người tải lên. Màn hình chi tiết lần nhập có thanh tiến độ và tự hỏi lại 3 giây một lần khi chưa có socket; khi xong thì báo (toast) ở bất kỳ trang nào đang mở | Người dùng có thể rời trang trong lúc ghi |
| Bị ngắt giữa chừng | Lần nhập ở `COMMITTING` mà 10 phút không nhúc nhích (máy chủ khởi động lại) được đóng: chuyển `COMMITTED`, phần đã ghi giữ nguyên, thêm lỗi `import_interrupted`, ghi audit IMPORT có `interrupted: true`. Mỗi bản API quét 5 phút một lần. Tắt API bình thường thì chờ các lô đang chạy ghi xong | Không có hàng đợi thì không chạy tiếp được; ít nhất người dùng biết phần nào chưa vào |
| Audit | Một sự kiện IMPORT ở cuối, như trước, thêm `batches`, `failedBatches`, `failedRows`. Mỗi lô ghi dữ liệu nghiệp vụ trong transaction riêng nên không có audit theo lô | AUD-3 cho lần nhập; từng bản ghi vẫn có `last_import_id` |
| Chưa làm | Chạy tiếp lần nhập bị ngắt; hàng đợi nhiều bản API (BullMQ); thông báo trong chuông khi nhập xong (NTF-2), hiện chỉ có toast | Giai đoạn 3 |
| Test | 6 case e2e `test/import-batches.e2e-spec.ts` (dưới ngưỡng vẫn tất cả hoặc không, trên ngưỡng ghi theo lô và báo đúng 500 dòng của lô lỗi, file Success lớn tính liên kết một lần, không xác nhận / hủy khi đang ghi, đóng lần nhập bị ngắt, TEN-7); IMP-13 2.000 dòng nay đi đường ghi theo lô | |

## 2026-11-14: Trang chủ có biểu đồ realtime (Highcharts)

| Điểm | Quyết định | Lý do |
|---|---|---|
| Thư viện | Highcharts 13.1.1 qua gói React chính thức `@highcharts/react` 5.4.0 (component JSX: `Chart`, `XAxis`, `BarSeries`...) | Chủ dự án chọn. Highcharts miễn phí chỉ cho dùng phi thương mại; GA CRM là phần mềm thương mại nên **cần mua giấy phép Highcharts trước go-live** (đã báo, chủ dự án quyết dùng) |
| Ai thấy gì | Số liệu lead theo đúng phạm vi báo cáo RPT-3: FC thấy lead của mình, quản lý tuyến thấy tuyến, Chủ GA / `reports.view_all` / `leads.manage` thấy toàn GA. Người không có phạm vi (không mã đại lý, không quyền xem báo cáo) thấy lời nhắc thay biểu đồ. Biểu đồ "Người dùng hoạt động" chỉ cho `users.manage`. Quản trị nền tảng thấy "Người dùng theo GA". Chỉ có số đếm và tổng, không có tên hay số điện thoại lead nên không cần che (quy tắc 3) | Một API `GET /reports/dashboard?days=7|30|90` dùng chung phạm vi với báo cáo |
| Thẻ số liệu | 5 thẻ lead + 1 thẻ trực tuyến, mỗi thẻ có sparkline và mũi tên xu hướng so với kỳ trước cùng độ dài (phần trăm; số tuyệt đối khi kỳ trước bằng 0). Lead mới / đã liên hệ / đã chốt tính theo ngày lead và ngày liên hệ lần đầu (giờ Việt Nam). Lead đang mở và giá trị pipeline theo từng ngày được dựng ngược từ hiện tại bằng các lần tạo lead và đổi giai đoạn trong `lead_history`; giá trị dùng giá trị hiện tại của lead, FC / tuyến tính trên các lead đang giữ | Không cần bảng chụp số liệu hằng đêm; một truy vấn gộp theo ngày |
| Realtime | Mỗi audit của `lead`, `lead_contact`, `import`, `agent`, `lead_option` (sau khi commit) gọi `RealtimeService.touchDashboard`: tối đa một sự kiện `dashboard.changed` mỗi 5 giây mỗi GA, lần thay đổi cuối luôn được báo. Trình duyệt chờ ngẫu nhiên tới 2 giây rồi đọc lại qua REST (chỉ trang đang mở biểu đồ). Không có socket thì hỏi lại mỗi phút | Chủ dự án chọn "đẩy khi dữ liệu đổi"; móc vào audit nên mọi đường ghi đều được tính |
| Sắp xếp trên URL | `stageSort`, `sourceSort`, `agentSort`, `gaSort` và `days`; chỉ ghi khi khác mặc định | Yêu cầu của chủ dự án; tải lại hoặc gửi link giữ nguyên |
| Màu | Token `--color-chart-1/2` trong mọi theme (cặp xanh / cam đã kiểm tra mù màu và tương phản ≥ 3:1 trên nền mỗi theme; test `theme.test.ts`). Màu trục, lưới, chú thích, tooltip lấy từ token của app và đặt trên từng component, vì mặc định của Highcharts theo chế độ sáng / tối của hệ điều hành chứ không theo theme của app | Màu dữ liệu không dùng cho nút |
| Bố cục | Bỏ dải "Xin chào" và "Truy cập nhanh" theo yêu cầu; giữ "Hôm nay" (TASK-5) và "Tài khoản và quyền" ở dưới biểu đồ | |
| Test | 6 case e2e `test/dashboard.e2e-spec.ts` (phạm vi GA / tuyến / FC, chuỗi ngày dựng lại khi đổi giai đoạn, kỳ 7/30/90, TEN-7, sự kiện realtime và giới hạn 5 giây); 5 test frontend sắp xếp / gộp "Khác" / xu hướng; test tương phản màu biểu đồ | |

## 2026-11-14: Một mục "Cài đặt" trong sidebar

| Điểm | Quyết định | Lý do |
|---|---|---|
| Sidebar | Bỏ nhóm "Cài đặt" có 4 dòng; thay bằng một mục "Cài đặt" ở cuối sidebar, mở trang `/settings` | Chủ dự án yêu cầu, sidebar gọn hơn |
| Trang `/settings` | Bốn thẻ: Giao diện, Đổi mật khẩu, Bảo mật, Thông báo (thẻ Thông báo chỉ cho người dùng trong GA, như trước). Mỗi thẻ có biểu tượng, tên và một dòng mô tả, bấm vào mở trang cài đặt tương ứng (đường dẫn cũ giữ nguyên) | Danh sách thẻ ở `SETTINGS_ITEMS` trong `lib/nav.ts` |
| Breadcrumb | Ở trang con hiện "Cài đặt › Giao diện", chữ "Cài đặt" là link về `/settings`; mục "Cài đặt" trong sidebar sáng khi đang ở bất kỳ trang cài đặt nào | |
| "Nhập dữ liệu" | Bỏ khỏi sidebar: trang "Cây đại lý" và "Lịch sử nhập" đã có nút mở `/imports/new`. Mục nav vẫn giữ (có `parent: '/agents'`) để sidebar sáng "Cây đại lý" khi đang nhập | Chủ dự án thấy trùng lối vào, không tốt cho UX |
| Breadcrumb | Dùng component Breadcrumb của shadcn/ui (`components/shadcn/breadcrumb.tsx`). Nhiều cấp: nhóm sidebar (chữ thường, không link) › màn hình cha có link › trang hiện tại. Ví dụ "Đại lý › Cây đại lý › Nhập dữ liệu", "Lead › Danh sách lead › Chi tiết lead", "Đại lý › Lịch sử nhập › Chi tiết lần nhập", "Cài đặt › Bảo mật". Logic ở `breadcrumbTrail` trong `lib/nav.ts` (màn hình con khai báo ở `CHILD_SCREENS`), có test `breadcrumb.test.ts` | Chủ dự án yêu cầu; trước đó breadcrumb viết tay và chỉ có 2 cấp |

## 2026-11-14: Tài khoản và thông báo mở thành panel bên phải

| Điểm | Quyết định | Lý do |
|---|---|---|
| Component | Drawer của shadcn/ui (`components/shadcn/drawer.tsx`, trên `vaul` 1.1.2), hướng phải, bọc trong `SidePanel`. Panel nổi cách mép màn hình 8 px, rộng 400 px (điện thoại: gần hết bề ngang), bo góc, viền `band`, nền phía sau tối 40 %. Header và footer là dải `chrome`, lề chữ 20 px; dòng trong danh sách thụt vào và bo góc khi rê chuột | Chủ dự án muốn kiểu Notification Center của macOS, gọn ở cả dark mode |
| Tài khoản | Thay DropdownMenu: tên, email, GA, vai trò, mã đại lý, phạm vi dữ liệu, lối vào "Cài đặt", nút "Đăng xuất" ở chân panel | |
| Thông báo | Thay Popover: 20 thông báo mới nhất (trước là 8), thông báo chưa đọc có nền nhạt và chấm xanh, "Đánh dấu đã đọc hết" ở header, "Xem tất cả thông báo" ở chân. Bấm một thông báo thì đóng panel và mở nơi nó trỏ tới | |
| Focus | Mở panel thì focus vào chính panel (không vào nút đầu tiên, để Enter không lỡ đánh dấu đã đọc hết); Esc đóng và trả focus về nút đã mở. Panel không có viền focus, các nút bên trong vẫn có | |

## 2026-11-14: Màu giai đoạn trên Kanban lead

| Điểm | Quyết định | Lý do |
|---|---|---|
| Màu | Mỗi giai đoạn một màu: Mới xám xanh, Đã liên hệ xanh dương, Đã hẹn gặp tím, Đã gặp xanh ngọc, Đã tư vấn / báo giá vàng, Đã nộp HSYCBH cam, Đã phát hành HĐ xanh lá, Thất bại đỏ. Token `--color-stage-*` có trong mọi theme (bản sáng và bản tối riêng), test bảo đảm tương phản ≥ 3:1 trên nền `canvas` và `chrome` | Chủ dự án muốn phân biệt giai đoạn bằng màu, nhạt, không đậm |
| Dùng thế nào | Cột: nền pha 9 % màu giai đoạn vào `chrome`, vạch 3 px phía trên, chấm màu trước tên, số đếm trên nền pha 16 %. Thẻ: vẫn nền `canvas`, chỉ có sọc trái 3 px pha 75 %. Chữ giữ màu chữ thường | Màu chỉ để nhận diện, tên giai đoạn vẫn là chữ; không dùng cho nút (xanh vẫn chỉ cho hành động) |
| Xem chi tiết từ Kanban | Kéo thả chỉ để chuyển giai đoạn. Xem chi tiết bằng nhấp đúp vào thẻ, Enter khi thẻ đang được chọn, hoặc "Xem chi tiết" (mục cuối menu "⋯"). Chi tiết mở trong panel bên phải (`LeadPeek`): giai đoạn theo màu Kanban, trạng thái, nhu cầu, người được giao, nguồn, chiến dịch, các mốc liên hệ, 3 ghi chú gần nhất, nút "Mở trang chi tiết". Mã lead nằm trên URL (`peek`). Tên trên thẻ không còn là link, để nhấp đúp không chuyển trang | Chủ dự án yêu cầu tách kéo thả và xem |

## 2026-11-14: Trang đăng nhập: minh họa động, bỏ header

| Điểm | Quyết định | Lý do |
|---|---|---|
| Header | Các trang dùng `AuthLayout` (đăng nhập, nhận lời mời, đặt lại mật khẩu, cài xác thực hai lớp) không còn thanh header. Logo nằm trên panel xanh; dưới 1024 px panel ẩn thì logo nằm trên form | Chủ dự án yêu cầu |
| Minh họa | `LoginScene`: SVG gồm các nhóm `<g>` là các khối của CRM: pipeline có một thẻ đi qua ba giai đoạn, thẻ lead có chấm thông báo, biểu đồ cột lớn dần và đường xu hướng tự vẽ, cây đại lý sáng dần từng cấp, các đường nét đứt "dữ liệu chảy" nối các khối. Chuyển động bằng CSS (`crm-scene-*` trong `index.css`), không thêm thư viện | Chủ dự án cho chọn `<g>` hoặc GSAP; CSS đủ cho mức này và không tăng dung lượng tải |
| Trợ năng | Hình chỉ để trang trí (`aria-hidden`). Khi hệ điều hành bật "giảm chuyển động" thì hình đứng yên, vẫn vẽ đầy đủ | Quy tắc chuyển động của design system |
| Màu | Panel xanh giống nhau ở mọi theme, nên hình dùng trắng với vài độ trong và ba màu nhấn cố định (xanh nhạt, vàng, xanh lá) | |

### Bổ sung cùng ngày: panel 60 / 40, nền lục giác, minh họa nhiều lớp

| Điểm | Quyết định | Lý do |
|---|---|---|
| Tỉ lệ | Từ 1024 px, panel xanh chiếm 60% bề ngang, form 40% (`lg:grid-cols-[3fr_2fr]`). Ở 1024 px form còn rộng 362 px, vẫn đủ | Chủ dự án yêu cầu |
| Chữ trên panel | Bỏ tiêu đề "CRM cho Tổng Đại lý" và dòng mô tả; panel chỉ còn logo và hình. Hai khóa `auth.heroTitle`, `auth.heroBody` đã xóa khỏi `vi.json` | Chủ dự án yêu cầu để hình chiếm trọn panel |
| Nền lục giác | `HexBackdrop`: canvas phủ kín panel, vẽ lưới lục giác. Ô gần con trỏ sáng lên và mờ dần thành vệt; nhấn chuột tạo vòng lan; thỉnh thoảng một ô tự sáng và có một dải sáng mờ trôi chéo. Lưới và độ sáng tính ở `lib/hexGrid.ts` (có test). Không chạy khi panel ẩn (dưới 1024 px) | Chủ dự án yêu cầu nền "Hexagon Pattern" có tương tác |
| Minh họa | `LoginScene` vẽ lại: bảng điều khiển ở giữa (chỉ số có sparkline, đường xu hướng tự vẽ, phễu pipeline), quanh nó là các khối kính nổi ở nhiều độ sâu: thẻ lead, thông báo chốt deal, việc cần làm, vòng mục tiêu, Kanban có thẻ di chuyển, cây đại lý, khung chat đang gõ; hai quỹ đạo có điểm sáng chạy vòng. Các khối bay vào lần lượt khi mở trang; cả hình nghiêng theo con trỏ và khối gần hơn dịch nhiều hơn (biến CSS `--scene-x`, `--scene-y`). Vẫn là SVG và CSS, không thêm thư viện | Chủ dự án muốn hình "wow" hơn và rộng hết panel |
| Giảm chuyển động | Khi hệ điều hành bật "giảm chuyển động": lưới lục giác đứng yên, hình không nghiêng, không bay vào, mọi khối vẽ đầy đủ | Quy tắc chuyển động của design system |

## 2026-11-14: Dữ liệu demo theo 5 khu vực

| Điểm | Quyết định | Lý do |
|---|---|---|
| GA demo | Bỏ "Tổng đại lý Demo 1, 2"; seed tạo 5 GA: `GA-HN` Tổng đại lý khu vực Hà Nội, `GA-HCM` Hồ Chí Minh, `GA-MT` Miền Trung, `GA-MN` Miền Nam, `GA-MB` Miền Bắc. Mỗi GA có cây đại lý, người dùng và dữ liệu mẫu như trước | Chủ dự án yêu cầu dữ liệu giống thực tế hơn |
| Tài khoản, mã | Giữ cách đánh số: GA thứ N có email `<vai trò>@gaN.gacrm.local`, mã đại lý `00N000xx`, mật khẩu `Demo@2026`. GA 1 (Hà Nội) và GA 2 (Hồ Chí Minh) vẫn là cặp mà test so sánh (TEN-7) | Không phải đổi tài khoản quen dùng và test |
| Test | Mỗi bộ test tích hợp seed cả 5 GA nên chạy chậm hơn (toàn bộ khoảng 400 giây) | Đổi lại test chạy trên đúng dữ liệu seed thật |
| Trang chủ | Bỏ breadcrumb "Trang chủ" (trang chủ không có nơi để quay lại) và dòng "Tự cập nhật khi có thay đổi"; biểu đồ vẫn tự cập nhật | Chủ dự án yêu cầu |

## 2026-11-14: Sidebar dùng component Sidebar của shadcn/ui

| Điểm | Quyết định | Lý do |
|---|---|---|
| Component | `components/shadcn/sidebar.tsx` (bản Radix, kiểu new-york, vì dự án dùng `radix-ui`; trang tài liệu chủ dự án gửi là bản Base UI, cấu trúc giống nhau, chỉ khác `asChild` thay cho `render`), kèm `collapsible`, `separator`, `skeleton` và hook `hooks/use-mobile.ts`. Sidebar của app (`AppSidebar`) dựng từ `SidebarProvider`, `Sidebar collapsible="icon"`, `SidebarHeader/Content/Footer`, `SidebarGroup` + `Collapsible`, `SidebarMenuButton`, `SidebarRail`, `SidebarInset` | Chủ dự án yêu cầu |
| Khác bản gốc | Mốc chuyển sang ngăn kéo là 1024 px (mốc `lg` của app) thay cho 768 px; không dùng cookie `sidebar_state`, trạng thái thu gọn vẫn lưu trong localStorage như trước (`open` / `onOpenChange`); chữ cho trình đọc màn hình lấy từ `vi.json`; `SidebarInset` là `<div>` vì nội dung đã có `<main>`; không có viền cạnh phải (dải nền tách khối) | Giữ hành vi và design system đang có |
| Giữ nguyên | Rộng 224 px, thu gọn còn 56 px với tooltip từng dòng; dòng 36 px (44 px trên điện thoại); nhóm gập được và nhớ; mục đang chọn màu xanh; tải trước màn hình khi rê chuột; "Cài đặt" ở chân | |
| Mới | Logo nằm ở đầu sidebar (trên điện thoại vẫn ở header); phím tắt Ctrl/⌘ + B; bấm mép phải sidebar (rail) để thu gọn / mở rộng | Có sẵn trong component |
| Nút tròn ở mép | Thêm lại theo yêu cầu của chủ dự án (2026-11-14): nút tròn 28 px trên mép phải sidebar, nằm giữa chiều cao màn hình nên không xê dịch khi nhóm đóng mở; có tooltip "Thu gọn" / "Mở rộng"; chỉ hiện từ 1024 px. Sidebar nâng lên `z-20` để nút không bị ô dính của bảng che | Bản đầu của lần chuyển sang shadcn/ui đã bỏ nút này; chủ dự án muốn giữ |
| Màu | Token `--color-sidebar*` trỏ về token của app (`chrome`, `ink-nav`, `band`, `primary`) nên theo mọi theme | |

## 2026-11-16: Xóa bản cũ trên MongoDB

| Điểm | Quyết định | Lý do |
|---|---|---|
| `backend/` | Xóa khỏi thư mục dự án (chuyển vào Thùng rác của máy dev, tên `GA-CRM-backend-2026-11-16`). Không code nào của API mới hay `frontend` dùng tới nó | Chủ dự án yêu cầu; tránh nhầm khi gửi source cho khách |
| MongoDB | Bỏ dịch vụ `mongodb` và hai volume khỏi `docker-compose.yml`; bỏ các biến `MONGO_*`, `MONGODB_URI` và `PORT` (cổng của bản cũ) khỏi `.env` và `.env.example`; gỡ container `ga-crm-mongodb` và volume `ga-crm_mongodb_*` | Không còn gì dùng MongoDB |
| Còn giữ | Ghi chú lịch sử trong code ("như MongoDB từng làm"), `test/support/collections.ts` (lớp giả lập kiểu Mongo trên SQL cho test), `docs/kien-truc-backend.md` (đánh giá cũ) và các mục cũ trong tài liệu | Giải thích vì sao code như hiện nay |

## 2026-11-16: Đổi `apps/api` thành `backend/`

| Điểm | Quyết định | Lý do |
|---|---|---|
| Cấu trúc | API chuyển từ `apps/api` lên `backend/` ở thư mục gốc, bỏ thư mục `apps/`. Thư mục gốc: `backend/`, `frontend/`, `infra/`, `scripts/`, `docs/`, `requirement/` | Chủ dự án yêu cầu cấu trúc chuẩn; `apps/` chỉ có một ứng dụng |
| Đã sửa theo | Lệnh `npm --prefix backend` trong `package.json` gốc, `.claude/launch.json`, `scripts/build-rule-index.mjs`, hai đường dẫn tương đối trong code (`config/load-env.ts` đọc `.env` gốc, `common/errors.spec.ts` đọc `vi.json`), ghi chú trong `.env` / `.env.example`, `CLAUDE.md`, skill, README, HANDOFF, ROADMAP, tài liệu thiết kế | |
| Đọc tài liệu cũ | Các mục trước 16/11/2026 trong file này ghi `apps/api` là chính `backend/` hiện nay. Các mục ghi `backend/` (MongoDB) là bản cũ đã xóa (mục "Xóa bản cũ trên MongoDB") | Giữ nguyên nhật ký để không viết lại lịch sử |

## 2026-11-17: Sửa lỗi mức cao sau audit

Audit mã nguồn ngày 17/11/2026 tìm ra 3 lỗi mức cao; các lỗi còn lại ở [viec-con-lai.md](viec-con-lai.md), mục 1b.

| Điểm | Quyết định | Lý do |
|---|---|---|
| Người được bảo hiểm chính trên hợp đồng nhập tay (POL-2, CUS-4, CUS-6) | Mã người được bảo hiểm là khách đã có trong GA thì người nhập phải sở hữu khách đó (Chủ GA sở hữu mọi khách); nếu không, `403 insured_not_yours`, lỗi gắn vào ô `insuredClientCode` (`policies.<n>.insuredClientCode` khi thêm cùng khách hàng). Mã chưa có trong GA vẫn nhận, kèm tên. Khi sửa hợp đồng, giữ nguyên người được bảo hiểm cũ thì không kiểm tra lại. `insured_not_yours` là mã lỗi mới, không có trong mục 20 của đặc tả | Liên kết `POLICY_INSURED` cho đại lý phục vụ quyền sở hữu khách đó, nên trước đây một FC gõ mã khách của FC khác là chiếm được khách (xem, sửa) và đọc được tên. Đặc tả không nói người nhập phải sở hữu người được bảo hiểm; đây là cách hiểu chặt nhất của CUS-6 |
| Body 4 MB của `/api/v1/imports` | Chỉ đọc khi request có cookie phiên, và không giải nén (`inflate: false`, body nén trả 415). Không có cookie thì bộ đọc mặc định 100 KB của Nest xử lý và guard từ chối | Bộ đọc chạy trước guard phiên và giới hạn tần suất; trước đây 4 KB gzip của người lạ nở thành 4 MB JSON, chặn event loop khoảng 60 ms mỗi request. Frontend không gửi body nén |
| `multer` | Nâng từ 2.0.2 lên 2.5.0 | 9 lỗ hổng DoS (npm audit mức cao); route gửi file chat chạm tới được với mọi người đã đăng nhập |
| `uuid` trong `exceljs` | Chưa sửa (mức trung bình) | Chỉ sửa được bằng cách hạ `exceljs` xuống 3.4.0 (thay đổi gây vỡ). Lỗ hổng chỉ ở v3, v5, v6 khi truyền `buf`; `exceljs` chỉ gọi `v4()` không tham số nên không chạm tới |

## 2026-11-17: Sửa lỗi mức trung bình sau audit

| Điểm | Quyết định | Lý do |
|---|---|---|
| Cài MFA khi đã bật (USER-16) | `POST /auth/mfa/setup` và `/enable` trả `409 mfa_already_enabled` khi tài khoản đã bật MFA. Đổi điện thoại: tắt bằng mã rồi cài lại, hoặc quản trị viên đặt lại (khi MFA bắt buộc). Mã lỗi mới, không có trong mục 20 | Cài đặt không đòi mã, nên trước đây ai cầm một phiên đang mở gắn được ứng dụng xác thực của mình và lấy 10 mã khôi phục mới, vượt qua mã mà tắt MFA và tạo mã khôi phục đòi hỏi. Giao diện vốn chỉ cho cài khi chưa bật |
| IP khi đếm lần đăng nhập sai (mục 22.4) | Địa chỉ IPv6 tính theo cả /64; IPv4 viết dạng IPv6 (`::ffff:1.2.3.4`) là IPv4 (`common/ip-bucket.ts`) | Một máy IPv6 thường có cả /64, đổi địa chỉ là vượt mọi giới hạn theo IP |
| Khóa mã MFA theo tài khoản | Ngoài khóa theo tài khoản + IP, 10 lần sai mã MFA liên tiếp khóa bước nhập mã của tài khoản đó với mọi IP (15, 30, rồi 60 phút) | Ai tới bước này đã có mật khẩu; khóa họ không làm hại chủ tài khoản. Trước đây đổi IP là đoán tiếp được khoảng 7.200 mã mỗi ngày |
| `NODE_ENV` | Bắt buộc khai báo, không còn mặc định `development`; `.env.example` đã có dòng này | Cookie Secure, tắt Swagger, khóa bí mật thật, Turnstile và việc tắt bộ đổi tài khoản đều dựa vào biến này; quên đặt thì máy chủ âm thầm chạy như máy dev |
| `MFA_ENFORCE=false` | API từ chối khởi động với giá trị này khi `NODE_ENV=production` | Chỉ dùng cho demo và test |
| Bộ đổi tài khoản | Ngoài cờ `DEV_ACCOUNT_SWITCHER` và không phải production, còn phải gọi từ chính máy chạy API (địa chỉ socket 127.0.0.0/8 hoặc ::1, không đọc `X-Forwarded-For`) | Máy dev hay máy chủ cấu hình sai trong mạng chung không để người khác đăng nhập không mật khẩu. Proxy của Vite chạy trên cùng máy nên vẫn dùng được |
| Link lịch ICS (TENANT-3) | GA bị tạm ngưng thì link ICS trả 404; kích hoạt lại thì link cũ chạy lại | Trước đây link đã lưu trong ứng dụng lịch vẫn trả tên việc và tên lead |
| `permissions_version` của GA mới (PERM-2) | GA tạo mới ghi phiên bản quyền mới nhất. Lần cấp quyền mới lúc API khởi động ghi audit `PERMISSION_CHANGE` không có người thực hiện, `meta.added` liệt kê `VAI_TRÒ:quyền` | Trước đây GA mới nhận phiên bản 1, nên lần khởi động sau cấp lại `leads.assign_line` mà Chủ GA đã gỡ, không có audit |
| Dòng lịch sử gộp lead (LEAD-41, PDP-3) | Số điện thoại của lead bị gộp trên dòng `merge` được che như số của lead với người không làm việc trên lead | Trước đây quản lý tuyến đọc được số đầy đủ ở tab Lịch sử |
| Xóa theo PDP-6 | Ngoài tên, số, email, ngày sinh, ghi chú, còn xóa: số hồ sơ, số hợp đồng, dòng lịch sử `merge`, `noteEdited`, `noteDeleted`, `clientCode`, `applicationNo`, `policyNo`, ghi chú đổi giai đoạn và tên việc cần làm của lead. Giữ giai đoạn, ngày, nguồn, chiến dịch, đại lý, giới tính, tỉnh | Số hồ sơ, số hợp đồng trỏ thẳng về người đó trong dữ liệu Success như mã khách (đã xóa từ trước); các dòng lịch sử và tên việc là nội dung ghi chú do người gõ |
| Liên kết lead - khách với Marketing, Admin (CUS-5, PDP-4) | Chi tiết lead với người không có phạm vi đại lý (Marketing, Admin không kiêm vai trò đại lý) trả liên kết không có mã và tên khách; dòng lịch sử `clientCode` có giá trị rỗng. Giao diện ghi "Một khách hàng trong sổ của tư vấn viên…" và vẫn cho hủy liên kết | Hai vai trò này không xem trang khách hàng; trước đây chi tiết lead lộ mã và tên khách thật |
| Đăng xuất | Giao diện chỉ báo "Đã đăng xuất" khi API xác nhận (hoặc trả 401 vì phiên đã hết); lỗi khác báo "Chưa đăng xuất được" và giữ nguyên trang. Áp dụng cả ở trang bắt buộc cài MFA | Trước đây lỗi mạng vẫn chuyển về trang đăng nhập trong khi cookie còn hiệu lực; người sau trên máy dùng chung tải lại là vào tài khoản cũ |
| Trang đặt lại mật khẩu | Truy vấn `password-reset` vào `SESSION_FREE`, có test cho mọi truy vấn công khai | 401 của `/me` từng hủy truy vấn kiểm tra link, trang đứng ở vòng xoay |
| Đọc file Excel | Đọc ở chế độ dense của SheetJS, chỉ duyệt các dòng có ô; giữ tối đa 20.001 dòng dữ liệu mỗi sheet để API vẫn trả `import_too_large` (IMP-13) | File khai báo vùng `A1:XFD1048576` từng làm treo tab |
| Ô nhập ngày giờ | `toLocalInput` / `fromLocalInput` trong `lib/leadLabels.ts` luôn theo giờ Việt Nam (UTC+7), không theo múi giờ của máy; dùng cho việc cần làm, lịch hẹn của lead và ngày sự kiện của chiến dịch | Máy đặt múi giờ khác từng lưu lệch giờ so với giờ hiển thị (DATA-2) |

## 2026-11-17: Pipeline main → staging

| Điểm | Quyết định | Lý do |
|---|---|---|
| Nhánh `staging` | Do pipeline sinh ra từ `main`, không commit tay. Mỗi lần đồng bộ thêm một commit "Sync from main <sha>" lên trên lịch sử của `staging` | Chủ dự án muốn `staging` chỉ có code và file deploy, không có tài liệu nội bộ; làm tay bằng `git restore` dễ quên hoặc gõ sai |
| File được sang | Danh sách **cho phép** ở `deploy/staging-paths.txt`: `backend`, `frontend`, `deploy`, `infra`, `docker-compose.yml`, `.env.example`, `.gitignore`, `package.json`, `scripts/setup-env.mjs`. Đường dẫn không tồn tại trong danh sách làm script dừng | Danh sách loại trừ sẽ để lọt thư mục mới thêm vào `main` sau này (tài liệu, ghi chú) |
| Kích hoạt | Bằng tay: Actions > "Promote to staging" > Run workflow trên `main`. Push lên `main` không tự deploy | Chủ dự án chọn lúc đưa code sang staging; đổi sang tự động chỉ cần thêm `on: push` |
| Một workflow | `.github/workflows/staging.yml` chỉ có trên `main`, gồm ba job: `promote` (lọc và đẩy sang `staging`), `build` (kiểm tra và build đúng commit `staging` đó), `deploy`. `staging` không có workflow nào | Push bằng `GITHUB_TOKEN` không kích hoạt workflow khác, nên deploy phải nằm cùng lần chạy; cũng tránh deploy trùng |
| `deploy/` | Nằm trên `main` (trước đó chỉ có trên `staging`) | `main` là nguồn duy nhất; sửa script deploy không phải chuyển nhánh |
| Environment `staging` trên GitHub | "Deployment branches" đặt là `main` | Lần chạy xuất phát từ `main`; thiếu giới hạn này thì nhánh bất kỳ dùng được khóa SSH của VPS |
| `sync-staging.sh` | Dựng cây file bằng index tạm (`git read-tree`, `update-index`, `commit-tree`), không chuyển nhánh, không đụng thư mục làm việc; push thường, không ép | Chạy được trong CI lẫn trên máy khi server dev đang chạy; nếu ai đó vừa push lên `staging` thì bị từ chối thay vì ghi đè |

## 2026-11-18: Workflow staging không chạy test

| Điểm | Quyết định | Lý do |
|---|---|---|
| Test trong workflow "Promote to staging" | Bỏ typecheck riêng, lint, unit test và test tích hợp khỏi job build; job chỉ còn cài package, build (`nest build`, `tsc -b && vite build`, vẫn dừng khi lỗi kiểu) và đóng gói. Một lần chạy còn khoảng 3 đến 4 phút thay vì khoảng 15 | Chủ dự án yêu cầu: test chạy trên máy trước khi push `main` là đủ, cần deploy nhanh |
| File test trên `staging` | Không sang `staging`: `backend/test/**`, `backend/src/**/*.spec.ts`, hai file `vitest.config*.ts` của backend, `frontend/test/**` (dòng `!` trong `deploy/staging-paths.txt`; `sync-staging.sh` hiểu cú pháp glob của git và dừng nếu một dòng `!` không khớp gì) | Nhánh staging chỉ chứa thứ cần để chạy |
| Hệ quả | Trong ngày 18/11/2026 không có gì tự động chặn một commit làm vỡ test trước khi lên staging. Đã khắc phục cùng ngày bằng CI trên `main` và bước chờ CI trong Promote (mục "CI trên main, chặn Promote, hook pre-push") | Ghi lại để hiểu vì sao test nằm ở CI của `main` chứ không ở workflow deploy |

## 2026-11-18: CI trên main, chặn Promote, hook pre-push

Rà lại luồng làm việc cho thấy hai tài khoản push thẳng `main`, và sau khi gỡ test khỏi workflow staging thì không còn lớp kiểm tra tự động nào.

| Điểm | Quyết định | Lý do |
|---|---|---|
| CI | `.github/workflows/ci.yml`, chạy trên Pull Request vào `main` và push lên `main`. Hai job song song: `Checks` (typecheck, lint, unit test của backend và frontend, `docs:rules:check`) và `Integration tests` (PostgreSQL, Valkey, MinIO bằng `docker compose`, rồi `test:int`). Tên hai job là tên status check mà ruleset của `main` yêu cầu | Test tách khỏi workflow deploy nên deploy vẫn nhanh, nhưng mọi commit trên `main` đều được kiểm tra |
| Chặn Promote | Job `promote` của "Promote to staging" tìm lần chạy CI (sự kiện push) của đúng commit: đang chạy thì chờ tối đa 20 phút, đỏ hoặc không có thì dừng. Input `skip_ci` (ô đánh dấu) bỏ qua khi khẩn cấp và ghi cảnh báo kèm tên người bấm | Không commit nào lên staging khi chưa qua test, kể cả test cách ly tenant (mục 23.2); vẫn có lối thoát khi cần sửa gấp |
| Vào `main` | Qua Pull Request từ nhánh riêng; ruleset của `main` (chủ dự án đặt trên GitHub) yêu cầu PR và hai status check trên | Hai người cùng làm; tránh đè code và code hỏng vào `main` |
| Hook pre-push | `.githooks/pre-push` chạy `scripts/pre-push-check.sh` (kiểu, lint, unit test, chỉ mục quy tắc; khoảng 10 giây; không có test tích hợp). Bật bằng `npm run hooks:install` (cũng nằm trong `npm run setup`). Bỏ qua khi push nhánh `staging`, tag hoặc xóa nhánh | Bắt lỗi trước khi tốn một vòng CI; hook không tự bật khi clone nên mỗi người chạy lệnh một lần |
| Phiên bản action | `checkout@v7`, `setup-node@v7`, `upload-artifact@v7`, `download-artifact@v8` | Các bản v4 chạy trên Node 20 đã bị GitHub báo ngừng hỗ trợ |
| Không sang staging | `.github/`, `.githooks/`, `scripts/pre-push-check.sh` không có trong `deploy/staging-paths.txt` | Staging chỉ chứa thứ cần để chạy |
| PR `staging` → `main` | Không bao giờ merge: `staging` thiếu tài liệu, file test và workflow, merge sẽ xóa chúng khỏi `main`. PR #1 (mở ngày 16/11/2026) cần được đóng | `staging` là bản lọc một chiều của `main` |

## 2026-11-19: Bản build giữ thứ tự chạy module

| Điểm | Quyết định | Lý do |
|---|---|---|
| `frontend/vite.config.ts` | Bật `build.rolldownOptions.output.strictExecutionOrder` | Trên staging trang Tổng quan không hiển thị: Rolldown (Vite 8) tách Highcharts thành nhiều chunk và chạy sai thứ tự, loại biểu đồ `scatter` kế thừa `line` khi `line` chưa đăng ký. Chỉ xảy ra ở bản build, bản dev không tách chunk nên không lỗi. Tùy chọn này giữ đúng thứ tự của mã nguồn giữa các chunk; JS tăng khoảng 3% (2,88 MB lên 2,97 MB chưa nén) |
| Kiểm tra bản build | Thêm cấu hình preview `web-prod-preview` (`vite preview`, cổng 4173) vào `.claude/launch.json` | `vite build` thành công không chứng minh bản build chạy được; trước đó chưa lần nào mở bản build trên trình duyệt. Chưa có test tự động cho việc này (cần trình duyệt, xem Playwright ở lát 8d) |

## 2026-11-20: Platform Admin bỏ bắt buộc xác thực hai lớp (khác USER-16)

Chủ dự án yêu cầu ngày 20/11/2026: Platform Admin có công tắc để mọi người đăng nhập không bị buộc cài xác thực hai lớp. USER-16 ghi MFA bắt buộc với Chủ GA, Admin và Platform Admin; từ nay điều đó chỉ đúng khi công tắc đang bật (mặc định bật).

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Nơi lưu | Bảng `platform_settings` một dòng (`mfa_enforced`, mặc định `true`), không có `tenant_id`; RLS bắt buộc, không policy, chỉ `crm_platform` đọc / ghi | Là cài đặt của cả nền tảng, không phải dữ liệu của GA; đã thêm vào danh sách miễn trừ của test TEN-2 kèm lý do |
| API | `GET` / `PUT /platform/settings` `{mfaEnforced}`, chỉ `PLATFORM_ADMIN`; đổi giá trị ghi audit `SETTINGS_CHANGE`, `entity: platform_settings`, `meta: {before, after}` trong chuỗi audit của nền tảng; lưu lại giá trị cũ thì không ghi | PERM-4, AUD-3 |
| Khi tắt | Không ai bị giữ ở trang "Bật xác thực hai lớp", ở mọi GA, kể cả GA đã chọn "Bắt buộc cho mọi người" (`security.mfaForAll`). Người **đã bật** MFA vẫn phải nhập mã khi đăng nhập, và tự tắt được bằng mã (không còn `409 mfa_mandatory`) | Chủ dự án chọn phương án này thay vì bỏ hẳn bước nhập mã: tài khoản đã tự bảo vệ thì không bị hạ xuống chỉ còn mật khẩu |
| Hiệu lực | Ngay ở request kế tiếp của mọi phiên: `ACTOR_COLUMNS` đọc `mfa_enforced` cùng câu truy vấn dựng actor, không cache. Bật lại thì tài khoản thuộc diện bắt buộc mà chưa cài bị giữ lại ngay | Không cần đăng xuất ai |
| Platform Admin chưa cài MFA | Vẫn bị giữ ở trang cài đặt MFA khi công tắc đang bật, nên phải cài MFA một lần rồi mới vào được màn "Cài đặt nền tảng" để tắt | Không mở ngoại lệ cho endpoint này trong lúc bị giữ |
| `MFA_ENFORCE` | Giữ nguyên: `false` vẫn tắt ép buộc trên máy dev / test bất kể công tắc, và vẫn bị từ chối trong production. Trên staging / production chỉ còn công tắc này để bỏ ép buộc | Công tắc có kiểm toán và đổi được không cần khởi động lại |
| Giao diện | Màn `/platform/settings` "Cài đặt nền tảng" (nhóm "Nền tảng"); tắt thì hỏi xác nhận, bật thì lưu ngay | Tắt làm yếu mọi GA cùng lúc |
| Rủi ro | Khi tắt, tài khoản đặc quyền chưa cài MFA chỉ còn mật khẩu bảo vệ. Nên bật lại trước khi có dữ liệu thật | Cần quyết định của chủ dự án trước go-live |

## 2026-11-24: Một ô "Nguồn gốc" trên màn hình lead, ai tạo lead cũng thêm được giá trị mới

Chủ dự án yêu cầu ngày 24/11/2026: màn hình lead đang có hai ô "Nguồn" (danh mục của GA) và "Nguồn gốc" (`origin` do hệ thống ghi) gây nhầm là hai nguồn gốc; chỉ giữ một, và cho tự thêm giá trị. Thay quyết định 12a ngày 14/11/2026 và trả lời OPT-13.

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Tên gọi | Cột `leads.source` (Danh mục Nguồn) nay hiện là **"Nguồn gốc"** ở mọi nơi: ô lọc, bảng, form, chi tiết, lịch sử, Danh mục, báo cáo, trang Tổng quan | Một khái niệm cho người dùng. Tên cột trong file Excel mẫu không đổi |
| `origin` (LEAD-2) | Vẫn lưu và vẫn do hệ thống ghi (`GA`, `IMPORT`, `FC_OWN`, `PUBLIC_FORM`, `REFERRAL`), nhưng không còn là ô lọc: bỏ tham số `origin` của `GET /leads` (gửi lên trả `400 invalid_input`) và ô lọc trên giao diện. Nhãn "Lead tự khai thác" giữ nguyên | LEAD-9 (khóa lead tự khai thác), nhập file và form công khai vẫn dựa vào cột này. Mất khả năng lọc theo Nhập từ file / Web form / Lead tự khai thác; chủ dự án đã chọn phương án này |
| Bộ lọc đã lưu | Migration `SingleLeadSource1764172800000` xóa khóa `origin` khỏi `saved_filters.query` | Không để lại điều kiện lọc không còn hiển thị |
| Tự thêm giá trị (OPT-13) | Form thêm lead và form sửa lead (người quản lý lead, LEAD-8) dùng ô nhập có gợi ý từ Danh mục: chọn giá trị đang hiện hoặc gõ giá trị mới; giá trị mới tự vào Danh mục của GA, có audit `lead_option`. Ai tạo được lead thì thêm được, kể cả tư vấn viên | API đã nhận nguồn mới từ trước; nay giao diện cho gõ. Danh sách có thể lộn xộn, Chủ GA đổi tên hoặc ẩn ở Danh mục |
| So khớp | Giá trị gõ tay khớp theo nhãn, nếu không thì theo mã (không phân biệt hoa thường và dấu) | Nguồn đã đổi tên giữ mã cũ (OPT-3); trước đây gửi mã cũ sẽ tạo trùng một giá trị mới |
| Độ dài | Giá trị mới gõ tay tối đa 60 ký tự (`400 invalid_input`, `issues[].path = source`); file nhập vẫn như cũ (IMP-25) | OPT-3 |
| Nguồn đã ẩn | Vẫn bị từ chối khi gõ lại (`unknown_option`, hiện ngay dưới ô). Form sửa chỉ gửi `source` khi người dùng đổi ô đó, nên lead đang mang nguồn đã ẩn vẫn sửa được các trường khác | OPT-8 |

## 2026-11-25: Gom lại nhóm trên sidebar theo chức năng

Chủ dự án yêu cầu ngày 25/11/2026 vì sidebar lộn xộn: nhóm "Quản trị" chứa 8 màn hình không liên quan, "Báo cáo" và "Khách hàng" là nhóm chỉ có một dòng, "Lịch sử nhập" nằm dưới "Đại lý" còn "Nhập lead từ Excel" nằm dưới "Lead". Chỉ đổi nhóm và thứ tự; đường dẫn, quyền xem từng dòng và tên dòng giữ nguyên.

| Nhóm | Dòng | Ý nghĩa |
|---|---|---|
| (không nhóm) | Trang chủ, Báo cáo | Nhìn tổng quan |
| Công việc | Việc cần làm, Lịch | Việc trong ngày của mỗi người |
| Kinh doanh | Danh sách lead, Chiến dịch, Danh sách khách hàng | Vòng bán hàng: lead, chiến dịch sinh ra lead, khách hàng |
| Trao đổi | Trò chuyện, Thông báo | Liên lạc và tin hệ thống báo |
| Đội ngũ | Cây đại lý, Người dùng, Người dùng hoạt động, Phân quyền | Con người và quyền của họ |
| Dữ liệu | Nhập lead từ Excel, Lịch sử nhập | Mọi việc nhập file. "Nhập dữ liệu" (`/imports/new`) vẫn mở từ nút, nay thuộc "Lịch sử nhập" trên breadcrumb |
| Giám sát | Nhật ký, Tra cứu trò chuyện | Xem lại việc đã xảy ra |
| Thiết lập | Danh mục, Trợ lý AI, Cài đặt GA | Cấu hình của GA |
| Nền tảng | Các GA, Cài đặt nền tảng | Chỉ Platform Admin |

Nhóm nào người dùng không có dòng nào thì không hiện. `frontend/test/nav.test.ts` cố định cấu trúc này cho Chủ GA, tư vấn viên và Platform Admin. Trạng thái đóng / mở nhóm lưu trong trình duyệt theo tên nhóm, nên các nhóm mới mặc định mở.

Thanh cuộn của sidebar được ẩn (lớp `scrollbar-none` trong `frontend/src/index.css`), theo yêu cầu của chủ dự án cùng ngày: danh sách vẫn cuộn bằng chuột, chạm và bàn phím khi dài hơn màn hình, chỉ không vẽ thanh. Đây là ngoại lệ duy nhất của quy tắc "thanh cuộn mảnh ở mọi nơi".

## 2026-11-25: Khách hàng định danh bằng id, người dùng làm việc bằng Mã hợp đồng (khác DATA-1, CUS-1, MAN-2, MAN-4, MAN-8, FAM-2, PRD-3, IMP-19, POL-2)

Chủ dự án yêu cầu ngày 25/11/2026: thay "Mã khách hàng" bằng **Mã hợp đồng**. Khách hàng phụ thuộc vào hợp đồng; cha mẹ, anh chị em có thể chung một mã hợp đồng, và tra mã hợp đồng phải biết ai đang tham gia. "Nếu mã không ảnh hưởng thì xóa luôn, đã có id định danh."

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Định danh | Khách hàng được nhận diện bằng `clients.id` (uuid) ở mọi bảng, URL (`/clients/<id>`), API và thông báo. Mọi cột mã (`policies.holder_client_code`, `insured_client_code`, `client_codes`, `applications`, `family_links`, `leads`, `interactions`, `comments`, `tasks`) thành cột id có **khóa ngoại thật** `(tenant_id, client_id) → clients (tenant_id, id)`; trước đây không có khóa ngoại nào. Migration `ClientId1764259200000` | Một khóa nội bộ không đổi, không phụ thuộc Dai-ichi |
| Mã khách Success | Giữ duy nhất ở `clients.success_code` (duy nhất trong GA khi có), **không API nào trả về, không màn hình nào hiện**. Chỉ bộ nhập Success đọc | Rà soát cho thấy file Success nhận diện người chỉ bằng mã này (sheet 02 không có số hợp đồng, sheet 04 không có tên người được BH). Bỏ hẳn thì lần nhập sau sinh khách trùng hoặc gộp nhầm người ở 8 tình huống (ví dụ cùng một người trên hợp đồng của hai tư vấn viên, hai người trùng tên). Chủ dự án chọn "giữ một tham chiếu ẩn" |
| Ai trên hợp đồng cũng là khách | Mọi người hợp đồng nêu tên bằng mã (bên mua, người được BH chính, người được BH của từng sản phẩm, người thụ hưởng) đều có dòng khách hàng; migration tạo dòng cho người chưa có (tên lấy từ hợp đồng) và lần nhập file sau cũng vậy | Khác FAM-5 ("con / vợ được BH không có bản ghi khách"): nay họ có trang khách hàng. Người chỉ có tên trên dòng sản phẩm (nhập tay, không là khách) vẫn là "chỉ có tên" như PRD-3 |
| Thêm khách hàng | Form hỏi **Mã hợp đồng** (9 chữ số) và **vai trò**: Bên mua BH (PO), Người được BH (LI), Người thụ hưởng (BEN). Số chưa có trong GA: tạo hợp đồng **chỉ với số** (các trường khác bổ sung sau hoặc từ Success). Số đã có và thuộc phạm vi người thêm: gắn người mới vào hợp đồng; người được BH đầu tiên là NĐBH chính, người sau là NĐBH của sản phẩm (nguồn PRODUCT); dòng sản phẩm từng ghi tên người đó được gắn với họ | Thay MAN-2 (mã 10 số bắt buộc), MAN-4 (`client_exists`) và MAN-5 (nhập kèm tối đa 10 hợp đồng: bỏ, thêm hợp đồng khác ở trang khách) |
| Chống trùng, chống "nhận" khách | Hợp đồng ngoài phạm vi: `403 policy_not_yours`, không lộ ai trên hợp đồng (thay tinh thần MAN-4). Mỗi hợp đồng một bên mua đang hiệu lực: `409 holder_exists`. Cùng tên chuẩn hóa và (khi cả hai có) cùng ngày sinh đã có trên hợp đồng: `409 person_on_policy`. Hết `client_exists`, `invalid_client_code`, `insured_not_yours` | Không còn mã để chặn trùng; trùng giữa hai hợp đồng khác nhau không chặn được (cùng một người ở hai hợp đồng nhập tay là hai khách). Cần chức năng gộp khách hàng nếu việc này xảy ra nhiều |
| Hợp đồng chỉ cần số (POL-2) | `status`, ngày hiệu lực / đáo hạn, định kỳ, phí, tên bên mua / NĐBH được để trống. Hợp đồng chưa có tình trạng không bị tính "không hiệu lực" (tín hiệu NOT_ACTIVE) và không đẩy giai đoạn lead | Tư vấn viên nhập nhanh, Success điền sau |
| Sửa hợp đồng | Người được BH khác bên mua chỉ còn là **tên** (không gõ mã của khách khác được nữa); sửa từ trang của người được BH / thụ hưởng giữ nguyên bên mua | Thay `insuredClientCode` của POL-2; giữ chặn chiếm khách của CUS-4 / CUS-6 |
| Tra mã hợp đồng | Ô tìm danh sách khách (và gợi ý liên kết lead) nhận tên, **mã hợp đồng** (từ 3 số đầu, ra mọi người trên hợp đồng trong phạm vi) hoặc số điện thoại; không tìm theo mã khách nữa. Danh sách hiện mã hợp đồng và vai trò dưới tên; thẻ hợp đồng có mục "Người tham gia" | Yêu cầu chính của chủ dự án |
| Nhập Success | Trong một file vẫn ghép các sheet bằng mã; trước khi ghi, mã đổi thành id qua `success_code`. Khách nhập tay chưa có mã được file **nhận mã** khi file ghi mã mới cho đúng vai trò (bên mua / NĐBH chính) của họ trên chính hợp đồng của họ; từ đó cập nhật như MAN-8. Lịch sử `record_changes` ghi theo id; không ghi thay đổi mã bên mua / NĐBH (tên của họ vẫn được ghi) | MAN-8 vẫn đúng nhưng qua hợp đồng thay vì gõ mã |
| Lịch sử cũ | Lịch sử khách và dòng sản phẩm đổi khóa sang id; trường `holderClientCode` / `insuredClientCode` thành `holderClient` / `insuredClient` mang **tên**; lịch sử lead `clientCode` thành `client` mang tên; thông báo và khóa nhắc sinh nhật đổi sang id. `audit_events` giữ nguyên (chỉ thêm, có chuỗi băm AUD-1) nên dòng cũ còn mã | Không sửa nhật ký kiểm toán |
| Không quay lại được | `down()` của migration báo lỗi: dòng khách tạo thêm và lịch sử đổi sang tên không tách ngược được. Phải sao lưu database trước khi deploy | Chạy trên staging (đang trống) không ảnh hưởng |
| Rủi ro | Tư vấn viên tạo trùng cùng một người ở hai hợp đồng; hai người trùng tên trùng ngày sinh trên một hợp đồng bị chặn nhầm | Theo dõi, cân nhắc chức năng gộp khách |

## 2026-11-25: Danh mục sản phẩm dùng chung (TENANT-5), hợp đồng và lead nối với sản phẩm (thay 12c, PRG-6, PRD-2)

Chủ dự án yêu cầu ngày 25/11/2026: tạo danh sách sản phẩm bảo hiểm để nối với dữ liệu. Đã chọn: dùng chung cho mọi GA, Platform Admin quản lý; nhập bằng form và file 11_Products; nối với hợp đồng của khách và "sản phẩm quan tâm" của lead; form hợp đồng chọn thẳng sản phẩm.

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Bảng | `products` khóa `product_code` (định dạng `PRODUCT_KEY`), các cột của mục 19.9, `active`; không có `tenant_id`. RLS bắt buộc, policy `shared_read ... USING (true)`: mọi GA đọc được, chỉ `crm_platform` ghi. Migration `Products1764345600000`. Bảng đầu tiên mà người dùng GA đọc chung | Dữ liệu tham chiếu của DLVN, giống nhau cho mọi GA; đọc được trong giao dịch của GA nên nối được với hợp đồng và lead. Đã thêm vào danh sách miễn trừ của test TEN-2 |
| Không xóa | Sản phẩm chỉ ẩn / hiện (`PATCH /platform/products/:code`); sản phẩm ẩn không chọn được cho dòng mới nhưng dòng đã có vẫn giữ | Hợp đồng và lead giữ mã |
| Nhập | `POST /platform/products {rows}` 1-500 dòng, upsert theo mã, cho cả form và file (trình duyệt đọc Excel, gửi từng lô). Một mã lặp trong cùng lần gửi bị từ chối cả lô. Audit chuỗi nền tảng: `IMPORT products` khi từ file, `CREATE` / `UPDATE products` khi từ form | Đúng mục 17 của đặc tả |
| GA đọc gì | `GET /products` và `GET /products/:code` không trả `fit_rule`, `trigger_event`, `rule_status` | Quy tắc phù hợp còn là nháp (câu hỏi mở 3), chưa dùng để gợi ý |
| Trang sản phẩm | Liệt kê hợp đồng có sản phẩm trong phạm vi người xem (CUS-8, tối đa 200) với người tham gia; Marketing / Admin chỉ thấy thông tin sản phẩm (CUS-5); link sang danh sách lead lọc theo sản phẩm | "Link được tới các phần trong data" |
| Hợp đồng nhập tay | Mỗi dòng chọn **sản phẩm** (`productCode`) thay chương trình của GA; tên và vai trò Chính / Bổ trợ lấy từ sản phẩm; sản phẩm ẩn / không có: `400 unknown_product`. Dòng đã có trên hợp đồng giữ được mã cũ khi sửa (kể cả mã chương trình cũ không có trong danh mục). Thẻ "Chương trình bảo hiểm" ẩn khỏi Danh mục; API `/programs` giữ cho dữ liệu cũ | Thay quyết định 12c (danh mục chỉ để gợi ý), PRG-6 / PRD-2 (dòng lấy từ chương trình); PRG-9 không còn cần |
| Dòng hợp đồng từ file | Dòng 04 có mã trùng danh mục tự nối (tên danh mục hiện kèm, link sang trang sản phẩm) | Không cần nhập lại |
| Nhóm quyền lợi (COV-3) | `category` của danh mục quyết định nhóm trước tên sản phẩm, ở trang khách và thẻ quyền lợi | Trước đây không có nguồn `category` nên chỉ đoán theo tên |
| Lead | Cột `leads.product_code` (khóa ngoại tới `products`) bên cạnh chữ tự do `product_interest`. Form thêm / sửa lead chọn sản phẩm (tùy chọn), danh sách lead lọc `product=`, chi tiết hiện tên sản phẩm. File 13_Leads: ô "SẢN PHẨM" trùng mã hoặc tên sản phẩm (bỏ dấu, không phân biệt hoa thường) thì nối, không thì chỉ giữ chữ. Form công khai giữ ô chữ | Khách điền form không biết tên chính xác của sản phẩm |
| Dữ liệu mẫu | 3 mã của chương trình mặc định cũ (để dữ liệu cũ nối được) và 4 sản phẩm lấy tên từ ảnh chủ dự án gửi, **mã `DEMO-...` tự đặt**, không phải mã thật của DLVN | Cần danh mục thật từ DLVN (file 11_Products) trước go-live |

## 2026-11-25: Thẻ Hợp đồng và chi tiết hợp đồng, thêm trường hợp đồng và phí (khác mục 19.4, CUS-15)

Chủ dự án yêu cầu ngày 25/11/2026: phần hợp đồng của khách hàng hiện đủ các trường như màn hình hợp đồng của DLVN (ảnh "Chi tiết thông tin hợp đồng bảo hiểm" và "Thông tin Phí hợp đồng"). Đã chọn: lưu địa chỉ liên hệ nhưng che; số tiền bảo hiểm lấy từ sản phẩm chính; "Hình thức / Ngày phân công" là dữ liệu DLVN; làm trang riêng.

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Trường mới trên `policies` | `contact_address`, `sum_assured_vnd`, `grace_end_date`, `assignment_type`, `assignment_date`, `advance_premium_vnd`, `total_paid_premium_vnd`, `basic_premium_vnd`, `top_up_premium_vnd`. Migration `PolicyDetails1764432000000` | Các trường DLVN hiện trên màn hình hợp đồng mà hệ thống chưa có |
| File 03_Policies | Thêm 9 cột không bắt buộc, tiêu đề đúng như nhãn trên màn hình DLVN ("Địa chỉ liên hệ", "Số tiền bảo hiểm", "Ngày kết thúc thời gian gia hạn đóng phí", "Hình thức phân công", "Ngày phân công", "Phí đóng trước cho kỳ tới", "Tổng phí bảo hiểm đã đóng", "Phí bảo hiểm cơ bản", "Phí bảo hiểm đóng thêm") | **Chưa đối chiếu với file Success thật**; nếu tiêu đề cột thật khác thì sửa `templates.ts` |
| Địa chỉ liên hệ | Dữ liệu cá nhân: không trả cùng hợp đồng (chỉ `hasContactAddress`); xem qua `GET /clients/:clientId/policies/:policyNo/contact-address`, cùng phạm vi như xem khách (CUS-5, CUS-8), mỗi lần xem ghi audit `VIEW_CLIENT` entity `policy`. Lịch sử thay đổi chỉ ghi `***`. Marketing / Admin không xem được (không có sổ khách). Form sửa hợp đồng không hiện địa chỉ đã lưu: để trống là giữ nguyên | Màn hình DLVN cũng che ô này; PDP |
| Số tiền bảo hiểm | Hiện STBH của dòng sản phẩm vai trò "Chính" (theo danh mục sản phẩm nếu có) của NĐBH chính (`mainSumAssuredVnd`); không có dòng đó thì dùng `sum_assured_vnd` từ file hoặc nhập tay | Nối với danh mục sản phẩm (TENANT-5) |
| Ngày kết thúc gia hạn đóng phí | Chỉ lấy từ file hoặc nhập tay, **không tự tính** từ ngày đến hạn | Không tự đặt quy tắc số ngày gia hạn |
| Hình thức / Ngày phân công | Dữ liệu DLVN giao đại lý phục vụ, chỉ từ file Success; không sửa tay | Khác ASG (phân công khách hàng trong CRM) |
| "Phí bảo hiểm cơ bản" | Lưu riêng với "Phí định kỳ/cơ bản định kỳ" | Đang hiểu là hai số khác nhau của DLVN; cần chủ dự án xác nhận, nếu là một thì bỏ cột |
| Giao diện | Trang khách hàng tách hai thẻ **"Khách hàng"** (hồ sơ, quyền lợi, cơ hội chăm sóc, ghi chú, góp ý) và **"Hợp đồng (n)"** (thẻ hợp đồng gọn: bên mua, NĐBH, STBH, ngày hiệu lực, phí, sản phẩm; và hồ sơ YCBH). Bấm một hợp đồng mở "Chi tiết hợp đồng" ngay trong thẻ Hợp đồng (`?tab=policies&no=<số HĐ>`, có nút quay lại danh sách): "Thông tin chi tiết hợp đồng", "Thông tin phí hợp đồng", sản phẩm, người tham gia, đại lý; sửa / xóa hợp đồng ngay ở đó. Nhãn phí đổi theo DLVN (ví dụ "Phí định kỳ/cơ bản định kỳ", "Phí cơ bản các kỳ trước chưa đóng") | CUS-15 trước đây hiện mọi trường trên thẻ |

## 2026-11-25: Một kiểu thanh tab cho cả danh sách và trang chi tiết

Chủ dự án yêu cầu ngày 25/11/2026: thanh tab của trang khách hàng phải giống thanh tab của danh sách lead. Trước đây trang chi tiết (khách hàng, lead) dùng tab gạch chân, danh sách dùng tab nền xanh nhạt. Nay mọi `TabBar` dùng một kiểu: tab đang chọn có nền `band-blue`, chữ `primary-deep`; kiểu gạch chân đã bỏ khỏi `components/ui.tsx`.

## 2026-11-25: File lead của GA có tiêu đề hai tầng (mở rộng IMP-23, mục 19.7)

Chủ dự án gửi file mẫu "Chia Lead" ngày 25/11/2026 để Dữ liệu > Nhập lead từ Excel đọc được. Các cột của file đều đã có trong mẫu 13_Leads và trong bảng `leads`; chỉ cách đặt tiêu đề làm bộ đọc chọn sai dòng tiêu đề.

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Tiêu đề hai tầng | Ô gộp nhiều cột ở dòng tiêu đề ("XỬ LÝ SAU", "THÔNG TIN THÊM") là tên nhóm; tên từng cột lấy ở tối đa 2 dòng ngay dưới. Cột để trống tiêu đề cũng được đặt tên từ dòng dưới. Chỉ nhận chữ trùng một tiêu đề đã biết (tên hoặc tên gọi khác của mục 19.8), nên giá trị dữ liệu không bao giờ thành tiêu đề | File mẫu để tên cột phụ cùng dòng với lead đầu tiên; trước đây bộ đọc chọn dòng đó làm tiêu đề vì khớp nhiều tên hơn |
| Dòng chứa tên cột phụ | Ô tên cột bị bỏ khỏi dữ liệu; các ô khác của dòng vẫn là một lead | Lead đầu tiên của file mẫu nằm trên dòng đó |
| Chọn dòng tiêu đề | Tính số cột khớp của cả khối tiêu đề (dòng trên + tên bên dưới); chỉ dòng tự có ít nhất một tiêu đề đã biết mới ghép được tên bên dưới | Không ghép nhầm một dòng tiêu đề trang ("DANH SÁCH LEAD THÁNG 11") với tiêu đề thật bên dưới |
| Bắt buộc (khác mục 19.7) | Chủ dự án quyết định 25/11/2026: chỉ **TÊN KHÁCH HÀNG** và **SỐ ĐIỆN THOẠI**. "Nguồn" thành không bắt buộc: dòng để trống tạo lead mới với nguồn **"Chưa rõ nguồn"** (`UNKNOWN_SOURCE`, tự vào Danh mục Nguồn như mọi nguồn mới của file); lead đã có thì giữ nguồn cũ. Số điện thoại Excel mất số 0 đầu (9 chữ số) vẫn được thêm lại (IMP-6) | Cột `leads.source` không được trống, và báo cáo theo nguồn cần một giá trị |
| File mẫu tải về | Sheet 13_Leads xếp cột như file "Chia Lead": TÊN TVV, NGÀY CẬP NHẬT LEAD, TÊN KHÁCH HÀNG, SỐ ĐIỆN THOẠI, NGUỒN SĐT, KHU VỰC KHÁCH HÀNG, Nguồn, Tình Trạng TVV, Trạng Thái Hiện Tại TVV, Chiến Dịch, TIẾN ĐỘ TƯ VẤN TVV, TRẠNG THÁI GỬI TIN NHẮN, LÝ DO CHỐT XỊT/ DỪNG TÌM HIỂU; nhóm **XỬ LÝ SAU** (10 NGÀY, 15 NGÀY, 20 NGÀY, GHI CHÚ XỬ LÝ); nhóm **THÔNG TIN THÊM** (NGÀY ĐĂNG KÝ … CDYT - TRANG CÁ NHÂN); cuối cùng ĐỒNG Ý LIÊN HỆ và LEAD ID. Hai dòng tiêu đề: ô gộp tên nhóm ở dòng 1, tên cột ở dòng 2, cột ngoài nhóm gộp dọc hai dòng. Cột tư vấn viên đổi tên hiển thị thành "TÊN TVV" ("Mã đại lý" thành tên gọi khác). Tình Trạng / Trạng Thái Hiện Tại có danh sách gợi ý nhưng vẫn gõ được nhãn riêng của GA. Tải về rồi nhập lại không lỗi (test IMP-11) | Người dùng điền theo đúng bố cục quen thuộc |
| Cột mới của 13_Leads | Chủ dự án chọn **lưu** (25/11/2026): "XỬ LÝ SAU 10 NGÀY" (tên khác "10 NGÀY"), "XỬ LÝ SAU 15 NGÀY" ("15 NGÀY"), "XỬ LÝ SAU 20 NGÀY" ("20 NGÀY"), "GHI CHÚ XỬ LÝ" (≤ 4000 ký tự), "CDYT - THỐNG KÊ", "CDYT - TRANG CÁ NHÂN" (≤ 2000 ký tự), không bắt buộc. Cột `leads.follow_up_10d`, `follow_up_15d`, `follow_up_20d`, `handling_note`, `cdyt_stats`, `cdyt_profile` (migration `LeadFollowUps1764518400000`). Chỉ nhập từ file, hiện ở trang lead khi có giá trị, không sửa trên form; xóa theo PDP-6 thì xóa luôn | Chữ tự do do nhân viên ghi, có thể chứa thông tin cá nhân. Chưa rõ nghĩa của "CDYT" nên lưu nguyên chữ. Khung "ĐỊNH NGHĨA" là ghi chú hướng dẫn, không nhập |
| Cột tư vấn viên | Cột "Cột 1" (tên mặc định của bảng Google Sheets) chứa tên TVV không tự ghép; người nhập chọn nó cho ô "Mã đại lý" trên màn hình, rồi ghép tên với đại lý (IMP-24) | "Cột 1" không phải tên có nghĩa; đặt tiêu đề "TÊN TVV" thì tự ghép |

## 2026-11-26: Địa chỉ lead theo địa giới hành chính sau 1/7/2025 (Tỉnh → Xã/Phường → Địa chỉ cụ thể)

Chủ dự án yêu cầu ngày 26/11/2026: modal thêm Lead chọn được tỉnh, xã và địa chỉ cụ thể để lọc dữ liệu theo khu vực. Từ 1/7/2025 Việt Nam chỉ còn hai cấp (34 tỉnh / thành phố, 3.321 xã / phường / đặc khu), **không còn cấp huyện**, nên không có ô "Huyện".

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Nguồn dữ liệu | `ThangLeQuoc/vietnamese-provinces-database` bản v5.2.0 (nghị quyết mới nhất 388/NQ-UBTVQH16, sinh ngày 20/09/2026), giấy phép MIT, đọc từ danh mục của Cục Thống kê. Sinh thành `backend/src/modules/geo/vn-units.data.ts` (ghi rõ nguồn và giấy phép, không sửa tay) | Giấy phép rõ, còn cập nhật theo từng nghị quyết. Khi địa giới đổi: sinh lại file và thêm migration cập nhật hai bảng |
| Bảng | `provinces` (mã 2 số) và `wards` (mã 5 số, `province_code`), không có `tenant_id`, RLS bắt buộc với policy chỉ đọc `USING (true)` như bảng `products`; chỉ migration ghi. Migration `GeoUnits1764604800000`. Thêm vào danh sách miễn trừ của test TEN-2 | Dữ liệu tham chiếu chung mọi GA |
| Lead | Cột mới `province_code`, `ward_code` (khóa ngoại), `address_line` (≤ 300 ký tự). Xã phải thuộc tỉnh đã chọn, sai thì `400 unknown_place`. Đổi tỉnh thì xã cũ bị bỏ. Chọn tỉnh thì cột chữ `province` ghi theo tên tỉnh; lead cũ có chữ tỉnh không khớp tên mới (ví dụ tỉnh đã sáp nhập) giữ nguyên chữ và hiện "Tỉnh/TP (ghi tự do)" | Lọc và báo cáo theo mã, không phụ thuộc cách viết |
| Gắn mã tự động | Migration gắn mã cho lead cũ có chữ tỉnh trùng tên tỉnh mới (không dấu, không phân biệt hoa thường, bỏ "TP." / "Tỉnh"). Nhập file (ô TỈNH/TP) và form công khai cũng tự gắn. Nhận thêm cách viết HCM, TP HCM, Sài Gòn, HN. **Không đoán tỉnh cũ đã sáp nhập** (ví dụ Bình Dương) | Chưa có bảng chuyển 63 tỉnh cũ sang 34 tỉnh mới |
| Giao diện | Modal thêm / sửa lead: Tỉnh / thành phố, Xã / phường (tắt cho đến khi chọn tỉnh, luôn hiện để modal không đổi chiều cao), Địa chỉ cụ thể; không bắt buộc, tìm không dấu. Trang lead hiện "Địa chỉ" ghép địa chỉ, xã, tỉnh. Danh sách lead lọc `province=` và `ward=` (trong URL) | Lọc theo khu vực dễ và đúng hơn |
| API | `GET /geo/provinces`, `GET /geo/provinces/:code/wards` (mọi người đã đăng nhập; dữ liệu phục vụ từ bộ nhớ) | |
| PDP-6 | Xóa lead theo yêu cầu thì xóa `address_line` và `ward_code` (kèm lịch sử); giữ `province_code` cho thống kê, như Khu vực. Gộp lead chuyển cả bộ tỉnh / xã / địa chỉ khi lead giữ lại chưa có tỉnh | Địa chỉ và xã chỉ đến người cụ thể |

## 2026-11-26: Đồng ý liên hệ có thể để trống khi tạo lead (khác LEAD-3); ô Nguồn gốc dùng ô chọn của ứng dụng

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Đồng ý liên hệ | Chủ dự án yêu cầu 26/11/2026: khi thêm lead (modal "Thêm lead" và "Tạo lead" từ người thân của khách) câu trả lời đồng ý liên hệ **không bắt buộc**, có lựa chọn "Chưa hỏi, cập nhật sau". API nhận `consent` tùy chọn; để trống thì lead được lưu là **chưa đồng ý** (`consent_marketing = false`, không có thời điểm và nguồn đồng ý) cho đến khi sửa lead. Form đăng ký công khai vẫn bắt buộc đồng ý | LEAD-3 bắt buộc câu trả lời. Chưa có đồng ý thì xử lý như không đồng ý, đúng PDP-5 và LEAD-26 (không giao vào chiến dịch telesales) |
| Ô Nguồn gốc | Modal thêm / sửa lead chọn nguồn bằng ô chọn có tìm kiếm của ứng dụng (`OptionPicker`, cùng kiểu ô Tỉnh / thành phố); gõ giá trị chưa có thì hiện "Thêm mới: …" và giá trị vào Danh mục khi lưu (OPT-13 không đổi) | Ô gõ kèm danh sách gợi ý của trình duyệt (`datalist`) hiện mũi tên và bảng chọn theo hệ điều hành, lệch giao diện tối và các ô chọn khác. Ô **Khu vực** (thêm / sửa lead) và **Lý do chốt xịt** (cập nhật trạng thái) cũng đổi sang ô chọn này; giá trị gõ thêm ở hai ô đó hiện "Dùng: …" vì chỉ là gợi ý, không vào Danh mục (quyết định cũ không đổi). Component `ListSuggestions` đã bỏ |

## 2026-11-26: Báo cáo Hoạt động đại lý (R2) ghi rõ nguồn và cho xem từng hoạt động

Chủ dự án hỏi 26/11/2026: làm sao biết số liệu R2 đúng, ví dụ "Đăng MXH" kiểm ở đâu. CRM không tự kiểm chứng các hoạt động này: Gọi điện, Zalo, Gặp mặt đến từ liên hệ đại lý ghi trên CRM và từ Success; Hội thảo chỉ từ CRM; Đề xuất, Đăng MXH, Check-in, Kèm cặp, Khác **chỉ từ file 07_Activities của Success**, nơi đại lý nộp và trưởng nhóm duyệt hoạt động. Ghi nhận hoạt động có bằng chứng (check-in GPS, ảnh, link bài đăng) để dành cho app sau này.

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Nguồn từng cột | Dưới tên mỗi cột loại hoạt động ghi "CRM + Success", "Chỉ CRM" hoặc "Chỉ Success"; dòng hướng dẫn nói rõ quy tắc gộp trùng và trạng thái không tính | Người xem biết phải đối chiếu ở đâu |
| Dữ liệu Success đến đâu | Báo cáo trả `successAsOf` (ngày hoạt động mới nhất và lần nhập cuối từ `success_activities`), hiện dưới dòng hướng dẫn; chưa nhập file 07 thì nói rõ các cột "Chỉ Success" bằng 0 | Số thấp có thể do chưa nhập file, không phải đại lý không làm |
| Xem từng hoạt động | Bấm số ở cột loại, Tổng, Từ CRM, Từ Success (dòng đại lý, dòng nhóm, dòng Tổng cộng) mở danh sách: thời điểm, đại lý, loại, nguồn, người liên quan (link sang lead / khách), nội dung, địa điểm, mã hoạt động và trạng thái duyệt trên Success, và **có được tính không** (trùng trong ngày; nháp / từ chối). `GET /reports/activities/details` (tối đa 500 dòng, mới nhất trước), cùng phạm vi RPT-3. Ô đang mở lưu trong URL (`cell=`) | Số liệu và danh sách cùng đi qua hàm `classifyActivities` nên luôn khớp |
| Marketing / Admin | Không thấy nội dung, địa điểm, tên khách của dòng Success và tên / ghi chú liên hệ trên khách hàng (CUS-16) | Họ không có sổ khách hàng |
| Trạng thái được tính | **Chưa đổi**: vẫn tính mọi trạng thái trừ nháp và từ chối, nên "đã nộp, chờ duyệt" và "bị trả lại" vẫn được cộng; danh sách chi tiết hiện trạng thái để đối chiếu. **Câu hỏi cho chủ dự án**: chỉ tính đã duyệt / đã khóa, hay tách cột "Chờ duyệt"? | Quy tắc nghiệp vụ, chưa có quyết định |

## 2026-11-26: Tab "Khách hàng" gồm ba phần; ghi nhận chăm sóc và giới thiệu (mở rộng CUS-15)

Chủ dự án yêu cầu ngày 26/11/2026: tab "Khách hàng" của trang khách hàng có ba phần (thông tin cơ bản vắn tắt; thông tin chi tiết chương trình; thông tin chăm sóc), làm nền cho hướng chăm sóc khách hàng sau này. Phần chăm sóc trả lời: khách đã yêu cầu bồi thường viện phí khi nào, ở đâu; đã dự hội thảo / khám sức khỏe tổng quát nào; đã nhận quà tặng, thăm hỏi gì; nhận gì khi ký hợp đồng (tách tiền / quà); đã giới thiệu bao nhiêu lượt, quan hệ thế nào, bao nhiêu lượt thành công, tổng phí là bao nhiêu.

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| 1. Thông tin cơ bản | Thẻ gọn: điện thoại, hạng, ngày sinh / nhóm tuổi, giới tính, hôn nhân, số hợp đồng (đang hiệu lực / tổng), tư vấn viên. Các thông tin Success bổ sung (số hợp đồng theo Success, D-Connect, eKYC, Căn cước, điểm thưởng) chỉ hiện khi có giá trị | "Vắn tắt"; không mất dữ liệu |
| 2. Chi tiết chương trình | Một bảng mọi chương trình (dòng sản phẩm) trên các hợp đồng của khách: chương trình (link sang trang sản phẩm khi có trong danh mục), hợp đồng (mở chi tiết ở thẻ Hợp đồng), người được bảo hiểm, nhóm quyền lợi, số tiền BH, phí năm, ngày hiệu lực, tình trạng; hợp đồng đang hiệu lực trước; hợp đồng chưa có chi tiết sản phẩm vẫn có một dòng. Thẻ "Quyền lợi bảo hiểm" (COV-5) giữ ngay dưới | Lấy từ dữ liệu hợp đồng đã có, không nhập thêm |
| 3. Thông tin chăm sóc | Bảng `client_care_records` (nhập tay): `CLAIM` bồi thường viện phí (ngày, **nơi** bắt buộc, số tiền, hợp đồng), `SEMINAR` hội thảo, `HEALTH_CHECK` khám sức khỏe tổng quát, `GIFT` quà tặng (tên quà bắt buộc), `VISIT` thăm hỏi, `SIGNING_CASH` tiền khi ký (số tiền bắt buộc), `SIGNING_GIFT` quà khi ký (tên quà bắt buộc). Hiện thành 4 khối; khối quà khi ký có tổng tách **tiền** và **quà** (số món, trị giá). Bên phải vẫn là Cơ hội chăm sóc, Ghi chú và liên hệ, Góp ý | Đặc tả chưa có các dữ liệu này; Success không cung cấp nên GA tự ghi |
| Giới thiệu | Bảng `client_referrals` (nhập tay): người được giới thiệu, quan hệ với khách (Người thân, Bạn bè, Đồng nghiệp, Hàng xóm, Khác), ngày, kết quả (Đang theo / Thành công / Không thành công), **phí bảo hiểm của hợp đồng do giới thiệu** (chỉ khi thành công). Tổng hợp: số lượt, số thành công, "tổng phí bảo hiểm từ giới thiệu" | **Giả định cần chủ dự án xác nhận**: "tổng phí giới thiệu" hiểu là tổng phí bảo hiểm của các hợp đồng do giới thiệu thành công, không phải tiền thưởng trả cho người giới thiệu. Chưa nối lượt giới thiệu với lead (FAM-6 vẫn tạo lead từ người thân) |
| Bồi thường và PDP | Chỉ ghi **khi nào, ở đâu**, số tiền; không có ô chẩn đoán, ô ghi chú nhắc "không ghi chẩn đoán, bệnh án hay tình trạng sức khỏe". Marketing / Admin không có sổ khách hàng nên không thấy | PDP-1 / quy tắc 5 cấm lưu dữ liệu sức khỏe từ Success; đây là dữ liệu GA tự ghi theo yêu cầu chủ dự án, giữ ở mức tối thiểu. Khi làm 8b (yêu cầu của chủ thể dữ liệu) phải xuất / xóa cả hai bảng này |
| Quyền và audit | Ai thấy khách thì đọc (CUS-5); chỉ người phụ trách khách và Chủ GA thêm / sửa / xóa (CUS-6, như Gia đình FAM-8). Mỗi thay đổi ghi audit `CREATE` / `UPDATE` / `DELETE` với entity `client_care_record` hoặc `client_referral`. Hợp đồng ghi kèm phải là hợp đồng của khách trong phạm vi người nhập | Cùng quy tắc sở hữu của trang khách |
| API | `POST / PATCH / DELETE /clients/:clientId/care-records[/:id]`, `.../referrals[/:id]`; danh sách và tổng hợp (`careRecords`, `signingSummary`, `referrals`, `referralSummary`) trả cùng `GET /clients/:clientId`. Migration `ClientCareRecords1764691200000` | |
| Tab riêng cho chăm sóc | Chủ dự án yêu cầu thêm 26/11/2026: thẻ đầu đổi tên thành **"Thông tin khách hàng"** (phần 1 và 2); phần 3 thành thẻ riêng **"Thông tin chăm sóc"** đứng ngay cạnh (`?tab=care`), gồm các khối chăm sóc và Cơ hội chăm sóc, Ghi chú và liên hệ, Góp ý. Thông báo nhắc tên trong góp ý của khách và các dòng chăm sóc ở Trang chủ (đến hạn phí, sinh nhật) mở thẳng thẻ này | Trang khách dài; tách để vào thẳng phần chăm sóc |
| Ẩn tạm 3 ô trên form khách | Form thêm / sửa khách hàng ẩn Điểm thưởng, D-Connect, Đã cập nhật Căn cước (`SHOW_SUCCESS_FLAGS` trong `ClientForms.tsx`); form không gửi 3 trường này nên giá trị từ Success giữ nguyên | Chủ dự án yêu cầu ẩn tạm 26/11/2026 |

## 2026-11-26: Huy hiệu hạng khách hàng có biểu tượng và màu riêng

Chủ dự án yêu cầu ngày 26/11/2026: các bậc hạng khách hàng phải dễ phân biệt. Mỗi hạng (CUS-2) có một biểu tượng và một màu riêng, hiện ở tiêu đề trang khách, thẻ Thông tin cơ bản và danh sách khách hàng (`frontend/src/components/TierBadge.tsx`).

| Hạng | Biểu tượng | Màu (token) |
|---|---|---|
| Thân thiết | Trái tim | Hồng đỏ (`tier-member`) |
| Bạc | Huy chương | Xám bạc (`tier-silver`) |
| Vàng | Vương miện | Vàng (`tier-gold`) |
| Kim Cương | Viên đá quý | Xanh ngọc (`tier-diamond`) |

Màu là token riêng (`tier-*` và `tier-*-band` trong `index.css`, định nghĩa ở cả 5 giao diện), không dùng lại màu trạng thái (thành công, cảnh báo) để hạng "Vàng" không bị đọc nhầm là cảnh báo. Chữ trên nền của từng hạng đạt tương phản WCAG AA ở mọi giao diện (test `theme.test.ts`). Hạng viết khác bốn giá trị trên hiện huy hiệu trung tính.

## 2026-11-26: "Người hỗ trợ" của lead: thấy lead nhưng không thấy số điện thoại (mở rộng LEAD-6, LEAD-7, PDP-3)

Chủ dự án yêu cầu ngày 26/11/2026: trang lead có phần "nhân viên được phân công" hỗ trợ; người được hỗ trợ **không thấy số điện thoại** khách, thấy các trường còn lại; phải che ở backend theo quyền, không chỉ ẩn trên giao diện. Tên gọi tắt chọn: **"Người hỗ trợ"**.

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Dữ liệu | Bảng `lead_supporters` (lead, người dùng, người thêm, thời điểm), duy nhất theo (lead, người dùng). Người hỗ trợ là **người dùng** đang hoạt động của GA (có hoặc không có mã đại lý), không phải người được giao của lead. Migration `LeadSupporters1764777600000` | Một lead vẫn chỉ có một người được giao (LEAD-7); người hỗ trợ là quan hệ thêm |
| Thấy lead (LEAD-6) | `LeadsService.visible` (điểm duy nhất giới hạn lead mỗi người thấy) nhận thêm lead mà người xem là người hỗ trợ: danh sách, bảng kanban, đếm, chi tiết, @nhắc tên đều theo | Không phải sửa từng API |
| Che số điện thoại (PDP-3) | Không đổi quy tắc: ai **không làm việc được** trên lead (LEAD-7) thì API trả số đã che `0912***678`. Người hỗ trợ không làm việc được trên lead nên số luôn được che ở chi tiết, danh sách, kanban và lịch sử đổi số; tìm theo số điện thoại vốn chỉ dành cho người quản lý lead | Che ở backend, đúng yêu cầu; test `lead-supporters.e2e-spec.ts` kiểm tra số thật không xuất hiện trong mọi phản hồi |
| Người hỗ trợ làm được gì | Chủ dự án làm rõ 26/11/2026: người được giao và người hỗ trợ **cùng làm việc trên một lead**, thêm người hỗ trợ không thay người được giao (ví dụ: anh B được giao liên hệ khách A, anh C làm mentor hỗ trợ anh B tư vấn). Người hỗ trợ: xem mọi trường trừ số điện thoại, **ghi chú**, **tạo / sửa / hoàn thành việc cần làm** của lead (việc vẫn đứng tên người được giao), **góp ý** (CMT-1), tự rời. Không làm: sửa thông tin lead, cập nhật Nhu cầu / Trạng thái / Giai đoạn, **ghi liên hệ** (gọi, Zalo, gặp), liên kết khách hàng, thêm / bỏ người hỗ trợ khác. API trả `canContribute` (ghi chú, việc) bên cạnh `canWork` | Ghi liên hệ chuyển lead sang "Đã liên hệ" và đóng việc "liên hệ trong 48 giờ" của người được giao (LEAD-18, LEAD-29), nên vẫn là việc của người được giao. Chủ dự án xác nhận ngày 26/11/2026: giữ như vậy, người hỗ trợ không ghi liên hệ |
| Ai thêm / bỏ | Người làm việc được trên lead (người được giao, người quản lý lead) và quản lý tuyến có `leads.assign_line` với lead trong tuyến mình. Thêm thì báo cho người được thêm (thông báo `LEAD_SUPPORT`), ghi lịch sử lead ("Thêm người hỗ trợ" / "Bỏ người hỗ trợ" kèm tên, không phải giá trị cũ đổi thành mới) và audit `CREATE` / `DELETE` `lead_supporter` | |
| Phân công | Lead chỉ thấy vì hỗ trợ không phải của mình để phân công: `canAssign` chỉ đúng với lead trong tuyến; "Chọn tất cả theo bộ lọc" (LEAD-24) không lấy các lead này; trên danh sách dòng đó có nhãn "Hỗ trợ" và không chọn được | Trước đây coi mọi lead quản lý tuyến thấy là lead trong tuyến |
| Giao diện | Trang lead có thẻ "Người hỗ trợ (n)": danh sách, ô chọn người và nút thêm, bỏ / rời. Người hỗ trợ thấy dòng nhắc số điện thoại được che | |
| API | `GET /leads/:id` trả thêm `supporters`, `supporting`, `canSupport`; `GET /leads/:id/supporters/candidates`, `POST /leads/:id/supporters {userId}`, `DELETE /leads/:id/supporters/:userId` | |
| Chưa làm | Người hỗ trợ không tự động thấy khách hàng liên kết của lead (sổ khách hàng theo CUS-5); khi gộp lead, người hỗ trợ của lead bị gộp không chuyển sang lead giữ lại | Ngoài yêu cầu |

## 2026-11-26: Bỏ "Khu vực" của lead (khác LEAD-8, mục 5.2, mục 19.7)

Chủ dự án yêu cầu ngày 26/11/2026: bỏ ô "Khu vực" (ví dụ "Miền Bắc") ở cả backend và frontend. Từ khi lead có Tỉnh / thành phố, Xã / phường và địa chỉ cụ thể (quyết định cùng ngày), khu vực gõ tay trùng ý và khó lọc.

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Dữ liệu | Migration `DropLeadRegion` xóa cột `leads.region`, xóa danh sách "Khu vực" (`lead_options` loại `region`) và bỏ loại này khỏi ràng buộc. Trước khi xóa, lead chưa có tỉnh mà khu vực ghi đúng tên một tỉnh hiện nay (ví dụ "Hà Nội") được chuyển sang tỉnh và nối với danh mục tỉnh | Khu vực kiểu "Miền Bắc" mất hẳn; `down` chỉ tạo lại cột và loại danh sách, không lấy lại dữ liệu. **Sao lưu database staging trước khi "Promote to staging"** |
| API | `POST /leads` và `PATCH /leads/:id` không còn nhận `region` (gửi lên thì `400 invalid_input`); danh sách và chi tiết lead không trả `region`; `POST /lead-options/bulk` không nhận loại `region` | Lịch sử lead vẫn giữ các lần đổi khu vực cũ, hiện nhãn "Khu vực" |
| Nhập file 13_Leads | Bỏ cột "KHU VỰC KHÁCH HÀNG" khỏi file mẫu tải về. File của GA còn cột này ("KHU VỰC KHÁCH HÀNG" hoặc "KHU VỰC") thì cột được đọc vào **Tỉnh/TP** | File "Chia Lead" mẫu ghi tên tỉnh ở cột này. Nếu file có cả hai cột, cột đứng trước được dùng (quy tắc chung khi một cột lặp lại) |
| Giao diện | Bỏ ô Khu vực ở modal thêm lead, form sửa lead và phần thông tin trang lead; Danh mục không còn danh sách "Khu vực" | |
| Chưa làm | LEAD-27 (tự phân công theo khu vực) khi làm sẽ dựa vào tỉnh thay cho khu vực | Ngoài yêu cầu |

## 2026-11-26: Tài khoản đại lý tạo tay được thêm vào Cây đại lý (khác AGT-2, USER-7)

Chủ dự án báo ngày 26/11/2026: tạo tài khoản tư vấn viên bằng tay xong, ô "Khách hàng sẽ thuộc tư vấn viên" không có người đó; chỉ đại lý nhập từ Excel mới hiện. Nguyên nhân: mọi ô chọn đại lý (AGT-9), quyền sở hữu khách / lead và nhánh của quản lý (SCOPE-1) đều đọc **Cây đại lý** (bảng `agents`), còn tạo tài khoản chỉ ghi mã đại lý vào tài khoản. Đặc tả coi cây là dữ liệu từ file 01_Agents và chỉ yêu cầu cảnh báo khi mã chưa có trong cây (USER-7).

| Điểm | Quyết định | Lý do / hệ quả |
|---|---|---|
| Khi nào thêm vào cây | Mời hoặc sửa tài khoản có vai trò đại lý (FC, UM, BM, GAD) mà mã đại lý **chưa có trong cây**: thêm đại lý vào cây trong cùng giao dịch với tài khoản, ghi audit `CREATE agent` (`meta.from = 'user'`) | Một lần lưu là người đó chọn được ở mọi ô tư vấn viên, nhận được khách / lead và nằm trong nhánh quản lý |
| Hạng, tên, trạng thái | Hạng theo vai trò đại lý cao nhất: GAD → SUM, BM → BM, UM → UM, FC → FC. Tên lấy theo tài khoản, trạng thái "Đang hoạt động" | Sau này nhập 01_Agents có mã này thì đại lý được cập nhật như mọi đại lý khác |
| Quản lý trực tiếp | Form tài khoản có ô "Quản lý trực tiếp" (chọn trong cây). Để trống thì đại lý đứng đầu một nhánh. Mã quản lý không có trong GA → `400 manager_not_found`, không lưu gì | |
| Mã đã có trong cây | Không đổi gì trên cây (tên, hạng, quản lý giữ như cây); ô quản lý bị khóa và hiện tên đại lý trong cây | Đổi quản lý vẫn làm ở trang Cây đại lý (AGT-5) |
| Quyền | Chỉ thêm vào cây khi người lưu có `agents.edit_tree` (mặc định Chủ GA, Admin). Không có quyền thì như trước: chỉ tạo tài khoản, danh sách người dùng cảnh báo mã chưa có trong cây | Không vượt quyền sửa cây |
| API | `POST /users/invite` và `PATCH /users/:id` nhận thêm `managerCode`, trả thêm `addedToTree` | |
| Ô chọn đại lý | Ô chọn đại lý (thêm khách hàng, lọc khách theo người phụ trách, quản lý trực tiếp) xếp **theo thứ tự cây** và thụt lề bằng khoảng trắng không ngắt | Trước đây xếp theo mã: đại lý thêm sau có mã lớn hơn nằm cuối danh sách dưới sai người; thụt lề bằng dấu cách thường bị trình duyệt gộp mất |
| Tài khoản đã tạo trước đây | Không tự thêm vào cây. Mở tài khoản ở Người dùng, bấm Sửa, chọn quản lý trực tiếp rồi Lưu là người đó vào cây | Tránh đưa vào cây một mã gõ nhầm |

## 2026-11-27: Vai trò là nhân viên kinh doanh; số điện thoại khách chỉ người phụ trách thấy (thay mục 4, SCOPE-1..3, CUS-5, PDP-3, ASG)

Chủ dự án yêu cầu ngày 26-27/11/2026, trả lời các câu hỏi làm rõ cùng ngày. Đang triển khai theo 4 phần; mục "Trạng thái" ghi phần nào đã xong.

| Điểm | Quyết định |
|---|---|
| Vai trò | Giám đốc GA → Quản trị viên → Trưởng ban → Trưởng nhóm → Tư vấn viên. **Bỏ Marketing** (Quản trị viên nhận việc của Marketing). **Gộp Chủ GA vào Giám đốc GA** (mã `GAD`): quyền cao nhất. Quản trị viên nền tảng giữ nguyên |
| Mọi vai trò là nhân viên kinh doanh | Ai cũng có thể có khách riêng (lead, khách có hợp đồng) theo mã đại lý của mình, kể cả Quản trị viên |
| Thấy khách | Giám đốc: tất cả. Quản trị viên: tất cả nhưng chỉ phần mô tả. Trưởng ban, Trưởng nhóm, Tư vấn viên: **chỉ khách của mình**; quản lý tuyến xem số liệu báo cáo của tuyến, không xem khách của tuyến dưới |
| Số điện thoại khách | Chỉ **người phụ trách khách** và **Giám đốc** thấy; mọi người khác (kể cả Quản trị viên, người hỗ trợ) nhận số đã che từ API |
| Bỏ khách | Lead 30 ngày không được chăm sóc (Giám đốc đổi số ngày trong Cài đặt GA), hoặc được đánh dấu Chốt xịt / Không quan tâm, rời người phụ trách về **kho chờ phân công**. Giám đốc và Quản trị viên thấy kho |
| Phân công | Giám đốc phân công có hiệu lực ngay. Quản trị viên, Trưởng ban, Trưởng nhóm phân công thành **yêu cầu chờ Giám đốc duyệt**; trong lúc chờ, khách vẫn ở chỗ cũ. Người nhận khách thấy số điện thoại từ khi phân công có hiệu lực |
| Quản trị viên bị hạn chế | Không sửa Cài đặt GA, Ma trận phân quyền, Cài đặt trợ lý AI; không xem Nhật ký, Tra cứu trò chuyện; không duyệt phân công |
| Phần 1 (xong 27/11/2026) | Migration `DropMarketingRole`: tài khoản Marketing thành Quản trị viên, quyền của Marketing trong ma trận gộp vào Quản trị viên. Migration `GaDirector`: tài khoản Chủ GA (`GA_HEAD`) thành Giám đốc GA (`GAD`); Giám đốc GA luôn có mọi quyền, thấy toàn GA, không còn trong ma trận; mã đại lý **không bắt buộc** với Giám đốc GA (Chủ GA cũ chưa có mã; có mã thì nằm trong cây hạng SUM). Mã lỗi `last_ga_head` giữ tên, nghĩa là "GA phải còn ít nhất một Giám đốc GA đang hoạt động". Tài khoản Marketing cũ giờ là Quản trị viên nên phải cài xác thực hai lớp (USER-16) |
| Phần 2 (xong 27/11/2026) | Lead: Giám đốc và người có `leads.manage` (Quản trị viên) thấy mọi lead; người khác chỉ lead của mình (`AccessService.leadAgentCodes`). Khách hàng: Giám đốc và Quản trị viên thấy mọi khách; người khác chỉ khách mình phụ trách (`ClientsService.reach`). Số điện thoại lead và khách, lịch sử đổi số, và địa chỉ liên hệ của hợp đồng chỉ trả cho người phụ trách và Giám đốc (`seesPhoneOf`); tìm theo số chỉ ra khách mà người tìm thấy được số. Danh sách việc "của đội" chỉ còn cho Giám đốc. Chỉ Giám đốc thêm khách cho đại lý khác; người khác thêm cho chính mình. Báo cáo của quản lý tuyến vẫn tính cả tuyến (số liệu, không có khách) |
| Phần 3 (xong 27/11/2026) | Lead được đánh dấu Chốt xịt (`careStatus` DROPPED), Không quan tâm (`careStatus` hoặc `interest` NOT_INTERESTED), hoặc quá số ngày không liên hệ (`leadRules.abandonDays`, mặc định 30, tính từ lần liên hệ gần nhất hoặc lúc được giao; Giám đốc đổi trong Cài đặt GA) thì về **kho chờ phân công**: bỏ người phụ trách, ghi `released_at`, `released_from`, `release_reason` (migration `LeadRelease`), hủy mọi việc đang mở của lead, ghi lịch sử ("Về kho chờ phân công", người thay đổi để trống = "Hệ thống" khi do vòng quét hằng ngày) và audit `ASSIGN`. Vòng quét chạy cùng vòng thông báo buổi sáng (`RemindersService.morning`). Danh sách lead có tab "Khách bị bỏ" cho Giám đốc và Quản trị viên; trang lead ghi ngày, người phụ trách cũ và lý do. Giao lại thì xóa dấu "bị bỏ" và người mới thấy số điện thoại |
| Ngoại lệ phần 3 | Lead tự khai thác của tư vấn viên còn làm việc không về kho (LEAD-9: không ai chuyển được lead này) | Cần chủ dự án xác nhận |
| Chưa làm (phần 3) | Dòng của file 13_Leads đặt Chốt xịt / Không quan tâm chưa đưa lead về kho (chỉ thao tác trên ứng dụng và vòng quét); chưa có thông báo khi lead về kho | |
| Phần 4 | Chưa làm: duyệt phân công. Cho tới khi xong, phân công lead trong tuyến (`leads.assign_line`) và phân công khách (`clients.assign`) vẫn theo luật cũ ở API, dù quản lý tuyến không còn thấy khách của tuyến |

## Not built yet

| Rule | Item | Needed before go-live |
|---|---|---|
| USER-16 | Self-service "forgot password" by email; admins can create reset links today (no email service yet) | Yes |
| USER-3 | Sending invites by email; links are copied by hand for now | Yes |
| USER-4 | Full breached-password check; only a local list of common passwords exists | Yes |
| USER-16 | OIDC SSO for DLVN staff | Yes |
| USER-17 | 12-hour idle timeout for admins (OPEN in the spec) | PO decision |
| Section 17.1 | Redis-backed rate limits; the per-IP and per-user throttlers are in memory, so they are per process (Redis now runs, for realtime only). Sign-in counters are in PostgreSQL | Yes, once there is more than one instance |
| Section 17.1 | `Idempotency-Key` | Yes |
| Review | Role ceiling: a `users.manage` holder can still grant other users roles they do not hold | PO decision |
| Review | Audit chain uses unkeyed SHA-256, so someone with DB write access can rebuild it; needs an HMAC key outside the DB, external anchoring and a scheduled verifier | Yes |
| Review | Unaccepted invites hold an email forever, and the 409 reveals that an email exists in another GA (global uniqueness is USER-2) | PO decision |
| LEAD-19 | Kanban board; a stage can be changed from the detail screen | Later |
| LEAD-26, 27 | Consent rule for telesales campaigns; automatic assignment of form and file leads (round robin or by region, off by default) | When a GA asks for it |
| NOTE-8 | Attachments on notes (images, PDF up to 10 MB); object storage now exists (chat C4), the notes UI and API do not | With file storage (IMP-14) |
| Section 17.8 | `GET /clients/search` | When a search box needs it |
| CMT-3 for clients | A "new comment" label and tab on the client list | If owners ask for it |
| NTF-1 | Web push (PWA, VAPID keys, `pushSubscriptions`) and the daily email digest | After PWA and an email service |
| NTF-2 | "Import finished" and AI budget 80% / 100% notices | With background imports and the AI slice |
| TASK-5 | Quick note from the Today screen; bottom navigation on phones | Later |
| Section 16.3 | Exporting leads | Slice 6 |
| RPT-6 | Server-side export jobs with a signed link valid 15 minutes, masked Success data for Marketing | With list exports |
| RPT-7 | Nightly `dailyAgentStats` snapshot for large GAs | When a GA is large |
| R4, R6 | Activity targets, production | Waiting on sheet columns (IMP-33) |
| AGT-8 | Org chart export | Later |
| IMP-13 | Files of 2,000 rows or more are written in batches in the background with live progress (open question I), but inside the API process, not a queue worker; a write cut off by a restart is closed, not resumed; only 2,000 rows are measured | Before go-live |
| IMP-14 | Object storage for the original file | Before go-live |
| Review | Rate-limited sign-ins and bad reset or invite tokens are not audited; a lock only goes to the server log | Before go-live |
| AUD-1 | DB account limited to insert and find on `auditEvents`; development uses the root account and only the Mongoose model refuses changes | Yes |
| Section 5.2 | Secondary lists (lost reasons, needs, phone sources, regions, campaign types), logo, working calendar on the GA settings screen | With the features that use them; default list values wait on open question D |
| Section 2.2 | i18n English catalogue, PWA, Playwright E2E, CI | Later slices |
