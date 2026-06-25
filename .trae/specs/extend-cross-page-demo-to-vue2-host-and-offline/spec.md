# vue2-host 交叉页面演示 + 离线 Vendor Spec

> change-id: `extend-cross-page-demo-to-vue2-host-and-offline`

## Why

1. **README 与 demo 覆盖不一致**：README 宣称的"订单Vue2/支付Vue3/推荐H5 三物料同页"交叉页面 demo 仅在 vue3-host 可用。vue2-host 的注册表与 public/widgets 均缺这三个物料，导致"Vue2 基座也能加载 Vue3/H5 物料"这一核心技术包容性卖点无法在 demo 中验证。
2. **两个 host 均依赖 unpkg CDN**：vue2-host 的 index.html 通过 `https://unpkg.com/vue@3/...` 加载 Vue3 运行时，vue3-host 的 index.html 通过 `https://unpkg.com/vue@2/...` 加载 Vue2 运行时。内网/离线环境、unpkg 故障、版本漂移都会导致 demo 跑不起来。

## What Changes

- 把已构建的 `bi-orders-panel.js` / `bi-payment-panel.js` / `bi-recommend-panel.js` 复制到 `demo/vue2-host/public/widgets/`。
- 在 `demo/vue2-host/src/widgetRegistry.js` 注册三物料（`vueVersion` 2/3/none，直接用 `/widgets/` 路径，仅启动 vue2-host 即可运行）。
- 在 `demo/vue2-host/src/App.vue` 新增「交叉页面演示」section（Options API 风格：data refs + mountCrossPage 方法 + 事件监听 + 模板 + 样式），与 vue3-host 保持一致的叙事与交互。
- 把两个 Vue 运行时 vendor 到本地：vue2-host 的 `public/vendor/vue@3.js`、vue3-host 的 `public/vendor/vue@2.js`，来源为对应 widget-lib 的 `node_modules/vue/dist/`；更新两个 index.html 的 `<script src>` 指向本地 vendor。
- 在两个 host 的 `package.json` 新增 `setup:vendors` 脚本，从 widget-lib node_modules 复制 Vue dist 到本地 vendor，保证可复现。

## Scope

### In Scope
- vue2-host 交叉页面 section + 注册 + 产物部署。
- 两个 host 的 Vue 运行时本地化（vendor 文件 + index.html + setup 脚本）。

### Non-Goals
- 不改 vue3-host 已有的交叉页面实现（已完成）。
- 不引入版本锁定文件管理（vendor 文件即锁定版本）。
- 不改 widget-loader / widget-bus 等运行时核心。

## ADDED Requirements

### Requirement: vue2-host 交叉页面演示
The system SHALL provide a cross-page demo in vue2-host that mounts the three cross-tech-stack widgets on one page.

#### Scenario: vue2-host 加载三物料
- **WHEN** 启动 vue2-host
- **THEN** 交叉页面 section 同时渲染订单(Vue2)/支付(Vue3)/推荐(原生H5)三物料，点击各自触发 order:click/payment:success/recommend:expose 并显示在日志区

### Requirement: Vue 运行时本地化
The system SHALL vendor both Vue runtimes locally so demos run without external CDN.

#### Scenario: 离线运行
- **WHEN** 断网环境下启动任一 host
- **THEN** 对方 Vue 运行时从本地 `/vendor/vue@N.js` 加载，物料正常渲染

#### Scenario: 可复现 vendor
- **WHEN** 执行 `npm run setup:vendors`
- **THEN** 从 widget-lib node_modules 复制 Vue dist 到本地 vendor 目录

## MODIFIED Requirements
无

## REMOVED Requirements
无
