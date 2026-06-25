# 任务清单：核心模块单元测试

> change-id: `add-core-unit-tests`
> 依赖关系：T1 → T2/T3/T4/T5/T6 可并行；T7 依赖 T2-T6 完成后整体验收。

## T1 测试基础设施搭建

- [ ] T1.1 在根 `package.json` 增加 `devDependencies`：`vitest`、`happy-dom`（用于 `window`/`CustomEvent` 测试环境）。
- [ ] T1.2 增加 `scripts.test` = `vitest`、`scripts.test:run` = `vitest run`、`scripts.test:ci` = `vitest run --reporter=verbose`。
- [ ] T1.3 新建 `vitest.config.js`：`test.environment` 默认 `node`，对 `widget-bus` / `widget-scope` 测试用 `// @vitest-environment happy-dom` 内联标记切到 DOM 环境；`include` = `wc/**/__tests__/*.test.js`。
- [ ] T1.4 运行 `npm run test:run` 确认空套件能跑通（0 用例也成功）。

## T2 widget-bus 单元测试

文件：`wc/widget-bus/__tests__/bus.test.js`

- [ ] T2.1 `emit` 触发后 `on` 的 handler 收到 `payload`（即 `event.detail`）。
- [ ] T2.2 `on` 返回的取消订阅函数调用后，再次 `emit` 不触发该 handler。
- [ ] T2.3 `once` 仅触发一次，第二次 `emit` 不再调用。
- [ ] T2.4 同一事件类型两个 handler，第一个抛错时第二个仍被调用；`console.error` 被以 `[widget-bus] listener error` 调用（用 `vi.spyOn` 验证）。
- [ ] T2.5 `createBus('A')` 与 `createBus('B')` 各自 `emit('resize')`，对方监听器不收到（命名空间隔离）。
- [ ] T2.6 默认全局总线与 `createBus()` （无参数）行为一致，事件名前缀为 `bi-widget-bus:`。
- [ ] T2.7 `options.bubbles=false` / `options.composed=false` 透传到 `CustomEvent`（用 `vi.spyOn(window, 'dispatchEvent')` 校验 init 字段）。

## T3 widget-scope 基础测试

文件：`wc/widget-scope/__tests__/scope.test.js`

- [ ] T3.1 `createWidgetScope()` 缺 `name` 抛 `[widget-scope] opts.name is required`。
- [ ] T3.2 `meta` 为 `Object.freeze` 对象，尝试 `meta.name='x'` 在严格模式下抛错（或 `Object.isFrozen` 为 true）。
- [ ] T3.3 `meta.__isWidgetScope === true`，`scope.__noGlobalAccess === true`。
- [ ] T3.4 `isWidgetScope(scope)` 返回 true；`isWidgetScope({})` / `isWidgetScope(null)` 返回 false。
- [ ] T3.5 `scope.log.info/warn/error` 输出带 `[${name}]` 前缀（spy console）。
- [ ] T3.6 `scope.request` 调用 `globalThis.fetch`，且 `request.addInterceptor(fn)` 注入的拦截器能改写 headers（如注入 `Authorization`）。
- [ ] T3.7 拦截器自身抛错时不阻断请求（被静默吞掉）。
- [ ] T3.8 `scope` 对象被冻结（`Object.isFrozen(scope)===true`），不能新增属性。

## T4 widget-scope 嵌套循环检测测试（核心）

文件：`wc/widget-scope/__tests__/nesting.integration.test.js`

> 因 `pendingAncestors` 是模块级 Map，测试间需用 `vi.resetModules()` 隔离，避免相互污染。

- [ ] T4.1 直接自引用：A 的 `scope.loader.loadWidget({name:'A'})` 抛错，错误信息含 "试图加载自身" 且链路含 `A -> A`。
- [ ] T4.2 祖先链回环 A→B→A：
  - 用 `setPendingAncestors` 或先 mock loader 让 A 的 `loadWidget({name:'B'})` 不真正加载，仅触发 `propagateAncestors('B')`；
  - 再创建 B 的 scope（此时 B 继承祖先 `{A}`）；
  - B 的 `scope.loader.loadWidget({name:'A'})` 抛 "试图加载祖先物料"，链路含 `A -> B -> A`。
- [ ] T4.3 多级嵌套祖先传播 A→B→C，C 加载 A：
  - A `propagateAncestors('B')` → B scope 继承 `{A}`；
  - B `propagateAncestors('C')` → C scope 继承 `{A,B}`；
  - C `loadWidget({name:'A'})` 抛错，链路含 `A -> B -> C -> A`。
- [ ] T4.4 无环嵌套不抛错：A→B→C，C 加载 D（D 不在祖先链），`checkCycle('D')` 不抛错（需 mock loader 的 `loadWidget` 解析，仅校验 `checkCycle` 不抛）。
- [ ] T4.5 `pendingAncestors` 在 `createWidgetScope` 后被消费清除（`consumePendingAncestors` 二次调用返回 null）。

## T5 widget-loader semver satisfies 测试

文件：`wc/widget-loader/__tests__/semver.test.js`

> 直接 `import { satisfies } from '../../index.js'`，纯函数无需 DOM 环境。

- [ ] T5.1 `^2.6.0`：`2.6.0`✓ `2.6.14`✓ `2.9.0`✓ `3.0.0`✗ `2.5.0`✗。
- [ ] T5.2 `^0.0.3`（0.0.x 收紧）：`0.0.3`✓ `0.0.4`✗ `0.0.2`✗。
- [ ] T5.3 `^0.2.0`（0.x 收紧到同 minor）：`0.2.0`✓ `0.2.5`✓ `0.3.0`✗ `0.1.9`✗。
- [ ] T5.4 `~1.2.3`：`1.2.3`✓ `1.2.9`✓ `1.3.0`✗ `1.2.2`✗。
- [ ] T5.5 `>=2.6.0 <3.0.0`（空格 AND）：`2.6.0`✓ `2.9.9`✓ `3.0.0`✗ `2.5.9`✗。
- [ ] T5.6 `||` 或范围：`1.x || 3.x` 形式（`^1.0.0 || ^3.0.0`）：`1.5.0`✓ `3.2.0`✓ `2.0.0`✗。
- [ ] T5.7 `*` 与空字符串：任意版本都满足。
- [ ] T5.8 精确版本 `=2.6.14` 或 `2.6.14`：仅 `2.6.14`✓，`2.6.15`✗。
- [ ] T5.9 预发布：`1.0.0-beta.1` vs `1.0.0`，正式版 > 预发布；`^1.0.0` 是否包含 `1.0.0-beta.1`（按当前实现：`compareVersion(v, req) < 0` 判定，预发布 < 正式，应不满足，需测试确认实际行为并记录）。
- [ ] T5.10 `v` 前缀与 `=` 前缀清洗：`v2.6.14` 与 `=2.6.14` 等价于 `2.6.14`。

## T6 widget-loader checkDependencies 测试

文件：`wc/widget-loader/__tests__/checkDependencies.test.js`

> 需要 happy-dom 提供 `window`，并 mock `i18n` 的 `t()` 返回原 key（避免翻译缺失干扰断言）。

- [ ] T6.1 `vueVersion='none'`：不抛错（原生 H5 物料跳过 Vue 校验）。
- [ ] T6.2 `window.Vue2` 缺失：抛错 `code='DEP_VERSION_MISMATCH'`，`details` 数组含 1 条提到 `Vue2` 缺失。
- [ ] T6.3 `window.Vue2.version='2.4.0'`，范围 `^2.6.0`：抛错，`details` 含版本不兼容条目。
- [ ] T6.4 `window.Vue2.version='2.6.14'`：不抛错。
- [ ] T6.5 `vueVersion='3'`，`window.Vue3.version='3.4.21'`，范围 `^3.0.0`：不抛错。
- [ ] T6.6 `vueVersion='3'`，`window.Vue3` 缺失：抛错，`details` 提到 `Vue3`。
- [ ] T6.7 错误对象 `err.code === 'DEP_VERSION_MISMATCH'` 且 `Array.isArray(err.details)`。

## T7 集成验收

- [ ] T7.1 `npm run test:run` 全绿，退出码 0。
- [ ] T7.2 用例总数 ≥ 40（覆盖以上场景）。
- [ ] T7.3 `wc/` 下源码文件 `git diff` 为空（证明未改源码）。
- [ ] T7.4 README 不需要改动（测试基础设施属内部工程，不影响对外文档）。
