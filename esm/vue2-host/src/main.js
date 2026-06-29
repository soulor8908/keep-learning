// Vue2 基座启动入口（ESM 版）
// 基座自身是 Vue2：vue 由 importmap 顶层解析到 Vue2 ESM（构建时 external）。
// 同栈 Vue2 物料走 ESM 直引（Vite 编译 SFC，与基座共享同一份 Vue2）；
// 跨栈 Vue3/H5 物料走 loader 的动态 import()，依赖由 importmap scope 解析。
// 不再需要 window.Vue2 = Vue：ESM 版没有 window 全局变量约定。
import Vue from 'vue';
import App from './App.vue';

new Vue({
  render: (h) => h(App)
}).$mount('#app');
