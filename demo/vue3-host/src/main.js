import { createApp } from 'vue';
import App from './App.vue';
import * as Vue from 'vue';
import i18n from './i18n';

// 基座加载统一 UI 组件库，挂载到全局供所有物料复用
import '../../../wc/mock-aui/index.js';

// 把当前 Vue3 暴露给 Vue3 物料 UMD 使用
window.Vue3 = Vue;

createApp(App).use(i18n).mount('#app');
