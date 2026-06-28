import SalesPanel from './SalesPanel.vue';

// ─── 开发预览入口 ───
// 仅在 vite serve 时使用，构建产物不会打包此文件
// Vue2 由 index.html 从 CDN 加载并挂载到 window.Vue2
const Vue = window.Vue2 || window.Vue;

if (!Vue) {
  throw new Error('Vue2 运行时未找到，请检查 index.html 中 CDN 加载是否成功');
}

new Vue({
  el: '#app',
  render: (h) =>
    h(SalesPanel, {
      props: {
        title: 'Vue2 销售面板（开发预览）'
      }
    })
});
