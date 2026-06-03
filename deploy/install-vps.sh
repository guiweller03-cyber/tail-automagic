#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/mundo-pet}"
REPO_URL="${REPO_URL:-https://github.com/guiweller03-cyber/tail-automagic.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-22}"
PORT="${PORT:-3001}"
AUTOMACAO_DOMAIN="${AUTOMACAO_DOMAIN:?Informe AUTOMACAO_DOMAIN, ex: 123.123.123.123.sslip.io}"
ACME_EMAIL="${ACME_EMAIL:?Informe ACME_EMAIL para certificado SSL}"

if [[ $EUID -ne 0 ]]; then
  echo "Rode como root: sudo -E bash deploy/install-vps.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gettext-base gnupg git ufw

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

mkdir -p "$(dirname "$APP_DIR")"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi

cd "$APP_DIR"
npm ci
npm run build

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  cat >>"$APP_DIR/.env" <<ENV

# Preencha estes valores antes de usar em producao:
PORT=$PORT
MP_WEBHOOK_URL=https://$AUTOMACAO_DOMAIN/webhooks/mercadopago
UAZAPI_WEBHOOK_URL=https://$AUTOMACAO_DOMAIN/webhooks/whatsapp
ENV
  echo "Arquivo .env criado em $APP_DIR/.env. Preencha os segredos e rode este script novamente."
  exit 1
fi

PORT="$PORT" pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/pm2-startup.txt || true
bash /tmp/pm2-startup.txt || true

install -d /etc/caddy
AUTOMACAO_DOMAIN="$AUTOMACAO_DOMAIN" ACME_EMAIL="$ACME_EMAIL" envsubst \
  <"$APP_DIR/deploy/Caddyfile" >/etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true

echo "Deploy concluido."
echo "Healthcheck: https://$AUTOMACAO_DOMAIN/health"
echo "WhatsApp:    https://$AUTOMACAO_DOMAIN/webhooks/whatsapp"
echo "MercadoPago: https://$AUTOMACAO_DOMAIN/webhooks/mercadopago"
