# 核心模块单元测试 Spec

## Why

当前仓库**零自动化测试**（已用多种 glob 模式确认无 `*.test.js` / `*.spec.js` / `__tests__/` / `test/`）。所有核心逻辑（物料加载、嵌套循环检测、跨技术栈消息总线、semver 兼容范围）的正确性仅靠 demo 运行与人工审查保证，存在显著回归风险：

- `widget-scope` 的祖先链循环检测是防止整页崩溃的核心防线，无任何测试覆盖。
- `widget-loader` 的 semver `satisfies` 支持 `^`/`~`/`>=`/`||`/`*`/预发布等复杂语法，仅有正则实现，无测试极易在边界用例出错。
- `widget-bus` 的 try/catch 包裹、`once` 语义、命名空间隔离均无验证。

后续将启动 P1（UI 按需加载、交叉页面 demo），这些工作会改动 `schema-generator`、`widget-loader`、demo 物料，**必须先有核心模块单测作为安全网**，否则 P1 改动无法被回归验证。

## What Changes

- 引入 `vitest` 作为测试运行器（零配置、原生 ESM、与现有 Vite 项目契合）。
- 在 `package.json` 增加 `test` / `test:run` 脚本与 devDependency。
- 为以下四个核心模块补充单元测试：
  1. `wc/widget-bus/index.js` —— `emit`/`on`/`once` 语义、handler 异常隔离、命名空间隔离、取消订阅。
  2. `wc/widget-scope/index.js` —— `createWidgetScope` 必填校验、`meta` 冻结、`isWidgetScope` 判定、**嵌套加载循环检测**（直接自引用 / 祖先链回环 / 多级嵌套祖先传播）、`request` 拦截器注入。
  3. `wc/widget-loader/index.js`（仅纯函数部分）—— `satisfies`（`^`/`~`/`>=`/`>`/`<=`/`<`/`=`/`*`/`||`/预发布/`0.0.x` 收紧规则）、`checkDependencies`（Vue 运行时缺失 / 版本不兼容 / `vueVersion='none'` 跳过 / `DEP_VERSION_MISMATCH` 错误结构）。
  4. `wc/widget-bus` 与 `widget-scope` 的集成场景：物料通过 `scope.bus.emit` 跨命名空间不串扰。
- 不改动任何被测源码逻辑（若测试发现 bug，单独立项修复，本 Spec 只补测试）。
- 测试文件统一放在 `wc/<module>/__tests__/<name>.test.js`，与源码同目录便于维护。

## Impact

- Affected specs: 无（本 Spec 不影响既有 spec）。
- Affected code:
  - `package.json`：新增 devDependencies（`vitest`）、`test` 脚本。
  - 新增文件：`wc/widget-bus/__tests__/bus.test.js`、`wc/widget-scope/__tests__/scope.test.js`、`wc/widget-loader/__tests__/semver.test.js`、`wc/widget-loader/__tests__/checkDependencies.test.js`、`wc/widget-scope/__tests__/nesting.integration.test.js`。
  - `vitest.config.js`（根目录，最小配置）。
- 不修改任何 `wc/` 下源码文件。

## ADDED Requirements

### Requirement: 测试运行器与脚本
The project SHALL provide a `npm test` command that runs all unit tests in non-interactive CI mode and exits non-zero on any failure.

#### Scenario: CI 环境
- **WHEN** 执行 `npm run test:run`
- **THEN** vitest 以 `run` 模式执行（不进入 watch），所有 `**/__tests__/*.test.js` 被收集，失败用例使进程退出码非 0。

### Requirement: widget-bus 单元测试
The test suite SHALL cover `emit`/`on`/`once`/取消订阅/命名空间隔离/handler 异常不阻断其他监听器。

#### Scenario: handler 抛异常
- **WHEN** 同一事件类型注册两个 handler，第一个抛错
- **THEN** 第二个 handler 仍被调用，且控制台输出 `[widget-bus] listener error`。

#### Scenario: 命名空间隔离
- **WHEN** `createBus('A')` 与 `createBus('B')` 各自 `emit('resize')`
- **THEN** 仅各自命名空间的监听器收到事件，互不串扰。

### Requirement: widget-scope 嵌套循环检测测试
The test suite SHALL assert that direct self-reference and ancestor-chain cycles throw a `[widget-scope] 循环加载检测` error, and that multi-level nesting propagates the ancestor chain correctly.

#### Scenario: 直接自引用
- **WHEN** 物料 A 通过 `scope.loader.loadWidget({name:'A'})` 加载自身
- **THEN** 抛出含 "试图加载自身" 的错误，且错误链路字符串包含 `A -> A`。

#### Scenario: 祖先链回环（A→B→A）
- **WHEN** A 加载 B，B 再加载 A
- **THEN** B 的 `scope.loader.loadWidget({name:'A'})` 抛出含 "试图加载祖先物料" 的错误，链路包含 `A -> B -> A`。

#### Scenario: 多级嵌套祖先传播（A→B→C，C 加载 A）
- **WHEN** A→B→C 三级嵌套后，C 试图加载 A
- **THEN** 抛错，链路包含 `A -> B -> C -> A`，证明祖先链跨多级正确传播。

### Requirement: semver satisfies 测试
The test suite SHALL cover `^`/`~`/`>=`/`>`/`<=`/`<`/`=`/`*`/`||`/空范围/预发布版本/`0.0.x` 收紧规则/空格 AND 复合范围。

#### Scenario: `^2.6.0` 兼容范围
- **THEN** `2.6.14` 满足、`2.9.0` 满足、`3.0.0` 不满足、`2.5.0` 不满足。

#### Scenario: `0.0.x` 收紧
- **WHEN** 范围 `^0.0.3`
- **THEN** 仅 `0.0.3` 满足，`0.0.4` 不满足（与 `code-review-fixes.md` P0-4 一致）。

### Requirement: checkDependencies 测试
The test suite SHALL cover Vue 运行时缺失、版本不兼容、`vueVersion='none'` 跳过、错误 `code='DEP_VERSION_MISMATCH'` 与 `details` 数组结构。

#### Scenario: vueVersion='none'
- **WHEN** `checkDependencies({name:'h5-widget', vueVersion:'none'})`
- **THEN** 不抛错，跳过 Vue 校验。

#### Scenario: 版本不兼容
- **WHEN** `window.Vue2.version='2.4.0'`，调用 `checkDependencies({name:'w', vueVersion:'2'})`
- **THEN** 抛错，`err.code==='DEP_VERSION_MISMATCH'`，`err.details` 为非空数组。

## Non-Goals

- 不为 `widget-loader` 的 DOM 加载逻辑（`loadScript`/`loadStyle`/`waitForCustomElement`）写测试——这些依赖真实 DOM 与网络，属集成测试范畴，本 Spec 不覆盖。
- 不为 demo 项目写测试。
- 不改动任何被测源码。
- 不引入 `jsdom` 以外的 DOM 模拟（vitest 默认 `node` 环境；涉及 `window`/`CustomEvent` 的用例在测试内手动 stub 或使用 `happy-dom`）。
