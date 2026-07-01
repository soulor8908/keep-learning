// ESM 基座启动入口
// 基座自身也走 importmap：vue / element-plus 由 importmap 顶层 imports 解析，
// 与 Vue3 物料共享同一份 ESM 实例（构建时 external，不再打包进基座 chunk）。
import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import App from './App.vue';

const app = createApp(App);
app.use(ElementPlus);
app.mount('#app');

// dev 期把加载器挂到 window，供 e2e 错误降级测试直接调用 mountWidget/unmountWidget。
// 生产构建下 import.meta.env.DEV 为 false，整段会被 tree-shake，不进产物。
if (import.meta.env.DEV) {
  import('@wc/core/loader').then(({ mountWidget, unmountWidget, preloadWidgets }) => {
    window.__loader = { mountWidget, unmountWidget, preloadWidgets };
  });
}
