#!/usr/bin/env bash
set -euo pipefail

# H5 Widget 预览构建脚本
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 安装依赖并构建 H5 物料（ESM）
pnpm install
cd demo/h5-widgets
pnpm run build

echo "H5 preview build complete."
