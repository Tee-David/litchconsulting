#!/usr/bin/env bash
# LitchAI — one-shot VM bootstrap for the OCI "Projects" instance.
#
# Rebuilds the whole LitchAI host from a blank Ubuntu 24.04 aarch64 image.
# Idempotent: safe to re-run after a partial failure or to pick up changes.
#
# Layout (mirrors the wlmify "one folder per project" convention):
#   /srv/litch/app       git checkout of the repo (backend + frontend tax config)
#   /srv/litch/venv      Python virtualenv
#   /srv/litch/data      ciphertext store (LITCHAI_STORAGE_DIR)
#   /srv/litch/backups   local pg_dump staging (pushed to R2 nightly)
#   /etc/litch/          doppler.env (service token, 0600) + env (non-secret)
#
# Secrets never live on disk in clear: every unit runs under `doppler run`
# with a READ-ONLY service token scoped to litch-consulting/prd.
#
# Usage (as root):
#   DOPPLER_TOKEN=dp.st.prd.xxx bash bootstrap.sh
set -euo pipefail

APP_USER=litch
ROOT=/srv/litch
REPO=${REPO:-https://github.com/Tee-David/litchconsulting.git}
BRANCH=${BRANCH:-main}
PG_DB=litchai
PG_USER=litchai

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }

# ---------------------------------------------------------------- base system
log "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  git curl ca-certificates gnupg build-essential pkg-config \
  python3 python3-venv python3-dev \
  postgresql postgresql-contrib postgresql-16-pgvector \
  libreoffice-calc-nogui fonts-noto-core fonts-dejavu \
  clamav clamav-daemon \
  rclone jq unattended-upgrades netfilter-persistent iptables-persistent

log "Swap (4 GB) — headroom for docling/LibreOffice peaks"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
echo 'vm.swappiness=10' > /etc/sysctl.d/99-litch.conf

log "Service user + folders"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$ROOT" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$ROOT" "$ROOT/data" "$ROOT/data/.home" "$ROOT/backups" "$ROOT/models"
chmod 0700 "$ROOT/data"
# root-owned, but the litch group must be able to traverse it and read env.
install -d -o root -g "$APP_USER" -m 0750 /etc/litch

# ---------------------------------------------------------------- Doppler CLI
log "Doppler CLI"
if ! command -v doppler >/dev/null; then
  curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' \
    | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" \
    > /etc/apt/sources.list.d/doppler-cli.list
  apt-get update -y && apt-get install -y doppler
fi
if [ -n "${DOPPLER_TOKEN:-}" ]; then
  ( umask 077; printf 'DOPPLER_TOKEN=%s\n' "$DOPPLER_TOKEN" > /etc/litch/doppler.env )
fi
[ -s /etc/litch/doppler.env ] || { echo "Missing /etc/litch/doppler.env — re-run with DOPPLER_TOKEN=..."; exit 1; }
# Always (re)apply: a token placed by hand is root-only, which locks the units out.
chown root:"$APP_USER" /etc/litch/doppler.env && chmod 0640 /etc/litch/doppler.env

# Non-secret, host-local settings (override anything Doppler says for these).
cat > /etc/litch/env <<EOF
LITCHAI_STORAGE_DIR=$ROOT/data
LITCHAI_BACKUP_DIR=$ROOT/backups
LITCHAI_VENV=$ROOT/venv
LITCHAI_TAX_CONFIG=$ROOT/app/frontend/src/lib/tax/nigeria-tax-config.json
LITCHAI_OLLAMA_HOST=http://127.0.0.1:11434
LITCHAI_CLAMAV_HOST=127.0.0.1
LITCHAI_CLAMAV_PORT=3310
LITCHAI_PRIVATE_KEY_PATH=/etc/litch/blind-relay.key
LITCHAI_DATABASE_URL=postgresql://$PG_USER@/$PG_DB?host=/var/run/postgresql
EOF
chmod 0644 /etc/litch/env

# ---------------------------------------------------------------- Postgres
log "Postgres + pgvector + pg_trgm (peer auth over the local socket)"
systemctl enable --now postgresql
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'" | grep -q 1 \
  || sudo -u postgres createuser "$PG_USER"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" | grep -q 1 \
  || sudo -u postgres createdb -O "$PG_USER" "$PG_DB"
sudo -u postgres psql -d "$PG_DB" -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
# Map OS user litch -> db role litchai for peer auth.
PGV=$(ls /etc/postgresql | sort -V | tail -1)
IDENT=/etc/postgresql/$PGV/main/pg_ident.conf
HBA=/etc/postgresql/$PGV/main/pg_hba.conf
grep -q '^litchmap' "$IDENT" || echo "litchmap $APP_USER $PG_USER" >> "$IDENT"
# First matching line wins in pg_hba, so prepend ours.
grep -q "map=litchmap" "$HBA" || sed -i "1i local   $PG_DB   $PG_USER   peer map=litchmap" "$HBA"
# Small box: keep Postgres modest.
cat > /etc/postgresql/$PGV/main/conf.d/litch.conf <<'EOF'
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
listen_addresses = 'localhost'
EOF
systemctl restart postgresql

# ---------------------------------------------------------------- ClamAV
log "ClamAV daemon (loopback TCP 3310)"
sed -i 's/^#\?TCPSocket .*/TCPSocket 3310/; s/^#\?TCPAddr .*/TCPAddr 127.0.0.1/' /etc/clamav/clamd.conf
grep -q '^TCPSocket' /etc/clamav/clamd.conf || printf 'TCPSocket 3310\nTCPAddr 127.0.0.1\n' >> /etc/clamav/clamd.conf
systemctl stop clamav-freshclam || true
freshclam || true
systemctl enable --now clamav-freshclam clamav-daemon

# ---------------------------------------------------------------- Ollama
# Interim local inference (the current backend speaks Ollama's API for both
# the categoriser and embeddings). Phase 3 benchmarks llama-server against it.
log "Ollama (loopback only, one request at a time)"
command -v ollama >/dev/null || curl -fsSL https://ollama.com/install.sh | sh
install -d /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/litch.conf <<'EOF'
[Service]
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_MAX_LOADED_MODELS=2
Environment=OLLAMA_KEEP_ALIVE=30m
CPUQuota=180%
MemoryHigh=5G
MemoryMax=6G
EOF
systemctl daemon-reload && systemctl enable --now ollama && systemctl restart ollama
sleep 3
ollama pull nomic-embed-text
ollama pull "${LITCHAI_LOCAL_MODEL:-gemma3:4b}"

# ---------------------------------------------------------------- cloudflared
log "cloudflared"
if ! command -v cloudflared >/dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
  dpkg -i /tmp/cloudflared.deb
fi

# ---------------------------------------------------------------- app
log "App checkout + virtualenv"
if [ -d "$ROOT/app/.git" ]; then
  sudo -u "$APP_USER" git -C "$ROOT/app" fetch --depth 1 origin "$BRANCH"
  sudo -u "$APP_USER" git -C "$ROOT/app" reset --hard "origin/$BRANCH"
else
  sudo -u "$APP_USER" git clone --depth 1 --branch "$BRANCH" "$REPO" "$ROOT/app"
fi
[ -x "$ROOT/venv/bin/python" ] || sudo -u "$APP_USER" python3 -m venv "$ROOT/venv"
sudo -u "$APP_USER" "$ROOT/venv/bin/pip" install --upgrade pip wheel
# CPU-only PyTorch FIRST: docling otherwise pulls the CUDA build — several GB of
# nvidia-* wheels that can never run on this GPU-less ARM box.
# pip treats an installed CUDA torch of the same version as "satisfied", so a
# plain install never swaps it: force the +cpu build whenever it isn't already.
if ! sudo -u "$APP_USER" "$ROOT/venv/bin/python" -c "import torch,sys; sys.exit(0 if '+cpu' in torch.__version__ else 1)" 2>/dev/null; then
  sudo -u "$APP_USER" "$ROOT/venv/bin/pip" install --force-reinstall --no-deps torch torchvision \
    --index-url https://download.pytorch.org/whl/cpu
fi
sudo -u "$APP_USER" "$ROOT/venv/bin/pip" install -e "$ROOT/app/backend[vm]"
# Drop any CUDA wheels a previous run left behind (safe now torch is +cpu).
sudo -u "$APP_USER" "$ROOT/venv/bin/pip" freeze | grep -iE '^(nvidia-|cuda-|triton)' | cut -d= -f1 \
  | xargs -r sudo -u "$APP_USER" "$ROOT/venv/bin/pip" uninstall -y || true
sudo -u "$APP_USER" "$ROOT/venv/bin/python" -c "import torch, docling; print('torch', torch.__version__)"

log "systemd units"
install -m 0644 "$ROOT"/app/backend/deploy/*.service "$ROOT"/app/backend/deploy/*.timer /etc/systemd/system/
install -m 0755 "$ROOT/app/backend/deploy/backup.sh" /usr/local/bin/litchai-backup
install -m 0755 "$ROOT/app/backend/deploy/litch-run" /usr/local/bin/litch-run
systemctl daemon-reload
systemctl enable --now litchai-api litchai-worker litch-cloudflared litchai-backup.timer litchai-heartbeat.timer

# ---------------------------------------------------------------- firewall
log "Firewall: SSH only inbound (the tunnel is outbound)"
netfilter-persistent save || true

log "Done. Next: blind-relay key, cloudflared tunnel token, schema migrate, knowledge reindex (see RUNBOOK.md)."
