import FinancePanel from './FinancePanel.vue';

// ─── 开发预览入口 ───
// 仅在 vite serve 时使用，构建产物不会打包此文件
// Vue3 由 index.html 从 CDN 加载并挂载到 window.Vue3
const Vue = window.Vue3 || window.Vue;

if (!Vue || !Vue.createApp) {
  throw new Error('Vue3 运行时未找到，请检查 index.html 中 CDN 加载是否成功');
}

const { createApp, h } = Vue;

createApp({
  render: () =>
    h(FinancePanel, {
      title: 'Vue3 财务面板（开发预览）'
    })
}).mount('#app');
