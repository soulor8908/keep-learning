#!/usr/bin/env bash
set -euo pipefail

# H5 Widget Lib 预览构建脚本
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 安装 h5-widget-lib 依赖
cd demo/h5-widget-lib
pnpm install
