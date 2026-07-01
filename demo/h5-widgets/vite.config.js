import { defineConfig } from 'vite';

// 仅用于 vite serve 单仓开发预览。构建走 build.mjs（ESM 分包）。
// H5 物料无框架依赖，无需任何插件。
export default defineConfig({});
