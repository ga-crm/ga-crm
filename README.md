# GA CRM

CRM đa người thuê cho các Tổng Đại lý (GA). Đặc tả đầy đủ nằm trong [requirement/](requirement/README.md). Tiến độ, lộ trình và chỉ mục quy tắc nằm trong [docs/](docs/README.md).

## Tính năng đã hoàn thành

Cập nhật ngày 11/11/2026, theo đặc tả v2.1. Trạng thái chi tiết từng hạng mục xem [docs/ROADMAP.md](docs/ROADMAP.md); những chỗ cố ý làm khác đặc tả xem [docs/decisions.md](docs/decisions.md).

### Nền tảng, tài khoản và bảo mật

- Nhiều GA dùng chung hệ thống nhưng dữ liệu tách biệt hoàn toàn; GA này không bao giờ đọc được dữ liệu GA khác.
- Đăng nhập bằng email và mật khẩu, chỉ qua lời mời; chính sách mật khẩu, giới hạn và khóa tạm khi nhập sai nhiều lần, phiên có hạn, đăng xuất các thiết bị khác.
- **Xác thực hai lớp (MFA)** bằng ứng dụng xác thực: bắt buộc với Chủ GA, Quản trị viên, Quản trị nền tảng; GA có thể bắt buộc cho mọi người. Có mã dự phòng và chức năng đặt lại khi mất điện thoại.
- Vai trò và ma trận phân quyền do Chủ GA chỉnh; phạm vi dữ liệu theo tuyến (tư vấn viên thấy của mình, quản lý thấy tuyến dưới, Chủ GA thấy tất cả).
- Người dùng: mời, cấp lại link, khóa, lưu trữ người nghỉ việc, kích hoạt lại, đổi email, đặt lại mật khẩu bằng link.
- Nhật ký kiểm toán chỉ ghi thêm (có chuỗi băm), có màn hình xem và bộ lọc.
- Giao diện tiếng Việt, đổi giao diện sáng / tối và màu nhấn, chạy được trên điện thoại.

### Quản trị GA

- Cây đại lý: xem theo nhánh, tìm kiếm, nhập tay, đổi quản lý, nhập file 01_Agents có file mẫu và báo lỗi từng dòng.
- Danh mục lead (Nhu cầu, Trạng thái, Nguồn) và danh mục chương trình bảo hiểm.
- Cài đặt GA: tên hiển thị, hạn liên hệ lead, giờ yên lặng của thông báo, bắt buộc MFA, xem gói dịch vụ.

### Lead

- Tạo lead, danh sách có tab đếm số, bộ lọc, sắp xếp, **lưu bộ lọc** theo người dùng.
- Xem dạng bảng hoặc **kanban theo giai đoạn** (kéo thả; trên điện thoại xem từng giai đoạn).
- Chi tiết lead: thông tin, trạng thái, ghi chú và lượt liên hệ (sửa / xóa ghi chú của mình trong 24 giờ), góp ý của quản lý có **@nhắc tên**, việc cần làm, lịch sử thay đổi, lịch sử phụ trách.
- Phân công một hoặc nhiều lead (chọn theo bộ lọc tới 200), tự tạo việc "liên hệ trong 48 giờ".
- Nhập lead từ Excel có ghép cột và ghép đại lý.
- **Xóa lead** vào thùng rác (khôi phục trong 30 ngày), **xóa theo yêu cầu của khách** (xóa vĩnh viễn thông tin cá nhân), **gộp hai lead** khi khách đổi số.

### Khách hàng

- Nhập file Success (sheet 02-05, 07): khách hàng, hợp đồng, hồ sơ yêu cầu bảo hiểm, hoạt động.
- Danh sách và chi tiết khách hàng, nhập tay khách hàng / hợp đồng, phân công khách hàng.
- Gia đình, bảng quyền lợi bảo hiểm, cơ hội chăm sóc (phí đến hạn, sinh nhật, thiếu quyền lợi...), ghi chú, **góp ý trên khách hàng**, lịch sử thay đổi.
- Liên kết lead với khách hàng, tự chuyển giai đoạn lead theo dữ liệu Success.

### Chiến dịch

- Chiến dịch và hội thảo (điểm danh người tham dự), số liệu và chi phí mỗi lead.
- **Form đăng ký công khai** theo chiến dịch: link và mã QR, ô đồng ý liên hệ, chống bot (Cloudflare Turnstile), giới hạn gửi; không bao giờ lộ số điện thoại đã có.

### Công việc, báo cáo, thông báo

- Trang chủ "Hôm nay": việc đến hạn và quá hạn, số lead cần xử lý, khách cần chăm sóc, độ mới dữ liệu Success.
- Việc cần làm (của lead, của khách, việc cá nhân), lịch tháng / tuần kéo thả đổi ngày, đồng bộ lịch qua link ICS.
- Báo cáo R1, R2, R3, R5, R7, R8 dạng cây theo đại lý, chọn kỳ, bấm số xem danh sách, xuất Excel.
- Thông báo trong ứng dụng (chuông, trang thông báo, tùy chọn từng loại): được giao lead / khách, góp ý mới, được nhắc tên, việc đến hạn, sắp đến giờ hẹn, lead sắp quá hạn, tóm tắt buổi sáng.

### Trợ lý AI (mới có phần cài đặt)

- Chủ GA nhập khóa API của Gemini, DeepSeek hoặc Qwen (lưu mã hóa), kiểm tra khóa, chọn mô hình theo tầng, đặt hạn mức token và bật / tắt AI. Trợ lý trò chuyện, kho kiến thức và luyện tập chưa làm.

### Quản trị nền tảng

- Tạo GA cùng Chủ GA đầu tiên, tạm ngưng / kích hoạt lại, xem người dùng của GA (có kiểm toán), cấp lại link mời, đặt lại MFA.
- **Gói dịch vụ và giới hạn** cho từng GA: số người dùng tối đa, token AI mỗi tháng, dung lượng.

### Chưa làm

Trợ lý AI trò chuyện, kho kiến thức và luyện tập (tạm hoãn); yêu cầu của chủ thể dữ liệu (xuất / xóa theo phiếu); danh mục sản phẩm 11_Products; báo cáo R4, R6 (chờ cột file); thông báo đẩy và email (chờ chọn dịch vụ email); quên mật khẩu tự phục vụ; gia cố và kiểm thử tải trước khi ra mắt.

## Chạy thử trên máy

Làm lần lượt 6 bước dưới đây là có đủ tài khoản và dữ liệu demo.

### Bước 1: Chuẩn bị

Cần cài sẵn:

| Phần mềm       | Phiên bản       | Kiểm tra bằng lệnh |
| -------------- | --------------- | ------------------ |
| Node.js        | 22 trở lên      | `node -v`          |
| Docker Desktop | Đang mở và chạy | `docker -v`        |

Các cổng `4200`, `5173`, `5433`, `6380` và `9100` phải đang trống.

Mở terminal và vào thư mục dự án:

```bash
cd GA-CRM
```

### Bước 2: Cài đặt

Lệnh này tạo file `.env` và cài thư viện cho API (`backend`) và frontend. Lần đầu mất vài phút.

```bash
npm run setup
```

### Bước 3: Bật database

Lệnh này chạy PostgreSQL 18, Valkey (Redis) và MinIO (kho file chuẩn S3, cổng 9100, cho file gửi trong chat) trong Docker và chờ tới khi sẵn sàng. PostgreSQL dùng cổng 5433, để không đụng PostgreSQL khác có thể đang chạy ở 5432; Valkey dùng cổng 6380 và chuyển sự kiện realtime (chuông thông báo cập nhật ngay).

```bash
npm run db:up
```

Nếu `.env` được tạo trước ngày 12/11/2026 thì nó chưa có các dòng `PG_*`, `DATABASE_*` và `API_PORT`: chép phần PostgreSQL ở cuối `.env.example` sang `.env` và thay các giá trị `__GENERATE__` bằng chuỗi ngẫu nhiên.

### Bước 4: Tạo dữ liệu demo

Lệnh này tạo bảng (chạy migration) rồi thêm dữ liệu demo. Khi xong, nó in ra số dữ liệu đã tạo và danh sách tài khoản.

```bash
npm run seed
```

### Bước 5: Chạy API và frontend

Mở **hai terminal riêng** tại thư mục dự án và giữ cả hai đang chạy.

Terminal thứ nhất chạy API. Chờ tới khi thấy dòng `API (PostgreSQL): http://localhost:4200/api/v1`.

```bash
npm run dev:api
```

Terminal thứ hai chạy frontend:

```bash
npm run dev:web
```

### Bước 6: Mở trình duyệt và đăng nhập

Mở http://localhost:5173 rồi đăng nhập bằng một tài khoản bên dưới.

**Mật khẩu của mọi tài khoản demo: `Demo@2026`**

| Vai trò           | Email                                 | Nên thử gì                                                      |
| ----------------- | ------------------------------------- | --------------------------------------------------------------- |
| Chủ GA            | `head@ga1.gacrm.local`                | Có mọi quyền: lead, cây đại lý, người dùng, phân quyền, nhật ký |
| Quản trị viên     | `admin@ga1.gacrm.local`               | Người dùng, cây đại lý, lần nhập đang chờ xác nhận              |
| Marketing         | `marketing@ga1.gacrm.local`           | Toàn bộ lead, phân công hàng loạt, nhập lead từ Excel           |
| Giám đốc GA       | `gad@ga1.gacrm.local`                 | Lead và cây đại lý của toàn tuyến                               |
| Trưởng ban        | `bm@ga1.gacrm.local`                  | Lead của tuyến dưới, số điện thoại bị che                       |
| Trưởng nhóm       | `um@ga1.gacrm.local`                  | Xem lead cấp dưới, để lại góp ý                                 |
| Tư vấn viên       | `fc@ga1.gacrm.local`                  | Lead của mình, ghi chú, việc cần làm, có góp ý mới              |
| Tư vấn viên khác  | `fc2@`, `fc3@`, `fc4@ga1.gacrm.local` | Mỗi người chỉ thấy lead của mình                                |
| Trưởng nhóm khác  | `um2@ga1.gacrm.local`                 | Nhánh khác của cây đại lý                                       |
| Quản trị nền tảng | `platform@gacrm.local`                | Quản lý các GA                                                  |

Có 5 Tổng đại lý demo theo khu vực, mỗi GA có đủ các tài khoản này, chỉ khác số sau `@ga`: `@ga1` Hà Nội (`GA-HN`), `@ga2` Hồ Chí Minh (`GA-HCM`), `@ga3` Miền Trung (`GA-MT`), `@ga4` Miền Nam (`GA-MN`), `@ga5` Miền Bắc (`GA-MB`). Các GA tách biệt hoàn toàn về dữ liệu.

**Xác thực hai lớp:** Chủ GA, Quản trị viên và Quản trị nền tảng bắt buộc dùng MFA. Lần đầu đăng nhập, các tài khoản này được đưa tới trang "Bật xác thực hai lớp": quét mã QR bằng ứng dụng xác thực trên điện thoại (Google Authenticator, Microsoft Authenticator...) rồi nhập mã 6 số. Nếu chỉ demo trên máy và không muốn bước này, thêm dòng `MFA_ENFORCE=false` vào file `.env` rồi chạy lại API.

**Chuyển nhanh tài khoản khi thử:** thêm dòng `DEV_ACCOUNT_SWITCHER=true` vào `.env` rồi chạy lại API. Trang đăng nhập có nút "Đăng nhập nhanh bằng tài khoản thử" và thanh trên cùng có nút "Đổi tài khoản": chọn bất kỳ tài khoản nào của mọi GA để vào ngay, không cần mật khẩu hay MFA. Chỉ dùng trên máy: API từ chối khởi động nếu bật cờ này khi `NODE_ENV=production`, và bản build production không có nút này.

Tài khoản `fc.nghi@ga1.gacrm.local` đã bị khóa, `fc.danghi@ga1.gacrm.local` đã lưu trữ (người đã nghỉ; mã đại lý của họ đã chuyển cho người mới) và `fc.moi@ga1.gacrm.local` đang chờ kích hoạt, nên ba tài khoản này không đăng nhập được. Chúng có sẵn trong màn hình Người dùng; người đã lưu trữ chỉ hiện khi lọc "Đã lưu trữ".

## Dữ liệu demo có gì

Mỗi GA có sẵn:

| Dữ liệu                                    | Số lượng                                                                                                   | Xem ở đâu                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------- |
| Người dùng                                 | 13, gồm đủ vai trò, một đang chờ kích hoạt, một bị khóa                                                    | Quản trị > Người dùng     |
| Đại lý                                     | 10, có một người đã ngưng hoạt động                                                                        | Đại lý > Cây đại lý       |
| Lead                                       | 44, đủ mọi giai đoạn và trạng thái, gồm lead mới, quá hạn, đã chốt, chốt xịt, chưa phân công, tự khai thác | Lead > Danh sách lead     |
| Ghi chú, lượt liên hệ, góp ý, việc cần làm | Trên các lead                                                                                              | Mở một lead               |
| Chiến dịch                                 | 3                                                                                                          | Bộ lọc của danh sách lead |
| Lần nhập file                              | Một đã xong kèm dòng lỗi, một đang chờ xác nhận                                                            | Đại lý > Lịch sử nhập     |
| Nhật ký kiểm toán                          | Theo các thao tác trên                                                                                     | Quản trị > Nhật ký        |

## Kịch bản demo gợi ý

1. **Phân công lead.** Đăng nhập `marketing@ga1.gacrm.local`, mở tab **Chưa phân công**, tick vài lead rồi bấm **Phân công**.
2. **Tư vấn viên xử lý lead.** Đăng nhập `fc@ga1.gacrm.local`, mở tab **Mới được giao**, vào một lead, ghi một lượt gọi điện rồi đổi trạng thái. Thử chọn **Đã chốt** mà không nhập số hồ sơ để xem hệ thống báo lỗi.
3. **Quản lý góp ý.** Đăng nhập `um@ga1.gacrm.local`, mở lead của tư vấn viên. Số điện thoại bị che, không sửa được trạng thái nhưng gửi được góp ý.
4. **Nhập lead từ Excel.** Đăng nhập `marketing@ga1.gacrm.local`, vào **Lead > Nhập lead từ Excel**, bấm **Tải file mẫu**, tải chính file đó lên, kiểm tra cột được ghép tự động, xem trước rồi xác nhận. Tải lại cùng file lần nữa để thấy dữ liệu được giữ nguyên.
5. **Nhập cây đại lý.** Đăng nhập `admin@ga1.gacrm.local`, vào **Đại lý > Lịch sử nhập** và mở lần nhập đang chờ xác nhận để xem cách hệ thống báo lỗi từng dòng.
6. **Phân quyền.** Đăng nhập `head@ga1.gacrm.local`, vào **Quản trị > Phân quyền**, đổi quyền của một vai trò rồi đăng nhập bằng vai trò đó để thấy thay đổi.

## Quy trình đưa code lên

1. Bật hook một lần trên máy: `npm run hooks:install`. Từ đó mỗi lần `git push`, máy tự chạy kiểm tra nhanh (kiểu, lint, unit test; khoảng 10 giây) và dừng push nếu lỗi. Chạy tay: `npm run check`. Bỏ qua có chủ ý: `git push --no-verify`.
2. Làm trên nhánh riêng (`git switch -c ten-nhanh`), push, rồi mở Pull Request vào `main`.
3. GitHub chạy workflow "CI": `Checks` (khoảng 1,5 phút) và `Integration tests` (khoảng 9 phút). Chỉ merge khi cả hai xanh.
4. Đưa lên staging: Actions > "Promote to staging" > Run workflow trên `main`. Pipeline chờ CI của commit đó xanh, lọc file sang nhánh `staging`, build và deploy (khoảng 1,5 phút sau khi CI xong). Chi tiết ở `deploy/README.md`.

Không commit lên nhánh `staging` và không merge `staging` vào `main`: `staging` là bản lọc của `main`, thiếu tài liệu và file test.

## Lệnh thường dùng

| Lệnh                 | Việc thực hiện                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run seed`       | Chạy migration, thêm dữ liệu demo nếu chưa có và đặt lại mật khẩu các tài khoản demo. Chạy lại nhiều lần vẫn an toàn |
| `npm run seed:reset` | **Xóa toàn bộ database local** rồi tạo lại bảng và dữ liệu demo từ đầu                                 |
| `npm run db:down`    | Dừng PostgreSQL, dữ liệu vẫn được giữ                                                                  |
| `npm run db:migrate` | Chạy migration PostgreSQL                                                                              |
| `npm run db:logs`    | Xem log PostgreSQL                                                                                     |
| `npm test`           | Chạy toàn bộ test (cần `npm run db:up`; test dùng database riêng `ga_crm_test`)                        |
| `npm run build`      | Build API và frontend                                                                                  |
| `npm run check`      | Kiểm tra nhanh trước khi push: kiểu, lint, unit test của cả hai phần (hook pre-push chạy lệnh này)        |
| `npm run staging:sync -- --dry-run` | Xem trước những gì sẽ đổi trên nhánh `staging`. Đưa code lên staging và deploy: GitHub Actions > "Promote to staging"; hướng dẫn ở `deploy/README.md` |

Muốn demo lại từ đầu thì chạy lệnh dưới. Dữ liệu bạn đã nhập sẽ mất.

```bash
npm run seed:reset
```

## Khi gặp lỗi

| Hiện tượng                                 | Cách xử lý                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `Missing .env` hoặc thiếu biến môi trường  | Chạy `npm run setup`                                                                                        |
| `Cannot connect to the Docker daemon`      | Mở Docker Desktop, chờ chạy xong rồi chạy lại `npm run db:up`                                               |
| Cổng `4200` hoặc `5173` đã được dùng       | Tắt chương trình đang dùng cổng đó                                                                          |
| Đăng nhập báo sai mật khẩu                 | Chạy `npm run seed` để đặt lại mật khẩu và gỡ khóa đăng nhập                                                |
| Giao diện báo lỗi kết nối                  | Kiểm tra terminal API còn chạy; API sẵn sàng khi http://localhost:4200/api/v1/health trả về kết quả         |
| Báo "Quá nhiều yêu cầu" khi đăng nhập      | Do nhập sai nhiều lần. Chờ theo thời gian báo, hoặc chạy `npm run seed` để gỡ khóa                          |
| API báo `Cannot find module dist/main`     | Dừng `npm run dev:api` rồi chạy lại                                                                         |
| Bị đưa tới trang "Bật xác thực hai lớp"    | Cài MFA bằng ứng dụng xác thực, hoặc thêm `MFA_ENFORCE=false` vào `.env` khi chỉ demo trên máy               |
| Mất điện thoại có ứng dụng xác thực        | Nhập một mã dự phòng, hoặc nhờ Chủ GA / Quản trị viên "Đặt lại xác thực hai lớp" ở màn hình Người dùng       |

Mật khẩu `Demo@2026` chỉ dùng để demo trên máy local. Lệnh seed tự từ chối chạy khi `NODE_ENV=production`.

## Thông tin kỹ thuật

| Thành phần | Công nghệ                                                       | Địa chỉ khi chạy local       |
| ---------- | --------------------------------------------------------------- | ---------------------------- |
| API        | NestJS 12, TypeORM 1.x, class-validator (`backend`)            | http://localhost:4200/api/v1 |
| Swagger UI | @nestjs/swagger                                                 | http://localhost:4200/docs   |
| Frontend   | React 19, Vite, Tailwind, shadcn/ui (Radix), TanStack Query, React Hook Form + Zod | http://localhost:5173        |
| Database   | PostgreSQL 18 trong Docker, row-level security theo GA          | localhost:5433               |
| Realtime   | Socket.IO (`/socket.io`), Valkey trong Docker cho nhiều bản API | localhost:6380               |
| Kho file   | MinIO trong Docker (chuẩn S3); production dùng S3 thật          | localhost:9100               |

### Dùng Swagger

1. Mở http://localhost:4200/docs.
2. Gọi `POST /api/v1/auth/sign-in/email` với email và mật khẩu ở trên.
3. Trình duyệt tự lưu session cookie, các API khác dùng được ngay, không cần bấm Authorize.

Swagger chỉ bật khi `NODE_ENV` khác `production`.

### Cấu trúc

Kiến trúc ở [docs/thiet-ke-he-thong.md](docs/thiet-ke-he-thong.md). API là `backend/` (NestJS, TypeORM, PostgreSQL), giao diện là `frontend/`.

```
backend/src/
  common/           Lỗi API, RBAC, mật khẩu, token, mã hóa bí mật
  config/           Đọc .env gốc, kiểm tra biến môi trường
  core/db/          Hai kết nối TypeORM: crm_app (chịu RLS) và crm_platform (xuyên tenant)
  core/tenancy/     Scope, TenantDb (đặt tenant cho mỗi transaction), PlatformDb
  core/persistence/ Outbox, idempotency key, ghi hàng loạt, ghép câu SQL
  migrations/       Migration SQL: bảng, RLS, quyền
  modules/
    access/         Phạm vi xem lead và khách theo tuyến
    agents/         Cây đại lý
    ai/             Cài đặt AI, khóa nhà cung cấp
    audit/          Nhật ký kiểm toán chỉ ghi thêm, có chuỗi băm
    auth/           Đăng nhập, session, MFA, /me, lời mời, các guard
    campaigns/      Chiến dịch, hội thảo, form công khai
    clients/        Khách hàng, hợp đồng, gia đình, cơ hội chăm sóc, liên kết lead
    imports/        Nhập file, file mẫu, báo cáo lỗi
    leads/          Lead, ghi chú, góp ý, việc của lead, kanban, xóa / gộp lead
    notifications/  Thông báo trong ứng dụng
    platform/       Quản trị GA (Platform Admin), gói dịch vụ
    reports/        Báo cáo R1-R8
    tenants/        GA, cài đặt GA, ma trận phân quyền
    users/          Người dùng, lời mời
    work/           Việc cần làm, Hôm nay, lịch, nhắc việc chạy nền
  seed/             Dữ liệu demo, seed:reset
infra/postgres/init/ Tạo role crm_app, crm_platform lần đầu bật PostgreSQL
frontend/src/
  auth/             Người dùng hiện tại, chặn route theo quyền
  components/       Khung ứng dụng và bộ thành phần giao diện (ui.tsx, dựng trên shadcn/ui)
  components/shadcn/ Thành phần shadcn/ui đã chỉnh theo token của dự án
  i18n/             Danh mục chuỗi tiếng Việt
  lib/              API client, truy vấn, đọc file Excel
  pages/            Các màn hình, mỗi màn hình tải riêng khi cần
```

### Thêm một API mới

Mọi route đều yêu cầu đăng nhập, trừ khi gắn `@Public()`. Thêm quyền bằng `@RequirePermissions(Permission.X)` hoặc `@RequireRoles(Role.X)`. Bảng nghiệp vụ mới phải có `tenant_id` và chính sách row-level security `FORCE`, và chỉ được đọc / ghi qua `TenantDb.run`. Xem thêm [CLAUDE.md](CLAUDE.md), skill `ga-crm-feature` và [docs/decisions.md](docs/decisions.md).
