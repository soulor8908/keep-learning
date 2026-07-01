import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { importmapInjectPlugin, localServeWidgetsPlugin } from '@wc/core/host-plugin';

// 离线/内网：UI_CDN_BASE 指向自托管 ESM 产物前缀（默认 esm.sh）
const UI_CDN_BASE = process.env.UI_CDN_BASE || undefined;
// 可选浏览器兼容：WIDGET_COMPAT=1 注入 es-module-shims 嗅探脚本，兼容不支持 importmap 的旧浏览器
const COMPAT = process.env.WIDGET_COMPAT === '1';

export default defineConfig({
  // 基座是 Vue3：importmap 顶层 vue → Vue3，与 Vue3 物料共享同一份 ESM。
  // 组 specifier（element-plus/common 等）与全量 element-plus/element-ui 也交给 importmap，
  // 从预打包与构建产物中排除。
  plugins: [
    vue(),
    localServeWidgetsPlugin(),
    importmapInjectPlugin({ hostStack: 'vue3', cdnBase: UI_CDN_BASE, compat: COMPAT })
  ],
  // optimizeDeps.exclude 只接受字符串（RegExp 会让 esbuild cjs-external 插件崩溃）。
  // element-plus/*、element-ui/* 子路径仅出现在物料产物中（由 localServeWidgetsPlugin 静态托管），
  // 不经 vite 扫描/预打包，无需在此 exclude。
  optimizeDeps: { exclude: ['vue', 'element-plus', 'element-ui'] },
  build: {
    rollupOptions: {
      external: ['vue', 'element-plus', 'element-ui', /^element-plus\//, /^element-ui\//]
    }
  },
  server: {
    port: 5000,
    fs: { allow: ['..', '.'] }
  }
});
