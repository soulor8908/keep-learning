import { createApp, h } from 'vue';
import ElementPlus from 'element-plus';
import FinancePanel from './FinancePanel.vue';

// ─── 开发预览入口 ───
// 仅在 vite serve 时使用，构建产物不会打包此文件。
// 纯 ESM：vue / element-plus 直接 import，由 Vite 从 node_modules 解析，无 window 全局。
const app = createApp({
  render: () =>
    h(FinancePanel, {
      title: 'Vue3 财务面板（开发预览）'
    })
});
app.use(ElementPlus);
app.mount('#app');
