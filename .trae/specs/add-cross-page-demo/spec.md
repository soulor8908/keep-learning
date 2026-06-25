# 交叉页面多物料同页 Demo Spec

## Why

README 新增的「背景与问题 / 解决思路」章节描述了核心痛点：一个交叉页面同时承载 A 业务订单区、B 业务支付区、C 业务推荐区，三团队各自维护物料、基座整合渲染。但现有 demo（`demo/vue2-host`、`demo/vue3-host`）的看板仍是单业务域聚合（筛选/数据源/指标卡/图表），**没有一个 demo 直接呈现「三业务域同页、解耦加载」的核心叙事**，导致 README 的核心卖点无可验证产物。

本 Spec 新增一个「交叉页面」demo，把叙事变成可运行、可演示的页面，直观证明业务解耦、技术包容、按需加载三条原则。

## What Changes

### 1. 新增三个业务域物料（演示不同团队 / 不同技术栈）

| 物料名 | 业务域 | 技术栈 | 所属 lib |
| --- | --- | --- | --- |
| `bi-orders-panel` | A 业务·订单区 | Vue2 | `demo/vue2-widget-lib` |
| `bi-payment-panel` | B 业务·支付区 | Vue3 | `demo/vue3-widget-lib` |
| `bi-recommend-panel` | C 业务·推荐区 | 原生 H5 | `demo/h5-widget-lib` |

三个物料各自独立、互不依赖，模拟三团队各自仓库。每个物料接收 `config` prop 渲染自己的业务数据，并通过 `widget-bus` 发出业务事件。

### 2. 在 `demo/vue3-host` 新增「交叉页面」视图

- `demo/vue3-host/src/App.vue` 新增一个 `crossPage` 视图区（或在主看板下方加一个「交叉页面演示」section），同时挂载三个物料到同一页面。
- 标注每个物料的「维护团队」与「技术栈」，直观体现业务解耦。
- 三个物料的事件（如订单点击、支付成功、推荐曝光）汇聚到基座日志区，体现跨物料通信。

### 3. 物料构建与产物

- `bi-orders-panel`：在 `demo/vue2-widget-lib` 加组件 + 构建配置，产物 `bi-orders-panel.js`。
- `bi-payment-panel`：在 `demo/vue3-widget-lib` 加组件 + 构建配置，产物 `bi-payment-panel.js`。
- `bi-recommend-panel`：在 `demo/h5-widget-lib` 加组件（原生 JS Custom Element），产物 `bi-recommend-panel.js`。
- 三个产物复制到 `demo/vue3-host/public/widgets/`。
- 注册到 `demo/vue3-host/src/widgetRegistry.js`。

### 4. 不改动部分

- 不改动既有物料（filter-bar / data-source 等保持原样）。
- 不改动 vue2-host（交叉页面 demo 集中在 vue3-host，避免分散）。
- 不引入新的运行时依赖。

## Impact

- Affected code:
  - `demo/vue2-widget-lib/src/components/OrdersPanel.vue`（新增）
  - `demo/vue2-widget-lib/src/main.js`（注册新组件入口，或通过环境变量切换）
  - `demo/vue2-widget-lib/vue.config.js`（支持多入口构建，或单独 build 命令）
  - `demo/vue3-widget-lib/src/components/PaymentPanel.vue`（新增）
  - `demo/vue3-widget-lib` 构建配置
  - `demo/h5-widget-lib/src/recommend-panel.js`（新增）
  - `demo/h5-widget-lib` 构建配置
  - `demo/vue3-host/src/widgetRegistry.js`（注册 3 物料）
  - `demo/vue3-host/src/App.vue`（新增交叉页面视图区）
  - `demo/vue3-host/public/widgets/`（产物）
- 不影响 `wc/` 核心代码与单测。

## ADDED Requirements

### Requirement: 三业务域物料独立存在
The demo SHALL include three widgets representing distinct business domains (orders / payment / recommendation), each built from a different tech stack (Vue2 / Vue3 / native H5), each emitting its own business events via widget-bus.

#### Scenario: 交叉页面渲染
- **WHEN** 访问 vue3-host 交叉页面视图
- **THEN** 同一页面同时显示订单区、支付区、推荐区三个物料，各自独立渲染。

### Requirement: 跨物料事件汇聚
The three widgets SHALL emit business events (e.g. `order:click`, `payment:success`, `recommend:expose`) via widget-bus, and the host log panel SHALL display them, demonstrating cross-widget communication across tech stacks.

#### Scenario: 点击订单区
- **WHEN** 用户点击订单物料中的某条订单
- **THEN** 基座日志区出现 `[order:click]` 事件记录。

### Requirement: 三技术栈共存
The cross-page demo SHALL load Vue2 orders widget, Vue3 payment widget, and native H5 recommendation widget on the same page, proving tech inclusivity (no forced unified stack).

#### Scenario: 三物料同页加载
- **THEN** 三物料均成功挂载，无版本冲突错误（vue3-host 同时提供 Vue2/Vue3 运行时）。

## Non-Goals

- 不实现真实订单/支付/推荐业务逻辑（用 mock 数据即可）。
- 不做物料嵌套（已有专门测试覆盖，本 demo 聚焦交叉页面）。
- 不改 vue2-host。
- 不接入 UI 组件级按需加载（P1 另一项，本 demo 用基座现有 ElementUI 注册即可）。
