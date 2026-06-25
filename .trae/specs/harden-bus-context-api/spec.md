# Bus / Context API 加固 Spec

> change-id: `harden-bus-context-api`

## Why

四个 P3 级 API 健壮性问题，影响使用体验与文档可信度：

1. **widget-bus 缺 `off` 方法**：`docs/code-review-fixes.md` P1-13 声称已新增 `off(event, cb)`，但源码中 `off` 仅作为 `on`/`once` 返回的 unsubscribe 内部使用，未导出独立 `off(event, cb)`。使用者按文档调用 `bus.off('event', cb)` 会报错。
2. **scope.bus.on 返回 Promise<unsubscribe>**：widget-scope 的 `bus.on` 是 async（因懒加载 bus 模块），返回 `Promise<unsubscribe>`。物料漏写 `await` 时 `const off = bus.on(...); off();` 会抛 "off is not a function"，与主流事件库同步返回 unsubscribe 的约定不符。
3. **widget-context 仅浅比较**：setContext 用 `oldValue !== newValue` 浅比较，基座只改嵌套字段（引用未变）时物料不刷新。BI 看板嵌套配置更新较常见。
4. **vue3-widget-template 顶层 await 兼容性**：`widget-wrapper.js` 用顶层 `await import()`，依赖 Vite；Vue CLI(webpack4) 默认不支持，与"跨技术栈包容"略有出入但未在文档说明。

## What Changes

- `wc/widget-bus/index.js`：在 createBus 返回值与默认导出新增 `off(type, handler)` 方法，从内部 listeners 移除指定 handler；同步更新 Vue2BusPlugin / Vue3BusPlugin / `window.widgetBus` 暴露。
- `wc/widget-scope/index.js`：把 `bus.on` / `bus.once` 改为同步返回 unsubscribe 函数（bus 就绪前缓存调用，就绪后补注册；unsubscribe 无论是否就绪都能正确清理）；`emit` 保持 async fire-and-forget。
- `wc/widget-context/index.js`：setContext 新增 opt-in `{ deep: true }` 选项，启用时用深度相等判定变化；默认仍浅比较（鼓励不可变更新）。
- `docs/code-review-fixes.md`：修正 P1-13 描述与实现一致。
- `wc/vue3-widget-template/`：在模板 README/注释中标注"需 Vite 或支持顶层 await 的构建环境"。
- 补/改测试：widget-bus 新增 off 用例；widget-scope 调整 on/once 同步返回断言并新增用例；widget-context 新增 deep 选项用例。

## Scope

### In Scope
- widget-bus `off` 导出与各插件/window 暴露。
- widget-scope bus.on/once 同步 unsubscribe 改造。
- widget-context deep 选项。
- 上述模块测试与文档修正。

### Non-Goals
- 不改 widget-bus 的 CustomEvent 派发机制与命名空间隔离语义。
- 不改 vue3-widget-template 的顶层 await 实现（仅补文档说明）。
- 不改 widget-context 默认浅比较行为（deep 为 opt-in）。

## ADDED Requirements

### Requirement: widget-bus off 方法
The system SHALL provide an `off(type, handler)` API on the bus to remove a specific handler.

#### Scenario: 取消指定 handler
- **WHEN** on('e', h1) 与 on('e', h2) 后调用 off('e', h1)
- **THEN** emit('e') 仅触发 h2，h1 不再被调用

#### Scenario: off 未注册 handler 安全
- **WHEN** off('e', neverRegistered)
- **THEN** 不抛错，不影响其他 handler

### Requirement: scope.bus.on 同步返回 unsubscribe
The system SHALL make scope.bus.on/once return a synchronous unsubscribe function.

#### Scenario: 同步取消订阅
- **WHEN** 物料写 `const off = scope.bus.on('e', cb); off();`（无 await）
- **THEN** 不抛错，且后续 emit 不触发 cb

### Requirement: widget-context deep 选项
The system SHALL support an opt-in deep equality check in setContext.

#### Scenario: 嵌套字段变化触发
- **WHEN** setContext({ user: { name: 'a' } }) 后再 setContext({ user: { name: 'b' } }, { deep: true })（同一引用仅改字段）
- **THEN** user 订阅者被触发

## MODIFIED Requirements
无

## REMOVED Requirements
无
