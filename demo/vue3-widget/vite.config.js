import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// ─── Vue3 物料 UMD 构建配置 ───
// 产物作为独立 widget，运行时依赖 vue / element-plus 由宿主提供
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: './src/index.js',
      name: 'biFinancePanel',
      formats: ['umd'],
      fileName: () => 'widget.js'
    },
    rollupOptions: {
      external: ['vue', 'element-plus'],
      output: {
        globals: {
          vue: 'Vue3',
          'element-plus': 'ElementPlus'
        }
      }
    }
  }
});
