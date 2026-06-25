# 验收清单：Bus / Context API 加固

> change-id: `harden-bus-context-api`

## widget-bus off
- [x] createBus 返回值含 off(type, handler)
- [x] 默认导出 / Vue2BusPlugin / Vue3BusPlugin / window.widgetBus 均暴露 off
- [x] off 取消指定 handler 用例通过
- [x] off 未注册 handler 不抛错用例通过
- [x] 既有 14 个 bus 用例不被破坏

## widget-scope 同步 on/once
- [x] bus.on/once 同步返回 unsubscribe
- [x] 无 await 即 off 不抛错用例通过
- [x] unsubscribe 后不再触发用例通过
- [x] 既有 scope/nesting 用例不被破坏

## widget-context deep
- [x] setContext 支持 { deep: true } 选项
- [x] createContext().set 同步支持
- [x] 嵌套字段变化触发用例通过
- [x] 默认浅比较行为不变

## 文档
- [x] docs/code-review-fixes.md P1-13 与实现一致
- [x] vue3-widget-template 标注顶层 await 构建环境要求

## 运行验收
- [x] `npm run test:run` 全绿
- [x] 既有用例不被破坏
