#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Building widgets..."
pnpm build:widgets

echo "Building host with Vite..."
cd demo/host
pnpm vite build

echo "Copying runtime and widget assets to host dist..."
cd "$PROJECT_DIR"
mkdir -p demo/host/dist/runtime
mkdir -p demo/host/dist/widgets

# runtime 依赖
cp demo/host/node_modules/vue2/dist/vue.js demo/host/dist/runtime/vue2.js
cp demo/host/node_modules/element-ui/lib/index.js demo/host/dist/runtime/element-ui.js
cp demo/host/node_modules/element-ui/lib/theme-chalk/index.css demo/host/dist/runtime/element-ui.css
cp demo/host/node_modules/vue/dist/vue.global.js demo/host/dist/runtime/vue3.js
cp demo/host/node_modules/element-plus/dist/index.full.js demo/host/dist/runtime/element-plus.js
cp demo/host/node_modules/element-plus/dist/index.css demo/host/dist/runtime/element-plus.css
cp node_modules/lodash/lodash.min.js demo/host/dist/runtime/lodash.min.js

# 物料产物
for dir in vue2-widgets vue3-widgets h5-widgets; do
  cp demo/$dir/dist/*.js demo/host/dist/widgets/ 2>/dev/null || true
  cp demo/$dir/dist/*.css demo/host/dist/widgets/ 2>/dev/null || true
done

echo "Build complete."
