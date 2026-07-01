import { defineConfig } from 'vite';
import { importmapInjectPlugin, localServeWidgetsPlugin } from '@wc/core/host-plugin';

const UI_CDN_BASE = process.env.UI_CDN_BASE || undefined;
const COMPAT = process.env.WIDGET_COMPAT === '1';

export default defineConfig({
  // H5 单栈基座（原生 HTML/JS，零框架）：
  // - importmap 顶层不声明 vue（hostStack='none'），仅声明两个 scope 给跨栈物料用
  // - 同栈 H5 物料走 ESM 直引 render 函数
  // - 跨栈 Vue2/Vue3 物料走 loader 动态 import()，依赖由 importmap scope 解析
  // - 不再有 window.Vue2 / window.ElementPlus 全局变量
  plugins: [
    localServeWidgetsPlugin(),
    importmapInjectPlugin({ hostStack: 'none', cdnBase: UI_CDN_BASE, compat: COMPAT })
  ],
  server: {
    port: 5002,
    fs: { allow: ['..', '../..', '.'] }
  }
});
