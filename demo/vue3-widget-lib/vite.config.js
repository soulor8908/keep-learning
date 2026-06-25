import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import widgetVitePlugin from '../../wc/widget-wrapper-plugin/vite-plugin.js';

const widgetName = process.env.WIDGET_NAME;

// 物料名 → 组件路径映射
const WIDGET_MAP = {
  'bi-finance-panel': './src/components/FinancePanel.vue',
  'bi-data-source': './src/components/bi-data-source.vue',
  'bi-metric-cards': './src/components/bi-metric-cards.vue',
  'bi-crash-tester': './src/components/bi-crash-tester.vue',
  'bi-payment-panel': './src/components/PaymentPanel.vue'
};

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  const component = widgetName && WIDGET_MAP[widgetName];

  return {
    plugins: [
      vue({
        template: {
          compilerOptions: {
            // 告诉 Vue3 编译器 el-* 是自定义元素，不要当 Vue 组件解析
            isCustomElement: (tag) => tag.startsWith('el-')
          }
        }
      }),
      // 仅在 build 模式且指定了有效 WIDGET_NAME 时启用物料包装插件
      // serve 模式（vite / vite dev）走标准 SPA，不打包物料
      ...(isBuild && component ? [widgetVitePlugin({
        name: widgetName,
        component,
        // 使用独立全局名，避免与 Vue2 物料冲突
        vueGlobal: 'Vue3'
      })] : [])
    ]
  };
});
