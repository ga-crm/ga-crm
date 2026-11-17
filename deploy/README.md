# Triển khai staging lên VPS Ubuntu 24.04

Staging chạy ở **https://221-132-21-32.sslip.io** trên VPS `221.132.21.32` (Ubuntu 24.04 LTS x64). `221-132-21-32.sslip.io` là tên miễn phí luôn trỏ về IP này, nên không cần tạo bản ghi DNS. App bắt buộc chạy HTTPS vì ở production cookie đăng nhập có cờ Secure.

## Từ main sang staging

Code viết trên `main`. Nhánh `staging` do pipeline sinh ra từ `main` và chỉ chứa các đường dẫn liệt kê trong `deploy/staging-paths.txt` (`backend/`, `frontend/`, `deploy/`, `infra/` và vài file gốc). `docs/`, `requirement/`, `.claude/`, `CLAUDE.md`, `README.md`, `.github/` và mọi thứ không có trong danh sách không bao giờ sang `staging`. Không commit thẳng lên `staging`: lần đồng bộ sau sẽ thay nội dung đó.

Đưa code sang staging và deploy: trên GitHub, tab **Actions > Promote to staging > Run workflow** (nhánh `main`). Một lần chạy làm ba việc: lọc và đẩy sang `staging`, build đúng commit đó, rồi deploy lên VPS (khoảng 3 đến 4 phút).

**Test chạy ở CI của `main`, không chạy trong workflow deploy.** Workflow "CI" (`.github/workflows/ci.yml`) chạy trên mọi Pull Request vào `main` và mọi lần push lên `main`: job `Checks` (typecheck, lint, unit test, chỉ mục quy tắc; khoảng 1,5 phút) và job `Integration tests` (khoảng 9 phút). "Promote to staging" chờ CI của đúng commit đó xanh rồi mới đẩy sang `staging`; CI đỏ thì dừng. Khi khẩn cấp, đánh dấu ô "Khẩn cấp…" lúc bấm Run workflow để bỏ qua (log ghi lại ai bỏ qua). Nhánh `staging` không chứa file test (các dòng `!` trong `deploy/staging-paths.txt`).

Xem trước những gì sẽ đổi trên `staging`, không đẩy gì (chạy trên máy, tính theo `origin/main`, tức là các commit đã push):

```bash
npm run staging:sync -- --dry-run
```

Muốn thêm hoặc bớt thứ được sang staging: sửa `deploy/staging-paths.txt` trên `main`.

## Thư mục này

| File | Việc |
|---|---|
| `staging-paths.txt` | Danh sách đường dẫn được sang nhánh `staging`; dòng bắt đầu bằng `!` loại bớt file (hiện là file test) |
| `sync-staging.sh` | Dựng nhánh `staging` từ một commit của `main` theo danh sách trên, không đụng thư mục làm việc |
| `setup-server.sh` | Chạy **một lần** bằng root trên VPS mới: cài gói, Node 26, Docker, hai người dùng (`gacrm` nhận deploy, `gacrm-api` chạy API), quyền sudo hẹp, thư mục `/opt/ga-crm`, file `.env`, systemd, nginx, tường lửa, sao lưu hằng ngày, chứng chỉ HTTPS. Chạy lại an toàn |
| `remote-deploy.sh` | GitHub Actions chạy mỗi lần deploy: giải nén bản mới, cài package, bật PostgreSQL/Valkey/MinIO, migration, chuyển `current`, khởi động lại API, health check, tự quay về bản trước nếu hỏng |
| `systemd/ga-crm-api.service` | Dịch vụ chạy API bằng người dùng `gacrm-api` (không thuộc nhóm `docker`), có sandbox |
| `nginx/ga-crm.conf.template` | Site nginx: file tĩnh của web, `/api` và `/socket.io` chuyển vào API, nén gzip, cache file build 1 năm |
| `nginx/ga-crm-headers.conf` | Header bảo mật cho file tĩnh (HSTS, nosniff, chặn nhúng iframe, no-referrer) |
| `../.github/workflows/staging.yml` | Workflow "Promote to staging" (chỉ có trên `main`): đồng bộ sang `staging`, build (trình biên dịch vẫn bắt lỗi kiểu), gửi gói lên VPS, gọi `remote-deploy.sh`, rồi kiểm tra địa chỉ công khai |

Trên VPS:

```
/opt/ga-crm/
  .env                     cấu hình duy nhất (quyền 640: gacrm ghi, nhóm gacrm đọc), không vào git
  docker-compose.yml       PostgreSQL 18, Valkey, MinIO, chỉ nghe 127.0.0.1
  infra/                   script tạo role PostgreSQL lần đầu
  incoming/                gói GitHub Actions gửi lên
  backups/                 bản sao lưu PostgreSQL hằng ngày, giữ 14 ngày
  releases/<sha>-<giờ>/    5 bản gần nhất
  current -> releases/...  bản đang chạy (systemd và nginx dùng)
```

## Bước 1. Khóa SSH cho GitHub Actions (trên máy bạn)

```bash
ssh-keygen -t ed25519 -C "github-deploy-staging" -f ~/.ssh/ga-crm-deploy -N ""
```

Khóa công khai `~/.ssh/ga-crm-deploy.pub` lên VPS ở bước 2; khóa bí mật `~/.ssh/ga-crm-deploy` chỉ dán vào GitHub ở bước 3, không gửi đi đâu khác.

## Bước 2. Dựng VPS (một lần)

Chép các file cần thiết lên VPS, kèm khóa công khai (chạy trên máy bạn, trong thư mục repo; `origin/main` cần đã có thư mục `deploy/`):

```bash
git archive origin/main deploy docker-compose.yml infra .env.example scripts/setup-env.mjs | ssh root@221.132.21.32 'rm -rf /root/ga-crm-setup && mkdir -p /root/ga-crm-setup && tar -x -C /root/ga-crm-setup'
```

```bash
scp ~/.ssh/ga-crm-deploy.pub root@221.132.21.32:/root/ga-crm-setup/
```

Chạy script trên VPS. Thay hai địa chỉ email: `--email` nhận cảnh báo chứng chỉ của Let's Encrypt, `--admin-email` là tài khoản Platform Admin đầu tiên của app:

```bash
ssh root@221.132.21.32 'bash /root/ga-crm-setup/deploy/setup-server.sh --domain 221-132-21-32.sslip.io --email ban@vi-du.vn --admin-email ban@vi-du.vn --deploy-key-file /root/ga-crm-setup/ga-crm-deploy.pub'
```

Nếu VPS chỉ cho đăng nhập bằng người dùng có sudo (không phải root), thay `ssh root@...` bằng `ssh ten-ban@...` và thêm `sudo` trước `bash`. Nếu nhà cung cấp VPS có tường lửa riêng, mở cổng 22, 80, 443 ở đó trước khi chạy (certbot cần cổng 80).

Cuối cùng script in ra giá trị cho GitHub, gồm dòng `VPS_KNOWN_HOSTS` lấy từ chính khóa máy chủ của VPS.

**Nếu script dừng ở "HTTPS certificate".** `sslip.io` không nằm trong Public Suffix List, nên giới hạn cấp chứng chỉ của Let's Encrypt (theo tên miền đăng ký) dùng chung cho mọi người dùng sslip.io và có lúc bị đầy ("too many certificates already issued"). Cách xử lý:

1. Chạy lại đúng lệnh trên, thêm `--no-tls` ở cuối. Script hoàn tất phần còn lại và in giá trị cho GitHub. Lúc này web mở được bằng HTTP nhưng **chưa đăng nhập được** (cookie cần HTTPS).
2. Thử lấy chứng chỉ lại sau vài giờ: `sudo certbot --nginx -d 221-132-21-32.sslip.io --redirect -m <email> --agree-tos -n`.
3. Hoặc dùng tên miền riêng: tạo bản ghi A (ví dụ `staging.ten-mien.vn`) trỏ về `221.132.21.32`, chạy lại `setup-server.sh` với `--domain staging.ten-mien.vn` (script sửa nginx và `APP_URL`), rồi đặt biến `STAGING_URL` của environment `staging` trên GitHub thành `https://staging.ten-mien.vn`.

Lỗi khác của certbot thường do cổng 80 chưa mở ở tường lửa của nhà cung cấp VPS.

Script tự sinh mọi mật khẩu và khóa trong `/opt/ga-crm/.env` (PostgreSQL, MinIO, `MFA_KEYS_SECRET`, `AI_KEYS_SECRET`, mật khẩu Platform Admin) và đặt các giá trị production: `NODE_ENV=production`, `APP_URL=https://221-132-21-32.sslip.io`, `TRUST_PROXY_HOPS=1`, `MFA_ENFORCE=true`, `DEV_ACCOUNT_SWITCHER=false`. Xem mật khẩu Platform Admin:

```bash
ssh root@221.132.21.32 'grep ^PLATFORM_ADMIN_PASSWORD= /opt/ga-crm/.env'
```

**Sao lưu `.env` ở nơi an toàn.** Mất `MFA_KEYS_SECRET` thì mọi người phải cài lại MFA; mất `AI_KEYS_SECRET` thì khóa AI đã lưu không đọc được.

Tùy chọn, sửa thẳng trong `/opt/ga-crm/.env` rồi deploy lại: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (thiếu thì form lead công khai đóng), `AI_PLATFORM_KEY_*`.

## Bước 3. Secret trên GitHub

Repo > Settings > Environments > New environment `staging`:

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `VPS_HOST` | `221.132.21.32` |
| Secret | `VPS_PORT` | Bỏ qua nếu là 22 |
| Secret | `VPS_USER` | `gacrm` |
| Secret | `VPS_SSH_KEY` | Toàn bộ nội dung `~/.ssh/ga-crm-deploy` (khóa bí mật) |
| Secret | `VPS_KNOWN_HOSTS` | Các dòng script in ra ở bước 2 |
| Variable | `STAGING_URL` | Bỏ qua nếu là `https://221-132-21-32.sslip.io` |

Trong environment `staging`, đặt **Deployment branches and tags** thành "Selected branches" và chỉ thêm `main` (workflow chạy từ `main`). Thiếu bước này, ai có quyền ghi vào repo cũng tạo được một nhánh có workflow dùng environment này và đọc khóa SSH. Nên bật thêm "Required reviewers" để mỗi lần deploy cần người duyệt.

## Bước 4. Deploy

Tab Actions > Promote to staging > Run workflow, chọn nhánh `main`. Sau đó vào https://221-132-21-32.sslip.io, đăng nhập bằng Platform Admin, cài MFA, rồi tạo GA và mời người dùng. Staging chạy ở chế độ production nên không có dữ liệu demo (`npm run seed` từ chối production) và không có bộ đổi tài khoản.

Chạy lại khi `main` không có gì mới vẫn được: bước đồng bộ báo không có gì đổi, rồi build và deploy lại commit `staging` hiện có.

## Vận hành

- Log API (bằng root hoặc người dùng có sudo): `sudo journalctl -u ga-crm-api -f`
- Trạng thái: `systemctl status ga-crm-api`, `docker compose --project-directory /opt/ga-crm ps`
- Quay về bản trước bằng tay (bằng người dùng `gacrm`): `ln -sfn /opt/ga-crm/releases/<bản-cũ> /opt/ga-crm/current && sudo systemctl restart ga-crm-api`. Migration không được hoàn tác; các migration hiện có chỉ thêm nên bản cũ vẫn chạy.
- Sao lưu PostgreSQL: `setup-server.sh` đã đặt cron `/etc/cron.d/ga-crm-backup`, chạy 03:15 mỗi ngày, ghi vào `/opt/ga-crm/backups` (chỉ `gacrm` đọc được), giữ 14 ngày. Bản sao lưu nằm cùng ổ đĩa với dữ liệu, nên cần chép thêm ra ngoài VPS. Khôi phục: `docker exec -i ga-crm-postgres pg_restore -U crm_owner -d ga_crm --clean < file.dump`.

- Sửa nginx sau khi certbot đã thêm HTTPS: sửa thẳng `/etc/nginx/sites-available/ga-crm` (chạy lại `setup-server.sh` không ghi đè file đã có chứng chỉ), rồi `sudo nginx -t && sudo systemctl reload nginx`.
- Chứng chỉ tự gia hạn (`certbot.timer`); kiểm tra: `sudo certbot renew --dry-run`.

## Giới hạn đã biết

- Workflow deploy không tự chạy test; nó dựa vào CI của `main`. Ô bỏ qua khẩn cấp cho phép deploy commit chưa qua test, nên chỉ dùng khi thật cần.
- `gacrm` (người dùng nhận deploy) thuộc nhóm `docker`, tức là có quyền tương đương root trên VPS; cần để deploy bật các container cơ sở dữ liệu. Vì vậy khóa `VPS_SSH_KEY` phải được giữ như khóa root. API chạy bằng `gacrm-api`, không thuộc nhóm này.
- API lắng nghe cổng 4200 trên mọi địa chỉ; tường lửa (ufw, mặc định chặn chiều vào) là thứ giữ cổng này sau nginx. Không tắt ufw và không mở 4200 ở tường lửa của nhà cung cấp.
- Khi vừa deploy, tab đang mở có thể báo lỗi tải một màn hình (file build cũ đã đổi tên); tải lại trang là hết.
- MinIO trong `docker-compose.yml` là bản Bitnami cuối, không còn cập nhật; chỉ nghe `127.0.0.1`. Trước go-live nên chuyển sang S3 thật.
- Web chưa có Content-Security-Policy: `index.html` có script nội tuyến chọn giao diện sáng / tối, cần thêm hash trước khi bật.
