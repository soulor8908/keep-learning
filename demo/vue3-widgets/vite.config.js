import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: './src/index.js',
      name: 'vue3Widgets',
      formats: ['umd'],
      fileName: () => 'vue3-widgets.js'
    },
    rollupOptions: {
      external: (id) => {
        if (id.endsWith('.css')) return false;
        return id === 'vue' || id === 'element-plus';
      },
      output: {
        globals: {
          vue: 'Vue3',
          'element-plus': 'ElementPlus'
        }
      }
    }
  }
});
