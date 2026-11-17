# Triển khai staging lên VPS Ubuntu 24.04

Staging chạy ở **https://221-132-21-32.sslip.io** trên VPS `221.132.21.32` (Ubuntu 24.04 LTS x64). `221-132-21-32.sslip.io` là tên miễn phí luôn trỏ về IP này, nên không cần tạo bản ghi DNS. App bắt buộc chạy HTTPS vì ở production cookie đăng nhập có cờ Secure.

## Thư mục này

| File | Việc |
|---|---|
| `setup-server.sh` | Chạy **một lần** bằng root trên VPS mới: cài gói, Node 26, Docker, hai người dùng (`gacrm` nhận deploy, `gacrm-api` chạy API), quyền sudo hẹp, thư mục `/opt/ga-crm`, file `.env`, systemd, nginx, tường lửa, sao lưu hằng ngày, chứng chỉ HTTPS. Chạy lại an toàn |
| `remote-deploy.sh` | GitHub Actions chạy mỗi lần deploy: giải nén bản mới, cài package, bật PostgreSQL/Valkey/MinIO, migration, chuyển `current`, khởi động lại API, health check, tự quay về bản trước nếu hỏng |
| `systemd/ga-crm-api.service` | Dịch vụ chạy API bằng người dùng `gacrm-api` (không thuộc nhóm `docker`), có sandbox |
| `nginx/ga-crm.conf.template` | Site nginx: file tĩnh của web, `/api` và `/socket.io` chuyển vào API, nén gzip, cache file build 1 năm |
| `nginx/ga-crm-headers.conf` | Header bảo mật cho file tĩnh (HSTS, nosniff, chặn nhúng iframe, no-referrer) |
| `../.github/workflows/deploy-staging.yml` | Workflow: typecheck, lint, unit test, test tích hợp (PostgreSQL, Valkey, MinIO trong CI), build, gửi gói lên VPS, gọi `remote-deploy.sh`, rồi kiểm tra địa chỉ công khai |

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

Chép các file cần thiết từ nhánh `staging` lên VPS, kèm khóa công khai (chạy trên máy bạn, trong thư mục repo):

```bash
git archive origin/staging deploy docker-compose.yml infra .env.example scripts/setup-env.mjs | ssh root@221.132.21.32 'rm -rf /root/ga-crm-setup && mkdir -p /root/ga-crm-setup && tar -x -C /root/ga-crm-setup'
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

Trong environment `staging`, đặt **Deployment branches and tags** thành "Selected branches" và chỉ thêm `staging`. Thiếu bước này, ai có quyền ghi vào repo cũng tạo được một nhánh có workflow dùng environment này và đọc khóa SSH. Nên bật thêm "Required reviewers" để mỗi lần deploy cần người duyệt.

## Bước 4. Deploy

Push nhánh `staging`. Muốn chạy lại mà không có commit mới: tab Actions > mở lần chạy gần nhất > Re-run all jobs (nút "Run workflow" chỉ hiện khi file workflow có trên nhánh mặc định `main`). Sau đó vào https://221-132-21-32.sslip.io, đăng nhập bằng Platform Admin, cài MFA, rồi tạo GA và mời người dùng. Staging chạy ở chế độ production nên không có dữ liệu demo (`npm run seed` từ chối production) và không có bộ đổi tài khoản.

Đưa thay đổi mới từ `main` sang `staging` (lệnh này cũng xóa file đã bị xóa trên `main`):

```bash
git switch staging && git restore --source=main --staged --worktree -- backend frontend docker-compose.yml infra .env.example scripts/setup-env.mjs && git commit -m "Sync staging with main" && git push
```

## Vận hành

- Log API (bằng root hoặc người dùng có sudo): `sudo journalctl -u ga-crm-api -f`
- Trạng thái: `systemctl status ga-crm-api`, `docker compose --project-directory /opt/ga-crm ps`
- Quay về bản trước bằng tay (bằng người dùng `gacrm`): `ln -sfn /opt/ga-crm/releases/<bản-cũ> /opt/ga-crm/current && sudo systemctl restart ga-crm-api`. Migration không được hoàn tác; các migration hiện có chỉ thêm nên bản cũ vẫn chạy.
- Sao lưu PostgreSQL: `setup-server.sh` đã đặt cron `/etc/cron.d/ga-crm-backup`, chạy 03:15 mỗi ngày, ghi vào `/opt/ga-crm/backups` (chỉ `gacrm` đọc được), giữ 14 ngày. Bản sao lưu nằm cùng ổ đĩa với dữ liệu, nên cần chép thêm ra ngoài VPS. Khôi phục: `docker exec -i ga-crm-postgres pg_restore -U crm_owner -d ga_crm --clean < file.dump`.

- Sửa nginx sau khi certbot đã thêm HTTPS: sửa thẳng `/etc/nginx/sites-available/ga-crm` (chạy lại `setup-server.sh` không ghi đè file đã có chứng chỉ), rồi `sudo nginx -t && sudo systemctl reload nginx`.
- Chứng chỉ tự gia hạn (`certbot.timer`); kiểm tra: `sudo certbot renew --dry-run`.

## Giới hạn đã biết

- `gacrm` (người dùng nhận deploy) thuộc nhóm `docker`, tức là có quyền tương đương root trên VPS; cần để deploy bật các container cơ sở dữ liệu. Vì vậy khóa `VPS_SSH_KEY` phải được giữ như khóa root. API chạy bằng `gacrm-api`, không thuộc nhóm này.
- API lắng nghe cổng 4200 trên mọi địa chỉ; tường lửa (ufw, mặc định chặn chiều vào) là thứ giữ cổng này sau nginx. Không tắt ufw và không mở 4200 ở tường lửa của nhà cung cấp.
- Khi vừa deploy, tab đang mở có thể báo lỗi tải một màn hình (file build cũ đã đổi tên); tải lại trang là hết.
- MinIO trong `docker-compose.yml` là bản Bitnami cuối, không còn cập nhật; chỉ nghe `127.0.0.1`. Trước go-live nên chuyển sang S3 thật.
- Web chưa có Content-Security-Policy: `index.html` có script nội tuyến chọn giao diện sáng / tối, cần thêm hash trước khi bật.
