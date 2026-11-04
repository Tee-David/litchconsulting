#!/usr/bin/env bash
# Nightly pg_dump → Cloudflare R2 vault push + retention prune (Phase 6).
# Driven by litchai-backup.timer. Env via litch-run (Doppler + /etc/litch/env):
#   LITCHAI_DATABASE_URL, R2_BUCKET  (rclone remote "r2:" preconfigured).
set -euo pipefail

: "${LITCHAI_DATABASE_URL:?LITCHAI_DATABASE_URL not set}"
# DB dumps go to the PRIVATE bucket (never the public assets one).
R2_BUCKET="${R2_BUCKET:-${R2_PRIVATE_BUCKET:-}}"
: "${R2_BUCKET:?R2_BUCKET / R2_PRIVATE_BUCKET not set}"

# rclone "r2:" remote built from the Litch-scoped R2 keys at runtime — no
# rclone.conf on disk holding credentials.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-${R2_ACCESS_KEY:?R2 access key not set}}"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-${R2_SECRET_KEY:?R2 secret key not set}}"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID:?R2_ACCOUNT_ID not set}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

BACKUP_DIR="${LITCHAI_BACKUP_DIR:-/srv/projects/litchconsulting/backups}"
STAMP="$(date -u +%Y-%m-%d)"
DUMP="${BACKUP_DIR}/litchai-${STAMP}.dump"
VENV="${LITCHAI_VENV:-/srv/projects/litchconsulting/venv}"

mkdir -p "$BACKUP_DIR"

# Custom format = compressed + parallel-restorable. Disk is OCI-encrypted at rest.
pg_dump --format=custom --no-owner --no-privileges "$LITCHAI_DATABASE_URL" > "$DUMP"

# Push to R2 (already-encrypted disk; R2 bucket is private).
rclone copyto "$DUMP" "r2:${R2_BUCKET}/litchai/$(basename "$DUMP")"

# Prune old local dumps by the tested grandfather-father-son policy, then mirror
# the survivors to R2 so remote retention matches local.
"${VENV}/bin/python" - "$BACKUP_DIR" <<'PY'
import sys
from datetime import date
from pathlib import Path
from litchai.ops.backup import select_for_deletion

backup_dir = Path(sys.argv[1])
dumps = {}
for p in backup_dir.glob("litchai-*.dump"):
    try:
        dumps[date.fromisoformat(p.stem.removeprefix("litchai-"))] = p
    except ValueError:
        continue
for d in select_for_deletion(list(dumps), date.today()):
    dumps[d].unlink()
    print(f"pruned {dumps[d].name}")
PY

rclone sync "$BACKUP_DIR" "r2:${R2_BUCKET}/litchai/" --include "litchai-*.dump"
echo "litchai backup ${STAMP} complete"
