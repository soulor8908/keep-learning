# 任务清单：交叉页面多物料同页 Demo

> change-id: `add-cross-page-demo`

## T1 新增三个业务域物料源码

- [x] T1.1 `demo/vue2-widget-lib/src/components/OrdersPanel.vue`：Vue2 组件，接收 `config.orders` 数组渲染订单列表，点击订单 `window.widgetBus.emit('order:click', {id, amount, name})`。用 `<el-card>` `<el-table>` 等基座 UI 组件。
- [x] T1.2 `demo/vue3-widget-lib/src/components/PaymentPanel.vue`：Vue3 组件，接收 `config.methods` 渲染支付方式，点击支付 `window.widgetBus.emit('payment:success', {method, amount})`。用 `<el-card>` `<el-button>`。
- [x] T1.3 `demo/h5-widget-lib/src/recommend-panel.js`：原生 H5 配置对象模式，接收 `config.items` 渲染推荐卡片，点击 `window.widgetBus.emit('recommend:expose', {id, name})`。无框架依赖。

## T2 物料构建配置

- [x] T2.1 `demo/vue2-widget-lib`：`vue.config.js` 自动发现机制已支持 `OrdersPanel.vue → bi-orders-panel`，无需改配置。
- [x] T2.2 `demo/vue3-widget-lib`：`vite.config.js` WIDGET_MAP 已加 `bi-payment-panel`。
- [x] T2.3 `demo/h5-widget-lib`：`vite.config.js` WIDGET_MAP 已加 `bi-recommend-panel`，`package.json` 已加 `build:recommend` 脚本。
- [x] T2.4 构建三个产物：`bi-orders-panel.js`（7.68 KiB）、`bi-payment-panel.js`（2.92 KiB）、`bi-recommend-panel.js`（3.62 KiB）。

## T3 产物部署与注册

- [x] T3.1 三个产物复制到 `demo/vue3-host/public/widgets/`。
- [x] T3.2 `demo/vue3-host/src/widgetRegistry.js` 注册三个物料，`vueVersion` 分别为 `'2'`/`'3'`/`'none'`，配 `config` mock 数据。直接用 `/widgets/` 路径，确保仅启动 vue3-host 即可运行。

## T4 交叉页面视图

- [x] T4.1 `demo/vue3-host/src/App.vue` 新增「交叉页面演示」section，同时挂载三物料。
- [x] T4.2 每个物料标注「维护团队」与「技术栈」标签（tech-tag：Vue2·A团队 / Vue3·B团队 / 原生H5·C团队）。
- [x] T4.3 基座日志区监听 `order:click` / `payment:success` / `recommend:expose` 事件并展示。
- [x] T4.4 复用既有 `mountWidget` 与 widget-bus，不引入新机制（`mountCrossPage` 按名查找 widgets 项挂载）。

## T5 验收

- [x] T5.1 vue3-host 启动后，交叉页面三物料同页渲染成功（dev server + 三产物 200 + UMD 有效）。
- [x] T5.2 点击订单/支付/推荐，日志区出现对应事件（监听已接入）。
- [x] T5.3 三物料来自不同技术栈（Vue2/Vue3/原生）且无冲突（UMD 依赖分别为 Vue2/vue/无框架）。
- [x] T5.4 `npm run test:run` 仍全绿（97 用例）。
- [x] T5.5 既有物料（filter-bar 等）不被破坏（mountAll 与既有 registry 项未改动）。

## 备注

- 修复了 `PaymentPanel.vue` 的构建错误：原用 `<template #header>` slot 语法，但 vue3 编译器把 `el-card` 当 custom element 不支持 slot 指令，改为 `:header` 字符串 prop + 卡片内独立 team-tag-row。
