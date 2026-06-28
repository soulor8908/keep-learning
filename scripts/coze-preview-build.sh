#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 安装依赖
pnpm install

# 构建物料与基座
pnpm build:widgets
cd demo/host
pnpm vite build

echo "Preview build complete."
