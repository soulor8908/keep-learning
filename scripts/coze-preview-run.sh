#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 清理 5000 端口残留进程
fuser -k 5000/tcp 2>/dev/null || true
sleep 1

# 显式声明关键环境变量
export PORT=5000

# 进入 vue3-host 子目录并启动预览
cd demo/vue3-host
exec pnpm exec vite --host 0.0.0.0 --port 5000
