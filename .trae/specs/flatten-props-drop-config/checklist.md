# 验收清单：扁平化 Props 传递 — 移除 config 兼容层

> change-id: `flatten-props-drop-config`

## 包装层（手写模板）
- [ ] vue2/vue3 widget-wrapper.js：`observedAttributes` 仅含组件声明 prop 的 kebab-case 名，不含 `'config'`
- [ ] vue2/vue3 widget-wrapper.js：无 `parseConfig` / `_configRef` / `widgetConfig` / `declaresConfig` / config 分支
- [ ] vue2 widget-wrapper.js：render 传 `{ ...widgetProps, scope }`，attributeChangedCallback 更新 `widgetProps`
- [ ] vue3 widget-wrapper.js：render 传 `{ ..._propsRef.value, scope }`，attributeChangedCallback 更新 `_propsRef.value`
- [ ] `getPropType` 对简写 props（`title: String`）仍正确返回构造器
- [ ] `createWidgetWrapper` 仍导出；scope 注入与 shadowRoot 守卫保留
- [ ] h5 widget-wrapper.js：`render(props, scope)` / `_collectProps` / `getProps` / `onPropsChange`，无 `_parseConfig` / config 基底

## 构建插件生成模板
- [ ] vue-cli-plugin `generateVue2Wrapper`：无 `parseConfig` / `['config']` / config 分支；运行时读 Component.props
- [ ] vite-plugin `generateVue3Wrapper`：无 `_configRef` / `_updateConfig` / config 分支；props-only
- [ ] h5-vite-plugin `generateH5Wrapper`：`render(props, scope)` / `onPropsChange` / `getProps`，无 `parseConfig` / `['config']`

## 加载器 / i18n / 声明式 runtime
- [ ] `renderWidget` 仅写 props kebab attribute，无 `setAttribute('config', ...)`
- [ ] `WidgetError.CONFIG_ERROR` 已删除，新增 `PROPS_ERROR`
- [ ] i18n `loader.config_serialize_failed` 已删除，新增 `loader.props_serialize_failed`（zh/en）
- [ ] `widget-declarative-plugin/runtime.js`：`widgetMount(meta, container, props)`，props 合并进物料对象，无 post-hoc setAttribute('config')

## 迁移工具 / AI 提示词
- [ ] migration-skill：无 `--mode` / `addConfigProp` / `hasConfigProp`；`migrate(name, file, ver)` 始终 props-only；report 无 mode 字段
- [ ] fixture `has-config-component.vue` 已删除
- [ ] migrate-component.txt：第 3 条 props-only，禁止新增 config prop，无双模/混用

## Demo 物料源码
- [ ] Vue2 widget-lib 4 个组件：config prop → 扁平 props（字段与注册表对齐）
- [ ] Vue3 widget-lib 5 个组件：config prop → 扁平 props（bi-crash-tester 无 props）
- [ ] H5 widget-lib 3 个组件：`render(props, scope)` + 声明 props + `onPropsChange`
- [ ] 模板示例 2 个：config prop → 扁平 props
- [ ] 本地预览入口 main.js：内联 wrapper props-only，`widget:loaded` emit 去 config

## 基座
- [ ] vue2-host / vue3-host widgetRegistry.js：`config` → `props`（扁平键）
- [ ] App.vue 仅透传，无 config 引用

## 构建产物
- [ ] public/widgets/*.js 已刷新，或已记录手动 follow-up

## 测试
- [ ] vue2/vue3 wrapper.test.js：props-only 用例通过
- [ ] vue2/vue3 props-mode.test.js：纯 props 用例通过（无混用/兜底）
- [ ] h5 wrapper.test.js：props-only 用例通过（getProps/onPropsChange）
- [ ] renderWidget.test.js：props-only 用例通过（PROPS_ERROR）
- [ ] migrate.test.js：props-only 用例通过（无 hasConfigProp/addConfigProp/config 模式）
- [ ] cli.test.js：提示词 props-only 断言通过
- [ ] props-integration.test.js：纯 props E2E 通过
- [ ] wrapper-generation.test.js：props-only 生成断言通过
- [ ] i18n.test.js：props_serialize_failed 断言（若有）通过

## 文档
- [ ] README.md / wc/README.md / demo/README.md / demo/ai-migration-demo/README.md：props-only
- [ ] SKILL.md / ARCHITECTURE_COMPARISON.md / h5-widget-lib README / agent.md：props-only

## 运行验收
- [ ] `npx vitest run` 全绿
- [ ] 全仓 grep 无 config 通讯模式残留（仅历史 spec 与本 spec 内允许）
- [ ] ai-migration-demo 一次性迁移 demo 仍可跑通
