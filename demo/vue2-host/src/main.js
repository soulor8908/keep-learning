import Vue from 'vue';
import App from './App.vue';
import i18n from './i18n';

// 加载统一 UI 组件库，挂载到全局供所有物料复用
import './element-ui.js';
// 引入 widget-scope 副作用：挂载 window.__wcWidgetScope__ 供 Vue2 物料 external 引用
import '../../wc/widget-scope/index.js';

// 把当前 Vue2 暴露给 Vue2 物料 UMD 使用
window.Vue2 = Vue;

new Vue({
  i18n,
  render: h => h(App)
}).$mount('#app');
