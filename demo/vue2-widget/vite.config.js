import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';

// ─── Vue2 物料 UMD 构建配置 ───
// 产物作为独立 widget，运行时依赖 vue / element-ui 由宿主提供
export default defineConfig({
  plugins: [vue2()],
  build: {
    lib: {
      entry: './src/index.js',
      name: 'biSalesPanel',
      formats: ['umd'],
      fileName: () => 'widget.js'
    },
    rollupOptions: {
      external: ['vue', 'element-ui'],
      output: {
        globals: {
          vue: 'Vue2',
          'element-ui': 'ELEMENT'
        }
      }
    }
  }
});
