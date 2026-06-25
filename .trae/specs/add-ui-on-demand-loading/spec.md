# UI 组件级按需加载 Spec

## Why

当前基座（`demo/vue2-host`、`demo/vue3-host`）对 ElementUI / ElementPlus 的处理是「按需 import + 全量注册到 app」——只要某个物料用到 `<el-card>`，基座就把已 import 的全部组件注册到 Vue 运行时。这违背 README 承诺的「按需加载：页面用到哪个物料才加载，不影响首屏性能」原则：

- 物料用到的 UI 组件没有精准声明，基座无法做 per-component 懒加载。
- 随着物料增多，基座 import 的 Element 组件列表只增不减，首屏体积膨胀。
- `docs/elementui-on-demand-loading.md` 已有完整设计（`uiDependencies` 字段 + `schema-generator` 扫描 + 基座 `preloadUiDependencies`），但标注「不在本任务中落地到源码」，仅停留在设计态。

本 Spec 落地设计的**核心可执行子集**：构建期扫描 + 运行时预加载协议，使「物料声明用了哪些 UI 组件 → 基座按声明精准加载」链路打通。自建 per-component bundle 构建器（`ui-bundle-builder`）属后续阶段，本 Spec 用「manifest 驱动 + 既支持自建 CDN 也支持直连官方 CDN」的可插拔资源解析器先打通链路。

## What Changes

### 1. `schema-generator` 增加 `uiDependencies` 自动扫描

- 新增函数 `extractUiDependencies(source)`：扫描 `.vue` 文件 `<template>` 内所有 `<el-*>` 标签，去前缀去重，返回 `string[]`。
- `generateSchema` 在产出 schema 时，若扫描到非空组件列表，自动写入 `uiDependencies.components`；`lib`/`version` 由调用方通过 `options.uiLib` / `options.uiVersion` 传入（默认按 `options.vueVersion` 推断：`'2'→element-ui/^2.15.0`、`'3'→element-plus/^2.7.0`）。
- 物料无 `<el-*>` 时不写 `uiDependencies` 字段（基座跳过预加载）。
- 已知局限（写入文档，不阻断）：动态组件 `<component :is="'el-button'">`、字符串渲染 `h('el-button')` 无法被正则扫描到，需物料作者手动补 `uiDependencies`。

### 2. `widget-loader` 新增 `preloadUiDependencies(widgets, options)`

- 读取每个 widget 关联的 `schema.uiDependencies`（schema 通过 widget 配置的 `schema` 字段或远程 `schemaUrl` 提供，本 Spec 仅支持 widget 配置内联 `schema` 对象，远程拉取属后续）。
- 按 `lib` 分组合并 `components` 到 `Set` 去重。
- 校验 `lib` 与 widget 的 `vueVersion` 匹配（Vue3 物料不能声明 `element-ui`），不匹配抛 `code='UI_DEP_LIB_MISMATCH'`。
- 通过可注入的 `resolveUiResource(lib, version, component, type)` 函数生成 JS/CSS URL（默认实现按设计文档的 `{cdnBase}/ui/{lib}@{version}/{component}.{ext}` 约定；调用方可注入自定义解析器以适配自建 CDN 或官方 CDN）。
- 复用既有 `loadedResources` Map 做 URL 级去重。
- 并行加载所有 JS+CSS，`Promise.all`；单组件失败重试 1 次，仍失败记录但不阻断其他组件。
- 加载完成后注册到对应 Vue 运行时（Vue2：`window.Vue2.component('el-xxx', comp)`；Vue3：`window.Vue3.component` 或基座 app）。
- 提供 `full: true` 短路：直接加载全量包 `{cdnBase}/ui/{lib}@{version}/full.js`。

### 3. 不改动的部分

- 不实现 `ui-bundle-builder`（自建 per-component IIFE bundle 的构建脚本）——这是独立大块工作，本 Spec 只打通加载链路，资源由调用方通过 `resolveUiResource` 注入或用默认约定路径。
- 不改基座 demo 的 ElementUI/Plus 注册逻辑（避免破坏现有 demo 运行）——`preloadUiDependencies` 作为可选增强，基座可选择调用。
- 不实现远程 `schemaUrl` 拉取。

## Impact

- Affected specs: 与 `design-elementui-on-demand-loading`（设计态）互补，本 Spec 是其可执行子集的落地。
- Affected code:
  - `wc/schema-generator/index.js`：新增 `extractUiDependencies`，`generateSchema` 集成。
  - `wc/widget-loader/index.js`：新增 `preloadUiDependencies` 导出。
  - 新增测试：`wc/schema-generator/__tests__/uiDependencies.test.js`、`wc/widget-loader/__tests__/preloadUiDependencies.test.js`。
  - 不修改任何 demo 源码、不修改既有 widget-wrapper-plugin（plugin 调用 `generateSchema` 时透传 `vueVersion` 即可，向后兼容）。
- 向后兼容：`uiDependencies` 是 schema 新增可选字段；`preloadUiDependencies` 是新增导出函数，不调用则无任何影响。

## ADDED Requirements

### Requirement: schema-generator 扫描 uiDependencies
The `generateSchema` function SHALL detect `<el-*>` tags in the component template and populate `schema.uiDependencies.components` with de-prefixed, de-duplicated component names.

#### Scenario: 物料含 <el-card> 与 <el-button>
- **WHEN** 调用 `generateSchema('bi-x', './Comp.vue', { vueVersion: '3' })`，组件模板含 `<el-card>` 与 `<el-button>`
- **THEN** `schema.uiDependencies.lib === 'element-plus'`，`schema.uiDependencies.components` 含 `'card'` 与 `'button'`（去前缀、去重）。

#### Scenario: 物料无 el-* 标签
- **WHEN** 组件模板不含任何 `<el-*>`
- **THEN** schema 不含 `uiDependencies` 字段。

#### Scenario: vueVersion='2' 推断 element-ui
- **WHEN** `generateSchema(..., { vueVersion: '2' })`
- **THEN** `uiDependencies.lib === 'element-ui'`，`version === '^2.15.0'`。

### Requirement: preloadUiDependencies 收集去重
The `preloadUiDependencies` function SHALL group widgets by `lib`, merge their `components` into a de-duplicated Set, and load each unique component's JS+CSS exactly once per URL.

#### Scenario: 两物料共用 button
- **WHEN** widget A 与 widget B 都声明 `uiDependencies.components=['button','card']`
- **THEN** `button` 与 `card` 各只发一次 JS 请求与一次 CSS 请求（复用 loadedResources）。

### Requirement: lib 与 vueVersion 不匹配抛错
The function SHALL throw `code='UI_DEP_LIB_MISMATCH'` when a widget declares `element-ui` but `vueVersion==='3'`, or vice versa.

#### Scenario: Vue3 物料声明 element-ui
- **WHEN** `widget.vueVersion='3'` 且 `uiDependencies.lib='element-ui'`
- **THEN** 抛错，`err.code==='UI_DEP_LIB_MISMATCH'`。

### Requirement: 资源解析器可注入
The function SHALL accept an optional `resolveUiResource(lib, version, component, type)` returning a URL string; when not provided, default to `{cdnBase}/ui/{lib}@{version}/{component}.{js|css}`.

#### Scenario: 默认解析器
- **WHEN** 不传 `resolveUiResource`，`cdnBase='https://cdn.x.com'`，加载 `element-plus@2.7.0` 的 `button`
- **THEN** JS URL = `https://cdn.x.com/ui/element-plus@2.7.0/button.js`。

### Requirement: full 短路
When `uiDependencies.full === true`, the function SHALL load only `{cdnBase}/ui/{lib}@{version}/full.js` and skip per-component loading.

## Non-Goals

- 不实现 `ui-bundle-builder` 构建脚本。
- 不改 demo 基座的 ElementUI 注册（保持 demo 可运行）。
- 不实现远程 `schemaUrl` 拉取。
- 不处理 `<component :is>` / `h('el-xxx')` 动态组件扫描（已知局限，文档说明）。
- 不做主题变量系统（属独立 Spec）。
