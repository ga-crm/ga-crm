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
| Ai mở màn hình Danh mục | Chủ GA, Admin, và người có `catalog.manage` (chỉ thấy thẻ Chương trình) | Bảng 4.3 |
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
| 12a | Nguồn lead tạo tay chỉ chọn từ Danh mục; nguồn mới từ file nhập vào được tự thêm vào Danh mục | Không đổi |
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
| Hệ quả | Không còn gì tự động chặn một commit làm vỡ test (kể cả test cách ly tenant ở mục 23.2 của đặc tả) trước khi lên staging. Người push `main` phải chạy `npm test` và lint trên máy. Trước go-live production nên bật lại test trong pipeline của nhánh production | Ghi rõ để không ai tưởng staging đã được kiểm tra tự động |

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
