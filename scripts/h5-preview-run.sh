#!/usr/bin/env bash
set -euo pipefail

# H5 Widget 预览运行脚本
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 清理 5002 端口残留进程
fuser -k 5002/tcp 2>/dev/null || true
sleep 1

# 进入 h5-widgets 子目录并启动预览
cd demo/h5-widgets
exec pnpm exec vite --host 0.0.0.0 --port 5002
