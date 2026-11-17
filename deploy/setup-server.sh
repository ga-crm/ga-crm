#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 LTS x64 VPS for GA CRM (deploy/README.md). Run as root
# from the folder `git archive` unpacked (it needs deploy/, docker-compose.yml, infra/,
# .env.example and scripts/setup-env.mjs). Safe to run again: each step checks what is there.
#
#   bash deploy/setup-server.sh --domain 221-132-21-32.sslip.io --email you@example.com \
#     --admin-email you@example.com --deploy-key-file ./ga-crm-deploy.pub
set -euo pipefail

APP_DIR=/opt/ga-crm
# Two users: gacrm receives deploys (SSH, docker group); gacrm-api only runs the API. The docker
# group equals root on the host, so the internet-facing process must not hold it.
APP_USER=gacrm
RUN_USER=gacrm-api
NODE_MAJOR=26
SSH_PORT=22
DOMAIN=""
EMAIL=""
ADMIN_EMAIL=""
DEPLOY_KEY_FILE=""
WITH_TLS=1

usage() {
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Options:
  --domain NAME            public name of the server (required)
  --email ADDRESS          Let's Encrypt account (required unless --no-tls)
  --admin-email ADDRESS    first Platform Admin of the app (required on the first run)
  --deploy-key-file FILE   public SSH key that GitHub Actions signs in with (required)
  --ssh-port PORT          SSH port to keep open in the firewall (default 22)
  --no-tls                 skip certbot, for when the name does not point here yet
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --deploy-key-file) DEPLOY_KEY_FILE="${2:-}"; shift 2 ;;
    --ssh-port) SSH_PORT="${2:-}"; shift 2 ;;
    --no-tls) WITH_TLS=0; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nSETUP FAILED: %s\n' "$*" >&2; exit 1; }

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[[ $EUID -eq 0 ]] || fail "run as root (sudo bash deploy/setup-server.sh ...)"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail "--domain is required (letters, digits, dots, hyphens)"
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] || fail "--ssh-port must be a number"
[[ $WITH_TLS -eq 0 || "$EMAIL" == *@* ]] || fail "--email is required for the certificate (or pass --no-tls)"
[[ -f "$DEPLOY_KEY_FILE" ]] || fail "--deploy-key-file must point at the public key (.pub)"
grep -qE '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[a-z0-9-]+) ' "$DEPLOY_KEY_FILE" ||
  fail "$DEPLOY_KEY_FILE is not an OpenSSH public key; pass the .pub file, never the private key"
for file in deploy/remote-deploy.sh deploy/systemd/ga-crm-api.service deploy/nginx/ga-crm.conf.template \
  deploy/nginx/ga-crm-headers.conf docker-compose.yml infra/postgres/init/01-roles.sh .env.example \
  scripts/setup-env.mjs; do
  [[ -f "$SRC/$file" ]] || fail "missing $file next to this script; unpack the archive from deploy/README.md"
done

# shellcheck source=/dev/null
. /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]] ||
  echo "Warning: written for Ubuntu 24.04, this is ${PRETTY_NAME:-unknown}." >&2

export DEBIAN_FRONTEND=noninteractive

log "System packages"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg nginx certbot python3-certbot-nginx ufw

log "Node.js $NODE_MAJOR"
if [[ "$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')" != "$NODE_MAJOR" ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -y -q nodejs
fi
node -v

log "Docker Engine and Compose"
if ! docker compose version >/dev/null 2>&1; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker compose version

log "User $APP_USER"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$APP_USER"
fi
# Docker group = root on this machine; the deploy needs it to start the database containers
usermod -aG docker "$APP_USER"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "$APP_HOME/.ssh"
KEY="$(head -n1 "$DEPLOY_KEY_FILE")"
touch "$APP_HOME/.ssh/authorized_keys"
# `restrict`: no forwarding, no agent, no pty; commands and scp still work
grep -qF "$KEY" "$APP_HOME/.ssh/authorized_keys" || echo "restrict $KEY" >>"$APP_HOME/.ssh/authorized_keys"
chown "$APP_USER:$APP_USER" "$APP_HOME/.ssh/authorized_keys"
chmod 600 "$APP_HOME/.ssh/authorized_keys"

log "User $RUN_USER (runs the API)"
if ! id "$RUN_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$RUN_USER"
fi
# Group gacrm only, to read .env (0640); never docker
usermod -G "$APP_USER" "$RUN_USER"

# Restart the API and read the end of its log, in exactly the form remote-deploy.sh uses: the only
# root rights the deploy gets. No wildcard, so no other journalctl option (other units, --vacuum).
SUDOERS=/etc/sudoers.d/ga-crm
cat >"$SUDOERS.tmp" <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart ga-crm-api, /usr/bin/journalctl -u ga-crm-api -n 40 --no-pager
EOF
visudo -cf "$SUDOERS.tmp" >/dev/null || fail "sudoers rule did not validate"
install -m 0440 "$SUDOERS.tmp" "$SUDOERS"
rm -f "$SUDOERS.tmp"

log "Folders under $APP_DIR"
# 0755: nginx (www-data) reads the web app under current/frontend/dist
install -d -m 0755 -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$APP_DIR/releases" "$APP_DIR/scripts" "$APP_DIR/infra"
install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/incoming" "$APP_DIR/backups"

log "Daily database backup (03:15, kept 14 days, readable by gacrm only)"
cat >/etc/cron.d/ga-crm-backup <<EOF
# Copy these files off the server too: a backup on the same disk does not survive losing it
15 3 * * * $APP_USER umask 077 && docker exec ga-crm-postgres pg_dump -U crm_owner -Fc ga_crm > $APP_DIR/backups/ga_crm-\$(date +\%F).dump && find $APP_DIR/backups -name 'ga_crm-*.dump' -mtime +14 -delete
EOF
chmod 0644 /etc/cron.d/ga-crm-backup
install -m 0644 -o "$APP_USER" -g "$APP_USER" "$SRC/docker-compose.yml" "$SRC/.env.example" "$APP_DIR/"
install -m 0644 -o "$APP_USER" -g "$APP_USER" "$SRC/scripts/setup-env.mjs" "$APP_DIR/scripts/"
cp -R "$SRC/infra/." "$APP_DIR/infra/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/infra"
chmod 0755 "$APP_DIR/infra/postgres/init/"*.sh

log "Configuration ($APP_DIR/.env)"
ENV_FILE="$APP_DIR/.env"
set_env() {
  local key="$1" value="$2"
  if grep -qE "^$key=" "$ENV_FILE"; then
    sed -i -E "s|^$key=.*|$key=$value|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}
if [[ ! -f "$ENV_FILE" ]]; then
  [[ "$ADMIN_EMAIL" == *@* ]] || fail "--admin-email is required the first time"
  # Every __GENERATE__ value (database, MinIO and admin passwords, MFA and AI keys) becomes random
  (cd "$APP_DIR" && runuser -u "$APP_USER" -- node scripts/setup-env.mjs)
  set_env PLATFORM_ADMIN_EMAIL "$ADMIN_EMAIL"
  CREATED_ENV=1
else
  echo "$ENV_FILE exists; only the production settings below are checked."
  CREATED_ENV=0
  [[ -z "$ADMIN_EMAIL" ]] || set_env PLATFORM_ADMIN_EMAIL "$ADMIN_EMAIL"
fi
set_env NODE_ENV production
set_env APP_URL "https://$DOMAIN"
set_env TRUST_PROXY_HOPS 1
set_env MFA_ENFORCE true
set_env DEV_ACCOUNT_SWITCHER false
chown "$APP_USER:$APP_USER" "$ENV_FILE"
# Owner gacrm writes it, group gacrm (which gacrm-api is in) reads it, nobody else
chmod 640 "$ENV_FILE"

log "systemd unit ga-crm-api"
install -m 0644 "$SRC/deploy/systemd/ga-crm-api.service" /etc/systemd/system/ga-crm-api.service
systemctl daemon-reload
# Enabled for boot; the first deploy starts it, once there is a release to run
systemctl enable ga-crm-api

log "nginx site $DOMAIN"
install -m 0644 "$SRC/deploy/nginx/ga-crm-headers.conf" /etc/nginx/snippets/ga-crm-headers.conf
SITE=/etc/nginx/sites-available/ga-crm
if [[ -f "$SITE" ]] && grep -q 'managed by Certbot' "$SITE"; then
  # certbot has edited the site; writing it again would drop HTTPS
  echo "$SITE already holds the certificate; left as it is."
else
  sed "s/__DOMAIN__/$DOMAIN/g" "$SRC/deploy/nginx/ga-crm.conf.template" >"$SITE"
fi
ln -sfn "$SITE" /etc/nginx/sites-enabled/ga-crm
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "Firewall"
# PostgreSQL, Valkey and MinIO publish on 127.0.0.1 only. The API listens on every interface, so
# this rule is what keeps port 4200 behind nginx: reached directly, a client could fake its IP
# through X-Forwarded-For (TRUST_PROXY_HOPS=1).
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT/tcp"
ufw allow 'Nginx Full'
ufw --force enable
ufw status

if [[ $WITH_TLS -eq 1 ]]; then
  log "HTTPS certificate for $DOMAIN"
  certbot --nginx -d "$DOMAIN" --redirect -m "$EMAIL" --agree-tos -n --keep-until-expiring
fi

log "Done. For GitHub (Settings > Environments > staging > secrets):"
# The address the server goes out with; on this VPS the public one sits on the interface
IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
IP="${IP:-$(hostname -I | awk '{print $1}')}"
HOST_KEY_PREFIX="$IP"
[[ "$SSH_PORT" == 22 ]] || HOST_KEY_PREFIX="[$IP]:$SSH_PORT"
echo "  VPS_HOST         $IP"
echo "  VPS_PORT         $SSH_PORT"
echo "  VPS_USER         $APP_USER"
echo "  VPS_SSH_KEY      the private key that goes with $DEPLOY_KEY_FILE"
echo "  VPS_KNOWN_HOSTS  these lines (this server's own host keys):"
for pub in /etc/ssh/ssh_host_*_key.pub; do
  echo "$HOST_KEY_PREFIX $(cut -d' ' -f1,2 "$pub")"
done
if [[ $CREATED_ENV -eq 1 ]]; then
  echo
  echo "Platform Admin: $ADMIN_EMAIL; its password is PLATFORM_ADMIN_PASSWORD in $ENV_FILE"
  echo "Keep a copy of $ENV_FILE somewhere safe: losing MFA_KEYS_SECRET or AI_KEYS_SECRET cannot be undone."
fi
