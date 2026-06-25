import { defineConfig } from 'vite';
import h5WidgetPlugin from '../../wc/widget-wrapper-plugin/h5-vite-plugin.js';

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

  // 静态检查范围限定到当前物料自身文件，避免误报同目录其它物料的命名空间
  // （如构建 bi-clock-card 时不应扫描 notice-board.css）
  const scanPaths = entry ? [entry, entry.replace(/\.js$/, '.css')] : [];

  return {
    plugins: [
      // 仅在 build 模式且指定了有效 WIDGET_NAME 时启用 H5 物料包装插件
      // 插件自动生成 wrapper：解析入口 → 创建 scope → 定义 Custom Element → 输出 UMD
      ...(isBuild && entry ? [h5WidgetPlugin({
        name: widgetName,
        entry,
        // CSS 命名空间检查：H5 物料用 .css 文件，检查选择器是否含 .bi-xxx 前缀
        enforceCssNamespace: 'warn',
        cssNamespaceScanPaths: scanPaths,
        // JS 危险 API 扫描
        scanRisks: true,
        riskScanPaths: scanPaths
      })] : [])
    ],
    // 多物料共存于同一 dist/：禁用 vite 默认的 emptyOutDir，避免后构建的物料覆盖前者
    // build:all 脚本会在开头显式 rm -rf dist 做一次清理
    build: { emptyOutDir: false }
  };
});
