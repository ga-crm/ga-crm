# Triển khai staging lên VPS Ubuntu

Mỗi lần push lên nhánh `staging`, GitHub Actions (`.github/workflows/deploy-staging.yml`) kiểm tra và build, rồi gửi một gói lên VPS. Trên VPS, `deploy/remote-deploy.sh` giải nén gói, chạy migration, chuyển sang bản mới và khởi động lại API. Nếu API không trả lời health check, nó tự quay về bản trước.

Các bước dưới đây chỉ làm **một lần** khi dựng VPS. Viết cho Ubuntu 24.04 LTS x64 (máy chạy GitHub Actions cũng là `ubuntu-24.04`).

## Cần có trước

| Thứ | Ghi chú |
|---|---|
| VPS Ubuntu | Tối thiểu 2 vCPU, 4 GB RAM, 40 GB ổ. Việc build chạy trên GitHub nên VPS không cần mạnh |
| Tên miền | Staging dùng `221-132-21-32.sslip.io`: tên miễn phí, luôn trỏ về IP `221.132.21.32`, không cần tạo bản ghi DNS. Khi có tên miền riêng, tạo bản ghi A trỏ về IP này rồi thay tên ở nginx, certbot và `APP_URL`. **Bắt buộc có HTTPS**: ở production cookie đăng nhập có cờ Secure nên chạy bằng IP hoặc HTTP thì không đăng nhập được |
| Email | Để Let's Encrypt báo khi chứng chỉ sắp hết hạn |
| Email Platform Admin | Tài khoản quản trị nền tảng đầu tiên trên staging |
| Quyền repo GitHub | Thêm environment `staging` và secret |

## 1. Gói hệ thống

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx curl ca-certificates gnupg ufw certbot python3-certbot-nginx
```

Node.js 26 (NodeSource):

```bash
curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
```

```bash
sudo apt -y install nodejs
```

Docker và Compose v2 theo hướng dẫn chính thức: https://docs.docker.com/engine/install/ubuntu/

## 2. Tường lửa

API lắng nghe trên mọi địa chỉ ở cổng 4200, nên chỉ mở SSH, HTTP và HTTPS. PostgreSQL, Valkey và MinIO đã chỉ nghe `127.0.0.1`.

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

Lưu ý: Docker có thể vượt qua ufw với cổng publish ra `0.0.0.0`; `docker-compose.yml` của dự án chỉ publish ra `127.0.0.1` nên không bị ảnh hưởng.

## 3. Người dùng `gacrm`

Người dùng này vừa nhận deploy từ GitHub vừa chạy API.

```bash
sudo adduser --disabled-password --gecos "" gacrm && sudo usermod -aG docker gacrm
```

```bash
sudo mkdir -p /opt/ga-crm/releases /opt/ga-crm/incoming && sudo chown -R gacrm:gacrm /opt/ga-crm
```

Cho phép `gacrm` khởi động lại API và đọc log của nó, không gì khác:

```bash
echo 'gacrm ALL=(root) NOPASSWD: /usr/bin/systemctl restart ga-crm-api, /usr/bin/journalctl -u ga-crm-api *' | sudo tee /etc/sudoers.d/ga-crm && sudo chmod 440 /etc/sudoers.d/ga-crm
```

Khóa SSH cho GitHub Actions: tạo một cặp khóa riêng (trên máy bạn), đưa khóa công khai vào `/home/gacrm/.ssh/authorized_keys`, khóa bí mật vào secret `VPS_SSH_KEY` (bước 7).

```bash
ssh-keygen -t ed25519 -C "github-deploy-staging" -f ./ga-crm-deploy -N ""
```

## 4. File `.env` trên VPS

Push lần đầu sẽ dừng ở bước kiểm tra `.env` (đúng như mong đợi), nhưng đã chép sẵn `.env.example` và `scripts/setup-env.mjs` vào `/opt/ga-crm`. Chạy với quyền `gacrm`:

```bash
cd /opt/ga-crm && node scripts/setup-env.mjs && chmod 600 .env
```

Rồi sửa `.env` (các dòng còn lại để nguyên giá trị đã sinh):

| Biến | Giá trị trên staging |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | `https://221-132-21-32.sslip.io` (không có `/` ở cuối) |
| `TRUST_PROXY_HOPS` | `1` (nginx đứng trước API) |
| `PLATFORM_ADMIN_EMAIL` | email Platform Admin; mật khẩu là `PLATFORM_ADMIN_PASSWORD` vừa sinh trong file |
| `MFA_ENFORCE` | `true` (API từ chối `false` ở production) |
| `DEV_ACCOUNT_SWITCHER` | `false` (API từ chối `true` ở production) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Để trống thì form lead công khai đóng; điền khóa Cloudflare Turnstile để mở |
| `AI_PLATFORM_KEY_*` | Tùy chọn |

Giữ một bản sao `.env` ở nơi an toàn: mất `MFA_KEYS_SECRET` thì mọi người phải cài lại MFA, mất `AI_KEYS_SECRET` thì khóa AI đã lưu không đọc được.

Staging chạy ở chế độ production nên **không có dữ liệu demo** (`npm run seed` từ chối production). Đăng nhập bằng Platform Admin, cài MFA, rồi tạo GA và mời người dùng từ màn hình quản trị nền tảng.

## 5. Dịch vụ systemd của API

Sau khi push lần đầu đã có `/opt/ga-crm/current/deploy/ga-crm-api.service` (nếu chưa có `current`, lấy file trong `/opt/ga-crm/releases/<sha>/deploy/`).

```bash
sudo cp /opt/ga-crm/releases/*/deploy/ga-crm-api.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable ga-crm-api
```

## 6. nginx và HTTPS

```bash
sudo cp /opt/ga-crm/releases/*/deploy/nginx-ga-crm.conf /etc/nginx/sites-available/ga-crm
```

File đã có sẵn `server_name 221-132-21-32.sslip.io;`. Bật site và lấy chứng chỉ:

```bash
sudo ln -sfn /etc/nginx/sites-available/ga-crm /etc/nginx/sites-enabled/ga-crm && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo certbot --nginx -d 221-132-21-32.sslip.io --redirect -m email@cua-ban.vn --agree-tos -n
```

## 7. Secret trên GitHub

Repo > Settings > Environments > New environment `staging` > Add secret:

| Secret | Giá trị |
|---|---|
| `VPS_HOST` | `221.132.21.32` |
| `VPS_PORT` | Cổng SSH (bỏ qua nếu là 22) |
| `VPS_USER` | `gacrm` |
| `VPS_SSH_KEY` | Nội dung file `ga-crm-deploy` (khóa bí mật ở bước 3) |
| `VPS_KNOWN_HOSTS` | Kết quả của lệnh dưới, chạy trên máy bạn |

```bash
ssh-keyscan -p 22 221.132.21.32
```

Có thể bật "Required reviewers" cho environment này để mỗi lần deploy cần người duyệt.

## 8. Deploy

Push nhánh `staging`, hoặc vào tab Actions > Deploy staging > Run workflow. Lần đầu: push, sửa `.env` (bước 4), cài systemd và nginx (bước 5, 6), rồi chạy lại workflow.

Đưa thay đổi mới từ `main` sang `staging` (nhánh này không có `docs/`, `requirement/`, `.claude/`; lệnh này cũng xóa file đã bị xóa trên `main`):

```bash
git switch staging && git restore --source=main --staged --worktree -- backend frontend docker-compose.yml infra .env.example scripts/setup-env.mjs && git commit -m "Sync staging with main" && git push
```

## Vận hành

- Log API: `sudo journalctl -u ga-crm-api -f`
- Quay về bản trước bằng tay: `ln -sfn /opt/ga-crm/releases/<sha-cũ> /opt/ga-crm/current && sudo systemctl restart ga-crm-api`. Migration không được hoàn tác; mọi migration hiện có chỉ thêm, nên bản cũ vẫn chạy.
- Sao lưu PostgreSQL (nên đặt cron hằng ngày):

```bash
docker exec ga-crm-postgres pg_dump -U crm_owner -Fc ga_crm > /opt/ga-crm/backup-$(date +%F).dump
```

- MinIO trong `docker-compose.yml` là bản Bitnami cuối, không còn cập nhật và không được mở ra Internet. Trước go-live nên chuyển sang S3 thật (`S3_ENDPOINT` để trống, đặt `S3_REGION`, `S3_BUCKET`, khóa truy cập).
