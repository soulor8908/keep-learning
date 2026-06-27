import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    watch: {
      // 监听物料源码和 wc/ 目录变化
      ignored: ['!**/node_modules/@wc/**', '!**/wc/**']
    }
  }
});
