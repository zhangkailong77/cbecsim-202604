#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONDA_ENV="${CBEC_CONDA_ENV:-cbec-py312}"

if ! command -v conda >/dev/null 2>&1; then
  echo "[error] conda 未安装或不在 PATH 中。"
  exit 1
fi

CONDA_BASE="$(conda info --base)"
CONDA_SH="$CONDA_BASE/etc/profile.d/conda.sh"
if [[ ! -f "$CONDA_SH" ]]; then
  echo "[error] 未找到 conda 初始化脚本: $CONDA_SH"
  exit 1
fi

cleanup() {
  local code=$?
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  wait >/dev/null 2>&1 || true
  exit "$code"
}

trap cleanup INT TERM EXIT

echo "[info] 启动前端..."
(
  cd "$ROOT_DIR/frontend"
  npm run dev
) 2>&1 | sed 's/^/[frontend] /' &
FRONTEND_PID=$!

echo "[info] 启动后端..."
(
  # shellcheck disable=SC1090
  source "$CONDA_SH"
  conda activate "$CONDA_ENV"
  cd "$ROOT_DIR/backend/apps/api-gateway"
  uvicorn app.main:app --host 0.0.0.0 --reload
) 2>&1 | sed 's/^/[backend] /' &
BACKEND_PID=$!

echo "[info] 前后端已启动（Ctrl+C 可一键停止）"
while true; do
  if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    wait "$FRONTEND_PID" >/dev/null 2>&1 || true
    break
  fi
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
    break
  fi
  sleep 1
done
