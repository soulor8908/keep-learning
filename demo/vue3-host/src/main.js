import { createApp } from 'vue';
import App from './App.vue';
import * as Vue from 'vue';
import i18n from './i18n';
// 引入 widget-scope 副作用：挂载 window.__wcWidgetScope__ 供 Vue3 物料 external 引用
import '@wc/widget-scope';
import { setupElementPlus } from './element-plus';
// 注册 ElementUI 全局组件（供 Vue2 物料使用，依赖 index.html 中 UMD 脚本先就绪）
import './element-ui-setup';

// 把当前 Vue3 暴露给 Vue3 物料 UMD 使用
window.Vue3 = Vue;

const app = createApp(App);
// 按需注册 element-plus 组件，并挂载到 window.ElementPlus 供物料复用
setupElementPlus(app);
app.use(i18n).mount('#app');
