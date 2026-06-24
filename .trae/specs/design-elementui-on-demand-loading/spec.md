# ElementUI 注册表驱动按需加载方案 Spec

## Why

在上一版策略中，推荐由基座全量注入 ElementUI。这虽然解决了物料重复打包和版本冲突问题，但会导致基座首屏加载大量未使用的组件，与项目"提高页面性能"的核心目标相冲突。因此需要设计一种更细粒度的按需加载机制：只看板上实际出现的 widget 需要哪些 UI 组件，就只加载那些组件。

## What Changes

- 在 `schema.json` / widget registry 中增加 `uiDependencies` 字段，声明每个 widget 所需的 ElementUI 组件清单。
- 设计 ElementUI 按组件分包的构建产物结构（如 `element-ui-chunks/button/index.css`、`element-plus-chunks/input/index.mjs`）。
- 扩展 `widget-loader` 或新增 `ui-loader`：基座在渲染 widget 前，根据注册表预加载该 widget 声明的 UI 组件 JS/CSS，并做全局去重缓存。
- 更新 `schema-generator`：在扫描 widget 源码时自动提取 `<el-*>` 组件标签，生成 `uiDependencies`。
- 提供回退策略：当组件缺失或加载失败时，允许降级到全量 ElementUI 或提示开发者补全声明。
- **BREAKING**: schema.json 结构新增字段；widget-loader 的加载管线需要新增 UI 依赖预加载阶段；物料打包配置需要输出或引用分包产物。

## Impact

- Affected specs: 所有涉及 schema、widget-loader、打包插件的变更
- Affected code:
  - `wc/schema-generator/index.js`（提取 `<el-*>` 标签生成 `uiDependencies`）
  - `wc/widget-loader/index.js`（新增 UI 依赖预加载逻辑）
  - `wc/widget-wrapper-plugin/vite-plugin.js` 与 `vue-cli-plugin.js`（配置 external / 分包引用）
  - `demo/vue2-host`、`demo/vue3-host`（注入按需加载的 chunk 加载器）
  - 新增 `wc/ui-loader/index.js`（可选独立模块）

## ADDED Requirements

### Requirement: Schema 声明 UI 依赖
The system SHALL allow each widget to declare which ElementUI components it uses via `schema.json`.

#### Scenario: 自动生成 schema
- **WHEN** `schema-generator` 扫描一个使用了 `<el-button>` 和 `<el-input>` 的 Vue 组件
- **THEN** 生成的 `schema.json` 包含 `"uiDependencies": ["element-plus/button", "element-plus/input"]`（或对应 Vue 2 路径）

### Requirement: UI 组件按组件分包
The system SHALL produce or reference ElementUI chunks that are split by component, so the host can load only the necessary pieces.

#### Scenario: 基座加载 button 组件
- **WHEN** 看板上出现一个依赖 button 的 widget
- **THEN** 基座只下载 button 组件的 JS/CSS，不加载 table、date-picker 等未使用组件

### Requirement: 基座根据注册表预加载 UI 依赖
The system SHALL preload UI dependencies declared in the widget registry before mounting the widget.

#### Scenario: 渲染 widget 前
- **WHEN** `widget-loader` 准备挂载某个 widget
- **THEN** 它先检查该 widget 的 `uiDependencies`，加载缺失组件，加载完成后再执行 mount

### Requirement: 组件级去重缓存
The system SHALL ensure that the same UI component is loaded only once even if multiple widgets depend on it.

#### Scenario: 多个 widget 使用同一组件
- **WHEN** widget A 和 widget B 都依赖 `<el-button>`
- **THEN** `el-button` 的 JS/CSS 只下载一次，并在两个 widget 间复用

### Requirement: 缺失依赖的降级处理
The system SHALL provide a fallback when a declared UI dependency is missing or fails to load.

#### Scenario: UI chunk 404
- **WHEN** 某个 UI 组件分包加载失败
- **THEN** 记录错误、渲染降级占位，并允许配置回退到全量 ElementUI 或阻止 widget 挂载

## MODIFIED Requirements

无

## REMOVED Requirements

无
