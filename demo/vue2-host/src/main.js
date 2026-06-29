// Vue2 基座启动入口
// - 基座自身通过 import Vue 加载 Vue2（npm 包，由 Vite 解析）。
// - window.Vue2 = Vue：暴露给 loader 的 ensureRuntimes，使其检测到 Vue2 已就绪，
//   避免 mountWidget 重复加载 /runtime/vue2.js；同时为未来可能的 UMD Vue2 物料保留出口。
// - element-ui / Vue3 / element-plus 不在此加载，按需在 App.vue / loader 中触发。
import Vue from 'vue';
import App from './App.vue';

window.Vue2 = Vue;

new Vue({
  render: (h) => h(App)
}).$mount('#app');
