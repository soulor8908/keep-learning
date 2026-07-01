import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 仅用于 vite serve 单仓开发预览。构建走 build.mjs（ESM 分包）。
export default defineConfig({
  plugins: [vue()]
});
