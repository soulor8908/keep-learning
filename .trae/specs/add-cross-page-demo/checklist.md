# 验收清单：交叉页面多物料同页 Demo

> change-id: `add-cross-page-demo`

## 物料源码

- [x] `demo/vue2-widget-lib/src/components/OrdersPanel.vue` 存在
- [x] `demo/vue3-widget-lib/src/components/PaymentPanel.vue` 存在
- [x] `demo/h5-widget-lib/src/recommend-panel.js` 存在
- [x] 三物料各自 emit 业务事件（order:click / payment:success / recommend:expose）

## 构建与产物

- [x] `demo/vue3-host/public/widgets/bi-orders-panel.js` 存在
- [x] `demo/vue3-host/public/widgets/bi-payment-panel.js` 存在
- [x] `demo/vue3-host/public/widgets/bi-recommend-panel.js` 存在

## 注册与视图

- [x] `widgetRegistry.js` 注册三物料，vueVersion 分别 2/3/none
- [x] App.vue 含「交叉页面演示」section
- [x] 三物料同页挂载
- [x] 每物料标注维护团队与技术栈
- [x] 日志区监听三个业务事件

## 运行验收

- [x] vue3-host 启动后三物料渲染成功（dev server 启动 + 三产物 200 + UMD 包有效）
- [x] 点击触发事件，日志区显示（事件监听已接入 order:click/payment:success/recommend:expose）
- [x] 三技术栈无冲突（UMD 依赖分别为 Vue2/vue/无框架）
- [x] `npm run test:run` 全绿（97 用例）
- [x] 既有物料不被破坏（mountAll 与既有 registry 项未改动）
