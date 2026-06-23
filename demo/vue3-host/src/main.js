import { createApp } from 'vue';
import App from './App.vue';
import * as Vue from 'vue';

// 把当前 Vue3 暴露给 Vue3 物料 UMD 使用
window.Vue3 = Vue;

createApp(App).mount('#app');
