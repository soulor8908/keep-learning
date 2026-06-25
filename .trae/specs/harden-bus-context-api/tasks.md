# 任务清单：Bus / Context API 加固

> change-id: `harden-bus-context-api`

## T1 widget-bus off 方法

- [x] T1.1 `wc/widget-bus/index.js`：createBus 内部维护 type→Set<handler>（或基于 wrappedHandler 反查），新增 `off(type, handler)` 移除指定 handler。
- [x] T1.2 默认导出与 `export const off`；Vue2BusPlugin / Vue3BusPlugin / `window.widgetBus` 同步暴露 off。
- [x] T1.3 `wc/widget-bus/__tests__/bus.test.js` 新增用例：off 取消指定 handler、off 未注册 handler 不抛错、off 不影响 once 已注册的、off 后 on 仍可正常工作。既有 14 用例不被破坏。

## T2 widget-scope bus.on/once 同步返回

- [x] T2.1 `wc/widget-scope/index.js`：重写 `bus.on`/`bus.once` 为同步返回 unsubscribe（bus 就绪前缓存、就绪后补注册、unsubscribe 兼容两种状态）；emit 保持 async。
- [x] T2.2 `wc/widget-scope/__tests__/scope.test.js`：调整任何依赖 on 返回 Promise 的断言为同步 unsubscribe；新增同步取消订阅用例（无 await 即 off 不抛错、后续不触发）。
- [x] T2.3 `wc/widget-scope/__tests__/nesting.integration.test.js` 复跑确认不破坏。

## T3 widget-context deep 选项

- [x] T3.1 `wc/widget-context/index.js`：setContext 增加 `{ deep }` 选项，启用时用深度相等（JSON 序列化比较或递归浅比）判定变化；createContext().set 同步支持。
- [x] T3.2 `wc/widget-context/__tests__/context.test.js`（若不存在则新建，归并到 Spec2 的运行时测试计划；本 spec 至少补 deep 用例）：嵌套字段变化触发、相同结构不触发、默认浅比较行为不变。

## T4 文档与模板说明

- [x] T4.1 `docs/code-review-fixes.md`：修正 P1-13 描述，明确 off 已实现及其签名。
- [x] T4.2 `wc/vue3-widget-template/`：在 widget-wrapper.js 顶部注释或 README 标注"顶层 await 需 Vite 或支持顶层 await 的构建环境；Vue CLI 需 target es2022"。

## T5 验收

- [x] T5.1 `npm run test:run` 全绿，既有用例不被破坏。实际新增 50 用例（bus +9 / scope +8 / context 33 全新），workspace 总计 467 全绿。
- [x] T5.2 新增 off / 同步 on / deep 用例均通过。
- [x] T5.3 docs/code-review-fixes.md P1-13 与实现一致。
