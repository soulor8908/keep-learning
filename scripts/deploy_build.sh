#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Building widgets..."

# 多仓部署时，各物料仓库独立构建，产物通过 WIDGETS_DIRS 环境变量传入
# 格式：逗号分隔的绝对路径，如 /path/to/vue2-widgets/dist,/path/to/vue3-widgets/dist
WIDGETS_DIRS="${WIDGETS_DIRS:-}"

# 本地开发（monorepo）：从同级 demo 目录构建
if [ -z "$WIDGETS_DIRS" ]; then
  for dir in vue2-widgets vue3-widgets h5-widgets; do
    cd "demo/$dir"
    pnpm run build
    cd "$PROJECT_DIR"
  done
fi

echo "Building host with Vite..."
cd demo/host
pnpm vite build

echo "Copying runtime and widget assets to host dist..."
cd "$PROJECT_DIR"
mkdir -p demo/host/dist/runtime
mkdir -p demo/host/dist/widgets

# runtime 依赖（从基座 node_modules 复制）
cp demo/host/node_modules/vue2/dist/vue.js demo/host/dist/runtime/vue2.js
cp demo/host/node_modules/element-ui/lib/index.js demo/host/dist/runtime/element-ui.js
cp demo/host/node_modules/element-ui/lib/theme-chalk/index.css demo/host/dist/runtime/element-ui.css
cp demo/host/node_modules/vue/dist/vue.global.js demo/host/dist/runtime/vue3.js
cp demo/host/node_modules/element-plus/dist/index.full.js demo/host/dist/runtime/element-plus.js
cp demo/host/node_modules/element-plus/dist/index.css demo/host/dist/runtime/element-plus.css
cp node_modules/lodash/lodash.min.js demo/host/dist/runtime/lodash.min.js

# 物料产物
if [ -n "$WIDGETS_DIRS" ]; then
  # 多仓部署：从指定目录复制
  IFS=',' read -ra DIRS <<< "$WIDGETS_DIRS"
  for dir in "${DIRS[@]}"; do
    dir=$(echo "$dir" | xargs)  # trim whitespace
    cp "$dir"/*.js demo/host/dist/widgets/ 2>/dev/null || true
    cp "$dir"/*.css demo/host/dist/widgets/ 2>/dev/null || true
    cp "$dir"/manifest.json demo/host/dist/widgets/ 2>/dev/null || true
  done
else
  # 本地开发（monorepo）：从同级 demo 目录复制
  for dir in vue2-widgets vue3-widgets h5-widgets; do
    cp "demo/$dir/dist"/*.js demo/host/dist/widgets/ 2>/dev/null || true
    cp "demo/$dir/dist"/*.css demo/host/dist/widgets/ 2>/dev/null || true
    cp "demo/$dir/dist"/manifest.json demo/host/dist/widgets/ 2>/dev/null || true
  done
fi

echo "Build complete."
