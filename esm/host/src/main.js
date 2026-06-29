// ESM 基座启动入口
// 基座自身也走 importmap：vue / element-plus 由 importmap 顶层 imports 解析，
// 与 Vue3 物料共享同一份 ESM 实例（构建时 external，不再打包进基座 chunk）。
import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import App from './App.vue';

const app = createApp(App);
app.use(ElementPlus);
app.mount('#app');
