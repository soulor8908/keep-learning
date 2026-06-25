# 构建期工具链单元测试 Spec

> change-id: `add-build-tooling-unit-tests`

## Why

物料打包链路有三类「守门员」模块目前完全无测试覆盖：

1. **widget-wrapper-plugin 三套插件 + postcss-namespace**：承担 external 公共依赖配置、临时 wrapper 文件生成、PostCSS 命名空间前缀注入、构建期检查调度、schema.json 自动生成。任何回归（external 漏配导致 vue 被重复打包、`GLOBAL_SELECTOR_PATTERNS` 白名单误改导致全局样式被加前缀、schema 字段缺失）都只能等物料构建后人工发现。
2. **构建期检查器四件套**：css-namespace-checker / js-risk-scanner / scoped-style-checker / dependency-analyzer。误报阻塞正常构建、漏报放行问题物料进生产，规则正则边界极易在调整时回归。
3. **widget-declarative-plugin**：babel-plugin 的 `$widget()` 宏 / `<Widget>` JSX 转换正确性直接决定业务代码能否运行；vite-plugin 的远程 registry 失败回退链若回归会导致构建期 meta 缺失。

这三类模块回归会直接阻塞物料构建或放行问题物料进生产，ROI 最高，优先补测试。

## What Changes

- 为 `wc/widget-wrapper-plugin/` 下 vue-cli-plugin / vite-plugin / h5-vite-plugin / postcss-namespace 补单元测试，覆盖：external 映射正确性、wrapper 文件生成结构、PostCSS 命名空间前缀注入（含 `@media`/`keyframes` 不拼接前缀的特殊分支与全局选择器白名单分支）、schema 字段完整性。
- 为 `wc/css-namespace-checker` / `wc/js-risk-scanner` / `wc/scoped-style-checker` / `wc/dependency-analyzer` 各补三组用例：通过用例（合规代码不报错）、拒收用例（问题代码被拦截）、边界用例（`@media` 嵌套、`keyframes`、动态 `document.cookie` 变体等）。
- 为 `wc/widget-declarative-plugin` 的 babel-plugin / vite-plugin / runtime 补测试：`$widget()` 调用转换、`<Widget>` JSX 转换、`.vue` script 块转换、远程 registry 三层回退链（远程→cacheFile→静态）、widgetMount 的 mount/unmount/config 更新。

## Scope

### In Scope
- 上述模块的纯函数 / 配置生成逻辑的单元测试。
- 必要时为提升可测性做最小重构（如把内联正则提为可导出常量、把 wrapper 文本生成提为独立可导出函数），但不改变对外行为。
- 复用既有 vitest + happy-dom 基础设施，不引入新测试框架。

### Non-Goals
- 不做端到端构建产物断言（除 h5-vite-plugin 已有 demo 可复用的轻量产物断言外）。
- 不改插件对外 API 与产物格式。
- 不改检查器的拦截规则语义（仅补测试 + 必要的可测性重构）。

## ADDED Requirements

### Requirement: wrapper-plugin external 映射正确性
The system SHALL be verified by tests that the three wrapper plugins correctly externalize public dependencies per tech stack.

#### Scenario: Vue2 物料 external
- **WHEN** 测试 vue-cli-plugin 生成的 webpack external 配置
- **THEN** vue / element-ui 被映射到 `window.Vue2` 等全局，不打入物料产物

#### Scenario: H5 物料无框架 external
- **WHEN** 测试 h5-vite-plugin 的 external 配置
- **THEN** 不 external 任何 vue，仅 external `wc-widget-scope`

### Requirement: PostCSS 命名空间前缀注入分支覆盖
The system SHALL be verified by tests that postcss-namespace injects prefixes correctly across all selector branches.

#### Scenario: 普通类选择器加前缀
- **WHEN** 输入 `.foo { }`
- **THEN** 输出 `.bi-xxx .foo { }`

#### Scenario: 全局选择器白名单不加前缀
- **WHEN** 输入 `html, body, :root` 等白名单选择器
- **THEN** 不拼接前缀

#### Scenario: @media / keyframes 内嵌不加前缀
- **WHEN** 输入 `@media (...) { .foo {} }` 或 `@keyframes x {}`
- **THEN** 选择器按规则处理，keyframes 名称不被破坏

### Requirement: 检查器通过/拒收/边界三组用例
The system SHALL be verified by tests that each checker correctly passes compliant code, rejects problematic code, and handles edge cases.

#### Scenario: css-namespace-checker 嵌套规则
- **WHEN** 输入含 `@media` 嵌套选择器的 CSS
- **THEN** 嵌套内选择器按既定规则判定，不误报

### Requirement: declarative-plugin 转换与回退链
The system SHALL be verified by tests that babel-plugin transforms macros/JSX correctly and vite-plugin falls back across three registry layers.

#### Scenario: 远程 registry 失败回退
- **WHEN** 远程拉取失败
- **THEN** 依次回退到 cacheFile，再回退到静态 registry

## MODIFIED Requirements
无

## REMOVED Requirements
无
