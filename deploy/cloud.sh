#!/usr/bin/env bash
# Đưa AdverTest lên một VPS Ubuntu (22.04/24.04) với link https công khai.
#
# Cách dùng, trên VPS với quyền root:
#   curl -fsSL https://raw.githubusercontent.com/LonelyStar05/advertest3/main/deploy/cloud.sh | bash
#   (có tên miền riêng trỏ về IP của VPS:  ... | DOMAIN=advertest.example.com bash)
#
# Script: tạo swap, cài Docker, clone repo vào /opt/advertest3, chạy deploy/start.sh, rồi dựng
# Caddy làm cổng https trước frontend. Không có DOMAIN thì dùng <ip>.sslip.io (miễn phí, có chứng
# chỉ Let's Encrypt). Chạy lại bao nhiêu lần cũng được: lần sau sẽ git pull và build lại.
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/LonelyStar05/advertest3.git}
APP_DIR=${APP_DIR:-/opt/advertest3}

say() { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Cần chạy bằng root (sudo -i rồi chạy lại)." >&2; exit 1; }

# 1. Swap 4 GB: build PyTorch và chạy worker trên máy 4 GB RAM dễ hết bộ nhớ.
if ! swapon --show | grep -q .; then
  say "Tạo swap 4 GB"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

# 2. Docker và git.
if ! command -v docker >/dev/null; then
  say "Cài Docker"
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }

# 3. Code.
if [ -d "$APP_DIR/.git" ]; then
  say "Cập nhật code"
  git -C "$APP_DIR" pull --ff-only
else
  # Thư mục có thể đã tồn tại vì vừa scp data/ lên trước: clone vào chỗ trống rồi chuyển sang.
  say "Tải code về $APP_DIR"
  mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR.tmp"
  cp -a "$APP_DIR.tmp/." "$APP_DIR/" && rm -rf "$APP_DIR.tmp"
fi
cd "$APP_DIR"

if [ ! -d data/store ]; then
  cat >&2 <<MSG

Chưa có dữ liệu mẫu ($APP_DIR/data/store). Từ máy của bạn (thư mục có data/), chạy:
  scp -r data root@<IP-VPS>:$APP_DIR/
rồi chạy lại script này.
MSG
  exit 1
fi

# 4. Địa chỉ công khai.
if [ -z "${DOMAIN:-}" ]; then
  IP=$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)
  DOMAIN="$(echo "$IP" | tr . -).sslip.io"
fi
say "Địa chỉ công khai: https://$DOMAIN"

# 5. Chạy toàn bộ hệ thống (tạo .env lần đầu).
bash deploy/start.sh

# 6. Cấu hình cho https: cookie Secure và link trong email trỏ về địa chỉ công khai.
set_env() {
  if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else echo "$1=$2" >>.env; fi
}
set_env COOKIE_SECURE true
set_env APP_BASE_URL "https://$DOMAIN"
say "Áp dụng cấu hình https cho API"
docker compose -f docker/compose.yaml -f deploy/compose.local.yaml --env-file .env up -d --wait api frontend

# 7. Caddy: nhận https ở cổng 443, tự xin chứng chỉ, chuyển vào frontend (127.0.0.1:5173).
say "Dựng cổng https (Caddy)"
docker rm -f advertest-caddy >/dev/null 2>&1 || true
docker run -d --name advertest-caddy --restart unless-stopped --network host \
  -v advertest_caddy_data:/data \
  caddy:2 caddy reverse-proxy --from "$DOMAIN" --to 127.0.0.1:5173 --change-host-header >/dev/null

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
fi

ADMIN_EMAIL=$(grep '^ADVERTEST_ADMIN_EMAIL=' .env | cut -d= -f2-)
ADMIN_PASSWORD=$(grep '^ADVERTEST_ADMIN_PASSWORD=' .env | cut -d= -f2-)
cat <<DONE

$(printf '\033[1;32m')AdverTest đã lên cloud.$(printf '\033[0m')

  Web        https://$DOMAIN   (lần đầu chờ ~1 phút để có chứng chỉ https)
  Đăng nhập  $ADMIN_EMAIL  /  $ADMIN_PASSWORD

Cập nhật bản mới:  chạy lại đúng lệnh cài đặt (script tự git pull và build lại).
DONE
