# Demo 重新设计：框架关键技术能力验证看板

> 本文档描述重新设计的 demo，覆盖 wc 框架全部 10 项关键技术能力的验证场景。

## 1. 目标

- 不考虑现有 demo，从零设计
- 覆盖全部 10 项关键技术能力：通讯、复杂对象传参、生命周期、slot、i18n、版本契约、错误边界、schema、unmount、样式穿透
- 看板式组织，物料间有真实交互
- 使用 ElementUI（vue2 用 element-ui，vue3 用 element-plus）

## 2. 物料清单

| # | 物料名 | 技术栈 | 验证能力 |
|---|---|---|---|
| 1 | bi-data-source | Vue3 | 通讯(emit)、复杂对象传参、生命周期 |
| 2 | bi-filter-bar | Vue2 | 通讯(双向)、i18n、config 变化响应 |
| 3 | bi-metric-cards | Vue3 | 复杂对象传参、slot(内部)、样式穿透 |
| 4 | bi-chart-panel | Vue2 | 通讯(接收)、版本契约、schema 生成 |
| 5 | bi-event-tester | 原生JS | 通讯、事件、unmountWidget |
| 6 | bi-crash-tester | Vue3 | 错误边界、降级、重试 |

## 3. 交互流程

筛选栏(物料2) → emit filter-change → 数据源(物料1) 更新 → emit data-updated → 指标卡(物料3)+图表(物料4) 刷新；事件测试器(物料5) 记录全程；崩溃测试器(物料6) 独立验证错误边界。

## 4. 能力覆盖矩阵

- 跨技术栈通讯：物料1↔2↔4↔5
- 复杂对象传参：物料1 config 嵌套数组对象
- 生命周期：基座 onWidgetLifecycle 监听全部
- slot：物料3 内部 `<slot name="extra">`
- i18n：物料2 onLocaleChange + addMessages
- 版本契约：物料4 在 vue3-host 中被拒绝
- 错误边界：物料6 主动崩溃
- schema：物料4 构建时生成
- unmount：物料5 挂载/卸载按钮
- 样式穿透：全部物料用 ElementUI
