# 验收清单：运行时核心模块单元测试

> change-id: `add-runtime-module-unit-tests`

## i18n
- [x] 回退链顺序用例
- [x] addMessages 深合并用例
- [x] setLocale force / 广播用例
- [x] onLocaleChange 订阅与取消用例
- [x] t 参数插值用例

## widget-context
- [x] get 快照用例
- [x] 浅比较跳过用例
- [x] onChange 触发 / off 后不再触发用例

## widget-registry
- [x] 数组/对象两种格式归一化用例
- [x] 缺 name/js 兜底用例

## widget templates
- [x] vue2：mount/unmount/config 变化/parse 失败容错
- [x] vue3：reactive config 更新/shadowRoot 告警/disconnected 清理
- [x] h5：onMount/onUnmount cleanup/createMinimalScope 兜底

## ai-assistant
- [x] WIDGET_NAME_RE 路径穿越拒收用例
- [x] 未配 AI_API_KEY 不发请求用例
- [x] 文件写回路径校验用例

## 运行验收
- [x] `npm run test:run` 全绿
- [x] 既有用例不被破坏
- [x] 新增用例数 ≥ 50
- [x] happy-dom 下 customElements 可用
