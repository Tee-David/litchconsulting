#!/usr/bin/env bash
# Build llama.cpp natively on the VM, fetch a GGUF model and install the
# litchai-llama.service unit (llama-server on 127.0.0.1:8081). Idempotent:
# re-run to rebuild at a new ref or to swap the model.
#
#   sudo MODEL_URL=https://huggingface.co/<org>/<repo>/resolve/main/<file>.gguf \
#        MODEL_SHA256=<sha256 from the model card> \
#        bash backend/deploy/install-llama.sh
#
# Variables (all optional except MODEL_URL on a first install):
#   LLAMA_CPP_REF   git tag/commit of ggml-org/llama.cpp to build (default: master;
#                   pin a release tag such as b6xxx once benched — the built commit is
#                   written to llama.cpp/BUILT_COMMIT either way)
#   MODEL_URL       direct .gguf download URL (Hugging Face "resolve" link)
#   MODEL_SHA256    expected sha256 of the .gguf (strongly recommended)
#   LLAMA_ALIAS     model name the API reports and LITCHAI_LOCAL_MODEL must match
#                   (default: the .gguf file name without extension, lower-cased)
#   LLAMA_CTX       context window (default 8192; a workbench turn with tool results reaches 4-6k)
#   LLAMA_THREADS   threads (default 2 = the box's OCPUs)
#   LLAMA_PORT      default 8081
#
# After it passes the health check, switch the API over (or keep Ollama and
# compare first with `python -m litchai.ops.llm_bench`):
#   echo 'LITCHAI_LLAMA_SERVER_URL=http://127.0.0.1:8081' >> /etc/litch/env
#   echo "LITCHAI_LOCAL_MODEL=<alias>"                    >> /etc/litch/env
#   systemctl restart litchai-api litchai-worker
set -euo pipefail

ROOT=/srv/projects/litchconsulting
APP_USER=litch
SRC="$ROOT/llama.cpp"
MODELS="$ROOT/models"
ENV_FILE=/etc/litch/llama.env
UNIT_SRC="$(cd "$(dirname "$0")" && pwd)/litchai-llama.service"
REF="${LLAMA_CPP_REF:-master}"
PORT="${LLAMA_PORT:-8081}"
CTX="${LLAMA_CTX:-8192}"
THREADS="${LLAMA_THREADS:-2}"

log() { printf '\n== %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)"; exit 1; }

log "Build tools"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq build-essential cmake git curl ca-certificates libcurl4-openssl-dev >/dev/null

log "llama.cpp @ $REF"
if [ ! -d "$SRC/.git" ]; then
  sudo -u "$APP_USER" git clone --quiet https://github.com/ggml-org/llama.cpp "$SRC"
fi
sudo -u "$APP_USER" git -C "$SRC" fetch --quiet --tags origin
sudo -u "$APP_USER" git -C "$SRC" checkout --quiet "$REF"
if [ "$REF" = "master" ]; then sudo -u "$APP_USER" git -C "$SRC" pull --quiet --ff-only origin master; fi
# Native ARM build (NEON / dotprod picked up by GGML_NATIVE); CPU only.
sudo -u "$APP_USER" cmake -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release \
  -DGGML_NATIVE=ON -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_SERVER=ON >/dev/null
sudo -u "$APP_USER" cmake --build "$SRC/build" --config Release -j "$(nproc)" --target llama-server llama-bench >/dev/null
sudo -u "$APP_USER" git -C "$SRC" rev-parse HEAD | sudo -u "$APP_USER" tee "$SRC/BUILT_COMMIT" >/dev/null
echo "built $(cat "$SRC/BUILT_COMMIT")"

log "Model"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$MODELS"
if [ -n "${MODEL_URL:-}" ]; then
  FILE="$MODELS/$(basename "${MODEL_URL%%\?*}")"
  if [ ! -s "$FILE" ]; then
    sudo -u "$APP_USER" curl -fL --retry 3 -o "$FILE.part" "$MODEL_URL"
    sudo -u "$APP_USER" mv "$FILE.part" "$FILE"
  fi
  if [ -n "${MODEL_SHA256:-}" ]; then
    echo "${MODEL_SHA256}  $FILE" | sha256sum -c - || { echo "checksum mismatch: $FILE"; exit 1; }
  else
    echo "WARNING: no MODEL_SHA256 given; sha256 is $(sha256sum "$FILE" | cut -d' ' -f1)"
  fi
elif [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  FILE="$(. "$ENV_FILE"; echo "$LLAMA_MODEL")"
else
  echo "MODEL_URL is required on a first install"; exit 1
fi
[ -s "$FILE" ] || { echo "model file missing: $FILE"; exit 1; }
ALIAS="${LLAMA_ALIAS:-$(basename "$FILE" .gguf | tr '[:upper:]' '[:lower:]')}"

log "Config $ENV_FILE"
cat > "$ENV_FILE" <<EOF
# Read by litchai-llama.service. Edit, then: systemctl restart litchai-llama
LLAMA_MODEL=$FILE
LLAMA_ALIAS=$ALIAS
LLAMA_PORT=$PORT
LLAMA_CTX=$CTX
LLAMA_THREADS=$THREADS
# e.g. --cache-type-k q8_0 --cache-type-v q8_0 --flash-attn on (bench before keeping)
LLAMA_EXTRA_ARGS=
EOF
chown root:"$APP_USER" "$ENV_FILE" && chmod 0640 "$ENV_FILE"

log "Unit"
install -m 0644 "$UNIT_SRC" /etc/systemd/system/litchai-llama.service
systemctl daemon-reload
systemctl enable --quiet litchai-llama
systemctl restart litchai-llama

log "Health"
for _ in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q '"ok"'; then
    echo "llama-server is up: model $ALIAS on 127.0.0.1:$PORT"
    curl -fsS "http://127.0.0.1:$PORT/v1/models" | head -c 400; echo
    echo
    echo "Next: sudo -u litch /usr/local/bin/litch-run $ROOT/venv/bin/python -m litchai.ops.llm_bench --target llama,openai,http://127.0.0.1:$PORT/v1,$ALIAS,litchai-llama --target ollama,ollama,http://127.0.0.1:11434,gemma3:4b,ollama --out /tmp/llm-bench.json"
    exit 0
  fi
  sleep 2
done
echo "llama-server did not become healthy; see: journalctl -u litchai-llama -n 80"
exit 1
