import Vue from 'vue';
import ElementUI from 'element-ui';
import SalesPanel from './SalesPanel.vue';

// ─── 开发预览入口 ───
// 仅在 vite serve 时使用，构建产物不会打包此文件。
// 纯 ESM：vue / element-ui 直接 import，由 Vite 从 node_modules 解析，无 window 全局。
Vue.use(ElementUI);

new Vue({
  el: '#app',
  render: (h) =>
    h(SalesPanel, {
      props: {
        title: 'Vue2 销售面板（开发预览）'
      }
    })
});
