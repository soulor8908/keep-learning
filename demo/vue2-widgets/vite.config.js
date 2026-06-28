import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';

export default defineConfig({
  plugins: [vue2()],
  build: {
    lib: {
      entry: './src/index.js',
      name: 'vue2Widgets',
      formats: ['umd'],
      fileName: () => 'vue2-widgets.js'
    },
    rollupOptions: {
      external: (id) => {
        if (id.endsWith('.css')) return false;
        return id === 'vue' || id === 'element-ui';
      },
      output: {
        globals: {
          vue: 'Vue2',
          'element-ui': 'ELEMENT'
        }
      }
    }
  }
});
