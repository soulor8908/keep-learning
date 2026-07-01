#!/bin/bash
set -Eeuo pipefail

# 纯 ESM + importmap 部署构建脚本
#
# 与旧版（UMD）的差异：
# - 不再复制 runtime/ 全局脚本（vue2.js / vue3.js / element-ui.js / element-plus.js）。
#   依赖隔离与共享全部交给 importmap：基座 index.html 的 <!--IMPORTMAP_INJECT--> 占位标记
#   由 vite 插件从 wc/ui-groups.json 生成注入，运行时从 CDN 或自托管 ESM 前缀解析。
# - 物料产物按栈分目录：dist/widgets/vue2/、dist/widgets/vue3/、dist/widgets/h5/。
#   URL 前缀决定 importmap scope，从而决定物料内部 bare 'vue' 解析到哪个版本。
# - 离线/内网：部署前把 UI 库 ESM 产物托管到自有服务器，启动/构建时设 UI_CDN_BASE 环境变量。

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Building widgets (ESM)..."

# 多仓部署时，各物料仓库独立构建，产物通过 WIDGETS_DIRS 环境变量传入
# 格式：栈名=绝对路径，如 vue2=/path/to/vue2-widgets/dist,vue3=/path/to/vue3-widgets/dist,h5=/path/to/h5-widgets/dist
WIDGETS_DIRS="${WIDGETS_DIRS:-}"

# 本地开发（monorepo）：从同级 demo 目录构建
if [ -z "$WIDGETS_DIRS" ]; then
  for dir in vue2-widgets vue3-widgets h5-widgets; do
    cd "demo/$dir"
    pnpm run build
    cd "$PROJECT_DIR"
  done
fi

echo "Building host with Vite (importmap auto-injected)..."
cd demo/host
pnpm vite build

echo "Copying widget ESM assets to host dist (stack-scoped)..."
cd "$PROJECT_DIR"
mkdir -p demo/host/dist/widgets/vue2
mkdir -p demo/host/dist/widgets/vue3
mkdir -p demo/host/dist/widgets/h5

# 物料产物按栈分目录（URL 前缀 /widgets/{stack}/ 决定 importmap scope）
if [ -n "$WIDGETS_DIRS" ]; then
  # 多仓部署：WIDGETS_DIRS 格式 vue2=/path,vue3=/path,h5=/path
  IFS=',' read -ra DIRS <<< "$WIDGETS_DIRS"
  for entry in "${DIRS[@]}"; do
    entry=$(echo "$entry" | xargs)  # trim whitespace
    stack="${entry%%=*}"
    dir="${entry#*=}"
    cp "$dir"/*.js "demo/host/dist/widgets/$stack/" 2>/dev/null || true
    cp "$dir"/*.css "demo/host/dist/widgets/$stack/" 2>/dev/null || true
    cp "$dir"/manifest.json "demo/host/dist/widgets/$stack/" 2>/dev/null || true
  done
else
  # 本地开发（monorepo）：从同级 demo 目录复制，按栈分目录
  for stack in vue2 vue3 h5; do
    cp "demo/${stack}-widgets/dist"/*.js "demo/host/dist/widgets/$stack/" 2>/dev/null || true
    cp "demo/${stack}-widgets/dist"/*.css "demo/host/dist/widgets/$stack/" 2>/dev/null || true
    cp "demo/${stack}-widgets/dist"/manifest.json "demo/host/dist/widgets/$stack/" 2>/dev/null || true
  done
fi

echo "Build complete."
echo "  - Host: demo/host/dist/"
echo "  - Widgets: demo/host/dist/widgets/{vue2,vue3,h5}/"
echo "  - Dependencies: resolved by importmap from CDN (or UI_CDN_BASE if set at build time)"
