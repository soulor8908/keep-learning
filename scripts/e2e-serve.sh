#!/usr/bin/env bash
set -euo pipefail

# E2E 测试前的物料构建与基座启动脚本
#
# 纯 ESM 方案：各物料仓独立构建 ESM 产物，基座 dev server 通过 localServeWidgetsPlugin 托管。
# 依赖（vue/element-ui/element-plus）由 importmap 解析到 esm.sh CDN，运行时按需加载。

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 确保各物料仓依赖已安装（CI 首次运行 / 本地全新 clone 时需要）
# --ignore-workspace：各 demo 仓独立安装（模拟多仓：每个仓有自己的 node_modules），
#   否则 pnpm 会绑定到根 workspace（只含 wc）而不安装 demo 自身依赖。
# --no-frozen-lockfile：CI=true 默认冻结锁文件，但物料仓加过新依赖需允许更新。
for dir in vue2-widgets vue3-widgets h5-widgets host; do
  if [ -f "demo/$dir/package.json" ] && [ ! -d "demo/$dir/node_modules/vite" ]; then
    echo "Installing deps for demo/$dir..."
    (cd "demo/$dir" && pnpm install --ignore-workspace --no-frozen-lockfile --prefer-offline --loglevel error)
  fi
done

# 构建物料 ESM 产物
echo "Building widgets (ESM)..."
pnpm build:widgets

# 启动基座 dev server（端口 5000）
echo "Starting host dev server on port 5000..."
cd demo/host
exec pnpm serve
