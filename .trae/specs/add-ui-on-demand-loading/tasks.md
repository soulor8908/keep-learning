# 任务清单：UI 组件级按需加载

> change-id: `add-ui-on-demand-loading`
> 依赖：T1（扫描）→ T3（预加载）依赖 T1 产出；T2（loader 工具）可与 T1 并行；T4 测试依赖 T1/T3。

## T1 schema-generator 扫描 uiDependencies

文件：`wc/schema-generator/index.js`

- [ ] T1.1 新增 `extractUiDependencies(source)`：正则扫描 `<template>` 内 `<el-([a-z-]+)` 标签，收集组件名（去 `el-` 前缀），去重返回 `string[]`。注意排除注释中的标签、排除闭合标签 `</el-`。
- [ ] T1.2 在 `generateSchema(widgetName, componentPath, options)` 中调用 `extractUiDependencies`，若结果非空：
  - `lib`：`options.uiLib` 优先，否则按 `options.vueVersion` 推断（`'2'→'element-ui'`、`'3'→'element-plus'`，默认 `'3'`）。
  - `version`：`options.uiVersion` 优先，否则 `element-ui→'^2.15.0'`、`element-plus→'^2.7.0'`。
  - `styles`：默认 `['base']`。
  - 写入 `schema.uiDependencies`。
- [ ] T1.3 若扫描结果为空，不写 `uiDependencies` 字段（保持 schema 与旧版一致）。
- [ ] T1.4 导出 `extractUiDependencies` 供单独测试。
- [ ] T1.5 向后兼容：`options.vueVersion`/`uiLib` 未传时不报错，按默认 `'3'` 推断。

## T2 widget-loader 增加资源解析与注册工具

文件：`wc/widget-loader/index.js`

- [ ] T2.1 新增 `defaultResolveUiResource(cdnBase, lib, version, component, type)`：返回 `{cdnBase}/ui/{lib}@{version}/{component}.{js|css}`，`type` 为 `'js'`/`'css'`。
- [ ] T2.2 新增 `defaultResolveFullResource(cdnBase, lib, version, type)`：返回 `{cdnBase}/ui/{lib}@{version}/full.{js|css}`。
- [ ] T2.3 新增 `registerUiComponent(lib, componentName, VueRuntime)`：把加载到的组件注册到 Vue 运行时。Vue2 用 `VueRuntime.component('el-'+componentName, comp)`；Vue3 同理。组件从 `window.__UI_ELEMENT_UI__[componentName]` / `window.__UI_ELEMENT_PLUS__[componentName]` 读取（IIFE 全局挂载约定）。
- [ ] T2.4 这三个工具函数为纯函数/可单测，不依赖 DOM 加载。

## T3 widget-loader 新增 preloadUiDependencies

文件：`wc/widget-loader/index.js`

- [ ] T3.1 新增导出 `preloadUiDependencies(widgets, options)`：
  - `options.cdnBase`（必填）、`options.resolveUiResource`（可选，覆盖默认）、`options.Vue2Runtime`/`options.Vue3Runtime`（可选，默认 `window.Vue2`/`window.Vue3`）。
- [ ] T3.2 收集阶段：遍历 widgets，读取 `widget.schema?.uiDependencies`（widget 无 schema 或无 uiDependencies 则跳过）。按 `lib` 分组，合并 `components` 到 `Set`。
- [ ] T3.3 校验阶段：对每个有 uiDependencies 的 widget，校验 `lib` 与 `widget.vueVersion` 匹配（`element-ui`↔`'2'`、`element-plus`↔`'3'`、`vueVersion='none'` 不允许有 uiDependencies）。不匹配抛 `code='UI_DEP_LIB_MISMATCH'`。
- [ ] T3.4 加载阶段：
  - 若某组 `full===true`：加载 `full.js`+`full.css`，跳过 per-component。
  - 否则对去重后每个 component 生成 js+css URL，复用 `loadedResources` Map 去重，`Promise.all` 并行。
  - 单组件失败：重试 1 次（重新 `loadScript`/`loadStyle`，因失败时 cache 已 delete）。仍失败：记录到 `failedComponents` 数组，不 reject 整体 Promise。
- [ ] T3.5 注册阶段：加载成功的组件调 `registerUiComponent` 注册到对应 Vue 运行时。
- [ ] T3.6 返回值：`{ loaded: string[], failed: {lib,component,reason}[] }`。
- [ ] T3.7 `loadedResources` 复用：UI 资源与物料资源共享同一 Map（不新建独立 Map），确保跨物料/UI 去重一致。

## T4 单元测试

文件：`wc/schema-generator/__tests__/uiDependencies.test.js`、`wc/widget-loader/__tests__/preloadUiDependencies.test.js`

- [ ] T4.1 `extractUiDependencies`：含 `<el-card>` `<el-button>` `<el-table-column>` → `['card','button','table-column']`。
- [ ] T4.2 去重：`<el-card>` 出现两次 → `['card']`。
- [ ] T4.3 排除闭合标签与注释：`</el-card>` 与 `<!-- <el-card> -->` 不计入。
- [ ] T4.4 无 el-* → 返回 `[]`。
- [ ] T4.5 `generateSchema` 集成：`vueVersion:'3'` → `uiDependencies.lib='element-plus'`、`version='^2.7.0'`。
- [ ] T4.6 `generateSchema` 集成：`vueVersion:'2'` → `lib='element-ui'`。
- [ ] T4.7 无 el-* 时 schema 无 `uiDependencies` 字段。
- [ ] T4.8 `defaultResolveUiResource` URL 格式正确。
- [ ] T4.9 `preloadUiDependencies` 两物料共用 button 只加载一次（mock loadScript/loadStyle 计数）。
- [ ] T4.10 lib/vueVersion 不匹配抛 `UI_DEP_LIB_MISMATCH`。
- [ ] T4.11 `full:true` 只加载 full.js/full.css。
- [ ] T4.12 单组件失败重试 1 次后仍失败不阻断整体。
- [ ] T4.13 无 uiDependencies 的 widget 被跳过，不报错。

## T5 验收

- [ ] T5.1 `npm run test:run` 全绿（含新测试）。
- [ ] T5.2 既有 69 个测试不回归。
- [ ] T5.3 demo 不被破坏（`wc/` 源码改动仅限 schema-generator 与 widget-loader 新增函数，不改动既有导出签名）。
