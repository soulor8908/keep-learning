# 任务清单：扁平化 Props 传递 — 移除 config 兼容层

> change-id: `flatten-props-drop-config`

## T1 手写包装层去 config（Vue2/Vue3）

- [ ] T1.1 `wc/vue2-widget-template/widget-wrapper.js`：删 `parseConfig` 导出、`declaresConfig`、`widgetConfig` data、`observedAttributes` 中 `'config'`、`attributeChangedCallback` config 分支、render 中 `props.config` 条件注入。改为 `data.widgetProps = this._collectProps()`，render 传 `{ ...this.widgetProps, scope: this.widgetScope }`；attributeChangedCallback 更新 `widgetProps`。保留 `getPropType`/`parseAttrValue`/`camelToKebab`/`getDeclaredPropNames`/`createWidgetWrapper` 导出/scope/shadowRoot 守卫。
- [ ] T1.2 `wc/vue3-widget-template/widget-wrapper.js`：删模块私有 `parseConfig`、`_configRef`、`_updateConfig`、`observedAttributes` 中 `'config'`、config 分支。改为 `_propsRef = ref(this._collectProps())`，render 传 `{ ...this._propsRef.value, scope }`；attributeChangedCallback 更新 `_propsRef.value`。保留其余。
- [ ] T1.3 确认 `getPropType` 对简写 props（`title: String`）仍正确返回构造器；`observedAttributes` 不含 `scope`。

## T2 H5 包装层去 config + 重命名

- [ ] T2.1 `wc/h5-widget-template/widget-wrapper.js`：删 `_parseConfig`、`_buildMergedConfig` 的 config 基底、`observedAttrs` 中 `'config'`。新增 `_collectProps()` 仅从声明 prop 属性收集。`_config`→`_props`；`render(this._props, this._scope)`；`opts.onConfigChange`→`opts.onPropsChange(element, newProps, oldProps, scope)`；`getConfig()`→`getProps()`。更新文件头注释（render(config)→render(props)、移除 config attribute 协议描述）。

## T3 构建插件生成模板去 config

- [ ] T3.1 `wc/widget-wrapper-plugin/vue-cli-plugin.js` `generateVue2Wrapper`：删 `parseConfig`/`['config']`/`widgetConfig`/config 分支。改为运行时读 `Component.props` 发现 prop 名 → `observedAttributes` 为 kebab-case prop 名 → `_collectProps` → render 传 `{ ...props, scope }`。保留 ignoredElements/scope/生命周期。
- [ ] T3.2 `wc/widget-wrapper-plugin/vite-plugin.js` `generateVue3Wrapper`：删 `parseConfig`/`_configRef`/`_updateConfig`/`['config']`/config 分支。改为 `_propsRef`/`_collectProps` props-only。
- [ ] T3.3 `wc/widget-wrapper-plugin/h5-vite-plugin.js` `generateH5Wrapper`：删 `parseConfig`/`['config']`/`_config`/config 分支。改为 `_collectProps`/`render(props, scope)`/`onPropsChange`/`getProps`。
- [ ] T3.4 确认三套生成模板与对应手写模板运行时逻辑一致（props 发现、parseAttrValue、scope 注入）。

## T4 加载器 + i18n + 声明式 runtime

- [ ] T4.1 `wc/widget-loader/index.js`：`renderWidget` 删 `config = {}`/`configStr`/`setAttribute('config', ...)`，仅写 props kebab attribute（序列化规则不变）。`WidgetError.CONFIG_ERROR`→`PROPS_ERROR`；两处 `createError(...CONFIG_ERROR)` 改 `PROPS_ERROR`；错误消息 i18n key 改 `loader.props_serialize_failed`。
- [ ] T4.2 `wc/i18n/locales/zh.js`、`en.js`：删 `config_serialize_failed`，新增 `props_serialize_failed`（中：`物料 "{name}" props 序列化失败（可能含循环引用）`；英对应）。
- [ ] T4.3 `wc/widget-declarative-plugin/runtime.js`：`widgetMount(meta, container, props)` 第三参改名；删 post-hoc `setAttribute('config', ...)`；把 `props` 合并进传给 `mountWidget` 的物料对象。

## T5 迁移工具 + AI 提示词

- [ ] T5.1 `wc/migration-skill/index.js`：删 `--mode` 解析/校验、`addConfigProp`、`hasConfigProp`、config 分支。`migrate(widgetName, filePath, vueVersion)` 去 mode 参数，始终 props 模式。report 去 `mode` 字段，changes 文案去"props 模式"前缀。更新文件头注释。
- [ ] T5.2 删 fixture `wc/migration-skill/__tests__/fixtures/has-config-component.vue`。
- [ ] T5.3 `wc/ai-assistant/prompts/migrate-component.txt`：第 3 条重写为 props-only（保留原有 props、宿主独立 attribute 传入、禁止新增 config prop）。删双模/混用说明。

## T6 Demo 物料源码 config→扁平 props

- [ ] T6.1 Vue2 widget-lib：`SalesPanel.vue`（props: title/currency/period/showTrend，模板 `config.x`→`x`）、`ChartPanel.vue`（title/chartType）、`OrdersPanel.vue`（title/orders）、`FilterBar.vue`（title/filters）。
- [ ] T6.2 Vue3 widget-lib：`FinancePanel.vue`（title/currency/showBreakdown）、`PaymentPanel.vue`（title/amount/methods）、`bi-metric-cards.vue`（title/cards）、`bi-data-source.vue`（title/metrics/refreshInterval）、`bi-crash-tester.vue`（去 config，无 props）。
- [ ] T6.3 H5 widget-lib：`recommend-panel.js`（props: title/items）、`clock-card.js`（props: timezone/label，`onPropsChange`）、`notice-board.js`（title/items）。
- [ ] T6.4 模板示例：`wc/vue2-widget-template/example/SalesPanel.vue`（title）、`wc/vue3-widget-template/example/FinancePanel.vue`（title/showChart/progress/progressStatus）。
- [ ] T6.5 本地预览入口：`demo/vue2-widget-lib/src/main.js`、`demo/vue3-widget-lib/src/main.js` 内联 wrapper 改 props-only（含 `widget:loaded` emit 去 config）。

## T7 基座注册表 + App

- [ ] T7.1 `demo/vue2-host/src/widgetRegistry.js`、`demo/vue3-host/src/widgetRegistry.js`：每条 `config: {...}` → `props: {...}`（扁平键，字段名与 T6 物料 props 对齐）。
- [ ] T7.2 验证 `demo/vue2-host/src/App.vue`、`demo/vue3-host/src/App.vue` 仅透传 widget 对象，无需改（若 emit payload 引用 config 则同步改 props）。

## T8 构建产物刷新

- [ ] T8.1 在 `demo/vue2-widget-lib`、`demo/vue3-widget-lib`、`demo/h5-widget-lib`（若存在）执行 `npm install && npm run build`，刷新 `demo/vue2-host/public/widgets/*.js`、`demo/vue3-host/public/widgets/*.js`。若构建环境不可用，记录为手动 follow-up，不阻塞测试。

## T9 测试重写为 props-only

- [ ] T9.1 `wc/vue2-widget-template/__tests__/wrapper.test.js`：删 parseConfig/config/_configRef 用例，改 props-only（observedAttributes from props、_collectProps、attributeChangedCallback 更新 props）。
- [ ] T9.2 `wc/vue3-widget-template/__tests__/wrapper.test.js`：同 T9.1。
- [ ] T9.3 `wc/vue2-widget-template/__tests__/props-mode.test.js`、`wc/vue3-widget-template/__tests__/props-mode.test.js`：删"混用"/"向后兼容兜底"用例，保留纯 props 用例。
- [ ] T9.4 `wc/h5-widget-template/__tests__/wrapper.test.js`：删"config 变化与解析容错"块，重写 props 块，`getConfig`→`getProps`、`onConfigChange`→`onPropsChange`。
- [ ] T9.5 `wc/widget-loader/__tests__/renderWidget.test.js`：删 config 模式用例，保留 props 用例，`CONFIG_ERROR`→`PROPS_ERROR`。
- [ ] T9.6 `wc/migration-skill/__tests__/migrate.test.js`：删 hasConfigProp/addConfigProp/config 模式用例，保留 addRootClass + migrate（props-only），report 去 mode 断言。
- [ ] T9.7 `wc/ai-assistant/__tests__/cli.test.js`：提示词断言改 props-only（不再含 `config 模式`/`双模`）。
- [ ] T9.8 `wc/__tests__/props-integration.test.js`：删混用/向后兼容用例，保留纯 props E2E。
- [ ] T9.9 `wc/widget-wrapper-plugin/__tests__/wrapper-generation.test.js`：断言改 props-only 生成（observedAttributes 来自 Component.props、无 parseConfig、无 `['config']`、无 config 分支；H5 `render(props, scope)`/`getProps`/`onPropsChange`）。
- [ ] T9.10 `wc/i18n/__tests__/i18n.test.js`：若有 `config_serialize_failed` 断言，改 `props_serialize_failed`。
- [ ] T9.11 检查 `wc/__stubs__/vue.js` 是否有 config 相关存根需清理。

## T10 文档重写为 props-only

- [ ] T10.1 `README.md`：最小改造行、业务组件改什么、AI 迁移、注册表示例 → props-only。
- [ ] T10.2 `wc/README.md`：§1.3 通讯协议改 props-only、三种包装层差异表、§3.1 去 `--mode`、§六 mountWidget 示例。
- [ ] T10.3 `demo/README.md`：包装层示例、mountWidget、schema 示例去 config。
- [ ] T10.4 `demo/ai-migration-demo/README.md`：去双模/混用/向后兼容，改 props-only 流程。
- [ ] T10.5 `.trae/skills/wc-migration/SKILL.md`：去双模/`--mode`/通讯模式选择/三种 mountWidget 示例 → props-only。
- [ ] T10.6 `wc/ARCHITECTURE_COMPARISON.md`、`demo/h5-widget-lib/README.md`、`agent.md`：去 config attribute 协议描述。

## T11 验收

- [ ] T11.1 `npx vitest run` 全绿，既有用例不被破坏（除明确删除的 config 用例外）。
- [ ] T11.2 全仓 grep 不再出现 config 通讯模式残留（`setAttribute('config'`、`getAttribute('config'`、`parseConfig`、`CONFIG_ERROR`、`config_serialize_failed`、`--mode config`、`addConfigProp`、`hasConfigProp`、`onConfigChange`、`getConfig`、`_configRef`、`widgetConfig`、`declaresConfig`）—— 仅允许在历史 spec 文档与本 spec 内出现。
- [ ] T11.3 `demo/ai-migration-demo` 一次性迁移 demo 仍可跑通（migration-skill props-only）。
- [ ] T11.4 构建产物已刷新或已记录 follow-up。
