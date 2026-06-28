// Vue2 基座启动入口
// 基座自身只 new Vue 一次，物料由 loader 单独挂载到独立的 mount point，
// 因此基座和物料之间的 Vue 实例互不污染。
import Vue from 'vue';
import App from './App.vue';

new Vue({
  render: (h) => h(App)
}).$mount('#app');
