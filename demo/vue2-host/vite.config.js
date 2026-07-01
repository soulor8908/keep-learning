import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';
import { importmapInjectPlugin, localServeWidgetsPlugin } from '@wc/core/host-plugin';

const UI_CDN_BASE = process.env.UI_CDN_BASE || undefined;
const COMPAT = process.env.WIDGET_COMPAT === '1';

export default defineConfig({
  // Vue2 单栈基座：importmap 顶层 vue → Vue2，element-ui 同栈共享。
  // 跨栈 Vue3/H5 物料走 loader 动态 import()，依赖由 importmap scope 解析。
  plugins: [
    vue2(),
    localServeWidgetsPlugin(),
    importmapInjectPlugin({ hostStack: 'vue2', cdnBase: UI_CDN_BASE, compat: COMPAT })
  ],
  // 基座自身的 vue / element-ui 也走 importmap（构建时 external），与同栈物料共享。
  // optimizeDeps.exclude 只接受字符串（RegExp 会让 esbuild cjs-external 插件崩溃）。
  optimizeDeps: { exclude: ['vue', 'element-ui', 'element-plus'] },
  build: {
    rollupOptions: { external: ['vue', 'element-ui', 'element-plus', /^element-plus\//, /^element-ui\//] }
  },
  server: {
    port: 5001,
    fs: { allow: ['..', '../..', '.'] }
  }
});
