import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'wc': path.resolve(__dirname, '../../wc')
    }
  },
  server: {
    port: 5000
  }
});
