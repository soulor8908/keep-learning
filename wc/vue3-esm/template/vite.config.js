import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: path.resolve(__dirname, './index.js'),
      formats: ['es'],
      fileName: () => 'widget.js'
    },
    rollupOptions: {
      external: ['vue']
    }
  }
});
