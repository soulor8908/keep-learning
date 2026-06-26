# 扁平化 Props 传递 — 移除 config 兼容层 Spec

> change-id: `flatten-props-drop-config`

## Why

当前宿主↔物料通讯同时维护 `config` 与 `props` 两套协议：`config` 把整包配置对象序列化为单个 `config` HTML attribute，包装层 `JSON.parse` 还原；`props` 把每个 prop 拆为独立 kebab-case attribute。两套协议在三层包装层、加载器、迁移工具、AI 提示词、demo 物料、注册表、测试与文档中重复出现，带来：

1. **运行时开销**：每个物料实例都无条件序列化/反序列化 `config` 字符串，即使组件根本不声明 `config` prop（loader 仍写 `config='{}'`，包装层仍把它放进 `observedAttributes` 并 parse）。
2. **类型安全弱**：`config: Object` 是无 schema 的黑盒，组件内 `config.title` / `config.foo.bar` 任取字段，无声明、无默认值、无类型约束，重构易错。
3. **代码冗余**：三套包装层各维护 `parseConfig` / `_configRef` / `declaresConfig` / config 分支；加载器维护 `configStr` + `CONFIG_ERROR`；迁移工具维护 `--mode` / `addConfigProp` / `hasConfigProp`；提示词维护双模说明。
4. **心智负担**：新人需理解"何时用 config、何时用 props、能否混用"。

**项目尚未上线，无需兼容旧 config 模式。** 本变更直接全面切换到扁平化 props，移除 config 兼容层，大幅简化代码、减少运行时开销、提升类型安全（每个字段都是显式声明的 prop，有类型与默认值）。

## What Changes

### 1. 三套包装层运行时（手写模板）

- `wc/vue2-widget-template/widget-wrapper.js`、`wc/vue3-widget-template/widget-wrapper.js`：删除 `parseConfig`、`_configRef`/`widgetConfig`、`declaresConfig`、`observedAttributes` 中的 `'config'`、`attributeChangedCallback` 的 config 分支。`observedAttributes` 仅保留组件声明的独立 prop 的 kebab-case 名（排除 `scope`）。Vue2 用 `data.widgetProps = this._collectProps()` 承载，render 传 `{ ...widgetProps, scope }`；Vue3 用 `_propsRef = ref(this._collectProps())`，render 传 `{ ..._propsRef.value, scope }`。保留 `getPropType`（含简写 props 修复）、`parseAttrValue`、`camelToKebab`、`getDeclaredPropNames`、`createWidgetWrapper` 导出、scope 注入、shadowRoot 守卫。
- `wc/h5-widget-template/widget-wrapper.js`：删除 `_parseConfig`、`_buildMergedConfig` 的 config 基底、`observedAttrs` 中的 `'config'`。新增 `_collectProps()` 仅从声明的 prop 属性收集。render 签名改为 `render(props, scope)`；`onConfigChange` 选项改名为 `onPropsChange(element, newProps, oldProps, scope)`；`getConfig()` 改名为 `getProps()`。内部 `_config` → `_props`。

### 2. 构建插件生成的 wrapper（vue-cli-plugin / vite-plugin / h5-vite-plugin）

三个 `generateXxxWrapper` 模板字符串当前是 **config-only**（滞后于手写模板）。统一改造为 **props-only**，与手写模板运行时逻辑对齐：运行时读取 `Component.props` 发现 prop 名 → `observedAttributes` 仅含 kebab-case prop 名 → `parseAttrValue` 按类型解析 → 注入独立 props + scope。删除模板内的 `parseConfig` / `['config']` / `_configRef` / config 分支。H5 生成模板同步 `render(props, scope)` / `onPropsChange` / `getProps`。

### 3. 基座加载器 `wc/widget-loader/index.js`

- `renderWidget(container, { name, props })`：删除 `config = {}` 默认值、`configStr`、`element.setAttribute('config', ...)`。仅写独立 prop 的 kebab-case attribute（序列化规则不变：`true`→空串、`false`→`"false"`、`null/undefined`→removeAttribute、string→原样、number/object/array→JSON.stringify）。
- `WidgetError.CONFIG_ERROR` → `PROPS_ERROR`（props 序列化失败，如循环引用）。i18n key `loader.config_serialize_failed` → `loader.props_serialize_failed`，同步更新 `wc/i18n/locales/zh.js` / `en.js`。

### 4. 声明式运行时 `wc/widget-declarative-plugin/runtime.js`

`widgetMount(meta, container, props)`：第三参数由 `config` 改名为 `props`；不再 post-hoc `setAttribute('config', ...)`，而是把 `props` 合并进传给 `loader.mountWidget` 的物料对象，由 `renderWidget` 统一写 attribute。

### 5. 迁移工具 `wc/migration-skill/index.js`

删除 `--mode` 标志、`addConfigProp`、`hasConfigProp`、config 模式分支。`migrate(widgetName, filePath, vueVersion)`（去掉 mode 参数）始终 props 模式：保留原有 props、加根类名、跑 css/js 扫描、输出打包配置。report 去掉 `mode` 字段。删除 fixture `has-config-component.vue`。

### 6. AI 提示词 `wc/ai-assistant/prompts/migrate-component.txt`

重写第 3 条为 props-only：保留组件原有 props 不变，宿主通过独立 kebab-case attribute 传入，包装层按声明类型解析注入；**禁止新增 config prop**。删除双模 / 混用说明。

### 7. Demo 物料源码（全部 config prop → 扁平 props）

- Vue2 widget-lib：`SalesPanel.vue`（title/currency/period/showTrend）、`ChartPanel.vue`（title/chartType）、`OrdersPanel.vue`（title/orders）、`FilterBar.vue`（title/filters）。
- Vue3 widget-lib：`FinancePanel.vue`（title/currency/showBreakdown）、`PaymentPanel.vue`（title/amount/methods）、`bi-metric-cards.vue`（title/cards）、`bi-data-source.vue`（title/metrics/refreshInterval）、`bi-crash-tester.vue`（去掉 config，无 props）。
- H5 widget-lib：`recommend-panel.js`（props: title/items）、`clock-card.js`（props: timezone/label，`onPropsChange`）、`notice-board.js`（props: title/items）。
- 模板示例：`wc/vue2-widget-template/example/SalesPanel.vue`（title）、`wc/vue3-widget-template/example/FinancePanel.vue`（title/showChart/progress/progressStatus）。
- 本地预览入口内联 wrapper：`demo/vue2-widget-lib/src/main.js`、`demo/vue3-widget-lib/src/main.js` 改为 props-only 内联 wrapper（或直接复用 wc 模板逻辑）。

### 8. 基座注册表与 App

- `demo/vue2-host/src/widgetRegistry.js`、`demo/vue3-host/src/widgetRegistry.js`：每条物料的 `config: {...}` → `props: {...}`（扁平键）。
- `demo/vue2-host/src/App.vue`、`demo/vue3-host/src/App.vue`：仅透传 widget 对象给 `mountWidget`，无需改动（验证）。

### 9. 构建产物刷新

`demo/vue2-host/public/widgets/*.js`、`demo/vue3-host/public/widgets/*.js` 为编译产物，需在 widget-lib 改造后重新 `npm run build` 刷新（若构建环境可用；否则记录为手动 follow-up，不阻塞测试）。

### 10. 测试

重写所有 config 模式用例为 props-only：
- `wc/vue2-widget-template/__tests__/wrapper.test.js`、`wc/vue3-widget-template/__tests__/wrapper.test.js`：删 parseConfig/config observedAttributes/_configRef 用例，改 props-only。
- `wc/vue2-widget-template/__tests__/props-mode.test.js`、`wc/vue3-widget-template/__tests__/props-mode.test.js`：删"混用"/"向后兼容兜底"用例，保留纯 props 用例。
- `wc/h5-widget-template/__tests__/wrapper.test.js`：删"config 变化与解析容错"块，重写 props 块，`getConfig`→`getProps`、`onConfigChange`→`onPropsChange`。
- `wc/widget-loader/__tests__/renderWidget.test.js`：删 config 模式用例，保留 props 用例，`CONFIG_ERROR`→`PROPS_ERROR`。
- `wc/migration-skill/__tests__/migrate.test.js`：删 hasConfigProp/addConfigProp/config 模式用例，保留 addRootClass + migrate（props-only）。
- `wc/ai-assistant/__tests__/cli.test.js`：提示词断言改为 props-only。
- `wc/__tests__/props-integration.test.js`：删混用/向后兼容用例，保留纯 props E2E。
- `wc/widget-wrapper-plugin/__tests__/wrapper-generation.test.js`：断言改为 props-only 生成（observedAttributes 来自 Component.props、无 parseConfig、无 config 分支）。
- `wc/i18n/__tests__/i18n.test.js`：若有 `config_serialize_failed` 断言则同步更新为 `props_serialize_failed`。

### 11. 文档

重写为 props-only：`README.md`、`wc/README.md`、`demo/README.md`、`demo/ai-migration-demo/README.md`、`.trae/skills/wc-migration/SKILL.md`、`wc/ARCHITECTURE_COMPARISON.md`、`demo/h5-widget-lib/README.md`、`agent.md`。移除所有 config 模式 / 双模 / 混用 / `--mode` / `CONFIG_ERROR` 描述。

## Scope

### In Scope
- 三套手写包装层 + 三套构建插件生成模板：config → props-only。
- 加载器 renderWidget + WidgetError + i18n key：去 config。
- 声明式 runtime、迁移工具、AI 提示词：去 config / 去 `--mode`。
- 全部 demo 物料源码（Vue2/Vue3/H5 + 模板示例 + 本地预览入口）config prop → 扁平 props。
- 两个基座注册表 config → props。
- 全部相关测试重写为 props-only。
- 全部相关文档重写为 props-only。
- 构建产物刷新（best-effort，依赖构建环境）。

### Non-Goals
- 不改 widget-bus / widget-scope / widget-context / schema-generator / widget-registry 的核心逻辑（schema-generator 无 config 特殊逻辑，自动适配）。
- 不改包装层的 light DOM / 禁用 Shadow DOM / scope 注入 / 版本契约 / 错误边界机制。
- 不改 `scope` 的注入方式（scope 仍是框架注入的独立 prop，与业务 props 区分）。
- 不引入 TypeScript（"类型安全"指 prop 显式声明 + 默认值带来的约束，非 TS 化）。
- 不重写已编译产物的内部结构（仅通过 rebuild 刷新）。

## ADDED Requirements

### Requirement: 包装层仅观察独立 props
The wrapper SHALL observe only the component's declared individual props (kebab-case) as attributes, and SHALL NOT observe or parse a `config` attribute.

#### Scenario: 组件声明独立 props
- **WHEN** 组件声明 `props: { title: String, maxCount: Number }`（无 config）
- **THEN** `observedAttributes` 为 `['title', 'max-count']`，不含 `'config'`

#### Scenario: 宿主传独立 props
- **WHEN** 宿主写 `<bi-xxx title="hello" max-count="5">`
- **THEN** 组件收到 `title='hello'`、`maxCount=5`，且 `vnode.props` 不含 `config` 键

### Requirement: 加载器仅写 props attribute
`renderWidget` SHALL serialize `widget.props` as individual kebab-case attributes and SHALL NOT write a `config` attribute.

#### Scenario: props 模式加载
- **WHEN** `renderWidget(container, { name, props: { title: 'a', count: 5, on: true, off: false, obj: {x:1} } })`
- **THEN** 元素有 `title="a"`、`count="5"`、`on`（空串）、`off="false"`、`obj='{"x":1}'`，且无 `config` attribute

#### Scenario: props 序列化失败抛 PROPS_ERROR
- **WHEN** `props` 某值含循环引用
- **THEN** 抛 `WidgetError.PROPS_ERROR`，元素未挂载

### Requirement: H5 render 接收扁平 props
The H5 wrapper SHALL collect declared prop attributes into a flat `props` object and pass it to `render(props, scope)`; `getConfig`/`onConfigChange` are renamed to `getProps`/`onPropsChange`.

#### Scenario: H5 独立 props 收集
- **WHEN** `createH5Widget({ name, props: ['title','items'], render(props, scope) })` 且元素有 `title="t"` `items='[...]'`
- **THEN** render 收到 `{ title: 't', items: [...] }`，`getProps()` 返回该快照

## MODIFIED Requirements

### Requirement: 迁移工具仅支持 props 模式
`migration-skill` SHALL migrate components preserving their original props and SHALL NOT add a `config` prop. The `--mode` flag, `addConfigProp`, and `hasConfigProp` are removed.

#### Scenario: 迁移保留原有 props
- **WHEN** `migrate('bi-x', './Comp.vue', '2')`
- **THEN** 产物保留原有 props，仅加 `bi-x` 根类名，无新增 config prop；report 不含 `mode` 字段

## REMOVED Requirements

### Requirement: config attribute 协议
REMOVED. 包装层不再观察 `config` attribute；加载器不再写 `config` attribute；迁移工具不再支持 config 模式；`WidgetError.CONFIG_ERROR` 与 i18n key `loader.config_serialize_failed` 移除。组件不应再声明 `config` prop 接收宿主配置。
