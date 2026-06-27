import { defineConfig } from 'vite';
import widgetVitePlugin from '../../wc/widget-wrapper-plugin/vite-plugin.js';

// 通过 WIDGET_NAME 环境变量指定要构建的物料
const widgetName = process.env.WIDGET_NAME;

// 物料名 → 入口文件映射
// H5 物料入口只需 default 导出 render 函数或配置对象
const WIDGET_MAP = {
  'bi-clock-card': './src/clock-card.js',
  'bi-notice-board': './src/notice-board.js',
  'bi-recommend-panel': './src/recommend-panel.js'
};

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  const entry = widgetName && WIDGET_MAP[widgetName];

  return {
    plugins: [
      // 仅在 build 模式且指定了有效 WIDGET_NAME 时启用 H5 物料包装插件
      // 插件自动生成 wrapper：解析入口 → 创建 scope → 定义 Custom Element → 输出 UMD
      ...(isBuild && entry ? [widgetVitePlugin({
        name: widgetName,
        mode: 'h5',
        entry
      })] : [])
    ],
    // 多物料共存于同一 dist/：禁用 vite 默认的 emptyOutDir，避免后构建的物料覆盖前者
    // build:all 脚本会在开头显式 rm -rf dist 做一次清理
    build: { emptyOutDir: false }
  };
});
