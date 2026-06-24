import Vue from 'vue';
import App from './App.vue';
import i18n from './i18n';

// 加载统一 UI 组件库，挂载到全局供所有物料复用
import './element-ui.js';

// aui 兼容层：ElementUI 迁移后，只设置 window.aui 版本号通过版本契约校验
import './aui-compat';

// 把当前 Vue2 暴露给 Vue2 物料 UMD 使用
window.Vue2 = Vue;

new Vue({
  i18n,
  render: h => h(App)
}).$mount('#app');
