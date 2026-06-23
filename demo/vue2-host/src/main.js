import Vue from 'vue';
import App from './App.vue';

// 把当前 Vue2 暴露给 Vue2 物料 UMD 使用
window.Vue2 = Vue;

new Vue({
  render: h => h(App)
}).$mount('#app');
