import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import widgetVitePlugin from '../../wc/widget-wrapper-plugin/vite-plugin.js';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // 告诉 Vue3 编译器 el-* 是自定义元素，不要当 Vue 组件解析
          isCustomElement: (tag) => tag.startsWith('el-')
        }
      }
    }),
    widgetVitePlugin({
      name: 'bi-finance-panel',
      component: './src/components/FinancePanel.vue',
      // 使用独立全局名，避免与 Vue2 物料冲突
      vueGlobal: 'Vue3'
    })
  ]
});
