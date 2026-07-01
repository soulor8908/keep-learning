import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';

// 仅用于 vite serve 单仓开发预览。构建走 build.mjs（ESM 分包）。
export default defineConfig({
  plugins: [vue2()]
});
