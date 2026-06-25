# 任务清单：vue2-host 交叉页面演示 + 离线 Vendor

> change-id: `extend-cross-page-demo-to-vue2-host-and-offline`

## T1 vue2-host 交叉页面产物与注册

- [ ] T1.1 复制 `bi-orders-panel.js` / `bi-payment-panel.js` / `bi-recommend-panel.js` 到 `demo/vue2-host/public/widgets/`。
- [ ] T1.2 `demo/vue2-host/src/widgetRegistry.js` 注册三物料，`vueVersion` 2/3/none，`js` 用 `/widgets/xxx.js`，配与 vue3-host 一致的 mock config。

## T2 vue2-host 交叉页面视图

- [ ] T2.1 `demo/vue2-host/src/App.vue` 模板新增「交叉页面演示」section（三 widget-slot + tech-tag），复用既有 dashboard 样式并加 `dashboard--three`。
- [ ] T2.2 data 新增 `ordersPanel/paymentPanel/recommendPanel` 的 `$refs` 引用（模板加 ref）。
- [ ] T2.3 methods 新增 `mountCrossPage()`：按 name 查 widgets 并 mountWidget。
- [ ] T2.4 mounted 中监听 `order:click` / `payment:success` / `recommend:expose` 并 addLog，调用 `mountCrossPage()`。
- [ ] T2.5 样式新增 cross-page / section-title / tech-tag（与 vue3-host 一致）。

## T3 Vue 运行时本地化

- [ ] T3.1 `demo/vue2-host/public/vendor/vue@3.js` ← 复制 `demo/vue3-widget-lib/node_modules/vue/dist/vue.global.prod.js`。
- [ ] T3.2 `demo/vue3-host/public/vendor/vue@2.js` ← 复制 `demo/vue2-widget-lib/node_modules/vue/dist/vue.js`。
- [ ] T3.3 更新 `demo/vue2-host/public/index.html`：`<script src="/vendor/vue@3.js">` 替换 unpkg。
- [ ] T3.4 更新 `demo/vue3-host/index.html`：`<script src="/vendor/vue@2.js">` 替换 unpkg。
- [ ] T3.5 两个 host `package.json` 新增 `setup:vendors` 脚本，从 widget-lib node_modules 复制 Vue dist 到本地 vendor。

## T4 验收

- [ ] T4.1 vue2-host 启动后交叉页面三物料同页渲染成功。
- [ ] T4.2 点击订单/支付/推荐，日志区出现对应事件。
- [ ] T4.3 断网（或屏蔽 unpkg）后两个 host 仍能加载对方 Vue 运行时。
- [ ] T4.4 `npm run setup:vendors` 在两个 host 都能复现 vendor 文件。
- [ ] T4.5 `npm run test:run` 仍全绿。
