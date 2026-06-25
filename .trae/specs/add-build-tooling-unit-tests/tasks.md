# 任务清单：构建期工具链单元测试

> change-id: `add-build-tooling-unit-tests`

## T1 widget-wrapper-plugin 测试

- [ ] T1.1 通读 `wc/widget-wrapper-plugin/{vue-cli-plugin,vite-plugin,h5-vite-plugin,postcss-namespace}.js`，梳理对外导出与可测纯函数。
- [ ] T1.2 必要的最小可测性重构：把内联正则/常量（如 `GLOBAL_SELECTOR_PATTERNS`）、wrapper 文本生成提为可导出，不改变对外行为。
- [ ] T1.3 `wc/widget-wrapper-plugin/__tests__/external.test.js`：断言三套插件的 external 映射（vue2→Vue2、vue3→Vue3、h5→无框架仅 scope）。
- [ ] T1.4 `wc/widget-wrapper-plugin/__tests__/wrapper-generation.test.js`：断言生成的 wrapper 文件结构（customElement 定义、config 解析、scope 注入、生命周期）。
- [ ] T1.5 `wc/widget-wrapper-plugin/__tests__/postcss-namespace.test.js`：覆盖普通选择器加前缀、全局白名单不加前缀、`@media`/`@keyframes` 嵌套分支、`@keyframes` 名称不被破坏。

## T2 构建期检查器四件套测试

- [ ] T2.1 `wc/css-namespace-checker/__tests__/css-namespace.test.js`：通过/拒收/边界（`@media` 嵌套、`@keyframes`、多选择器组合）。
- [ ] T2.2 `wc/js-risk-scanner/__tests__/risk-scanner.test.js`：通过/拒收/边界（`document.cookie` 变体、`eval`、`localStorage`、`innerHTML`、动态拼接）。
- [ ] T2.3 `wc/scoped-style-checker/__tests__/scoped-style.test.js`：scoped 与 namespace 两层策略区分、缺命名空间告警分支。
- [ ] T2.4 `wc/dependency-analyzer/__tests__/dependency-analyzer.test.js`：公共依赖冲突检测、版本不兼容判定。

## T3 widget-declarative-plugin 测试

- [ ] T3.1 通读 `wc/widget-declarative-plugin/{babel-plugin,vite-plugin,runtime}.js`。
- [ ] T3.2 `wc/widget-declarative-plugin/__tests__/babel-plugin.test.js`：`$widget('name', config)` 转换、`<Widget name=.. config=../>` JSX 转换、`.vue` script 块转换。
- [ ] T3.3 `wc/widget-declarative-plugin/__tests__/vite-plugin.test.js`：远程 registry 拉取成功、远程失败回退 cacheFile、全失败回退静态 registry 三条链路。
- [ ] T3.4 `wc/widget-declarative-plugin/__tests__/runtime.test.js`：widgetMount 的 mount/unmount/config 更新。

## T4 验收

- [ ] T4.1 `npm run test:run` 全绿，新增用例数 ≥ 60。
- [ ] T4.2 既有 97 用例不被破坏。
- [ ] T4.3 必要时更新 vitest.config.js 的 include glob（确认新目录被纳入）。
