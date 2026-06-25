# 任务清单：运行时核心模块单元测试

> change-id: `add-runtime-module-unit-tests`

## T1 i18n 测试

- [x] T1.1 通读 `wc/i18n/index.js`，梳理 getLocaleFallbackChain / addMessages / setLocale / onLocaleChange / t。
- [x] T1.2 `wc/i18n/__tests__/i18n.test.js`：回退链顺序（zh-CN→zh→en→zh）、addMessages 深合并嵌套对象不互相覆盖、setLocale force 参数、onLocaleChange 订阅与取消、t 带参数插值。

## T2 widget-context 测试

- [x] T2.1 通读 `wc/widget-context/index.js`。
- [x] T2.2 `wc/widget-context/__tests__/context.test.js`：get 返回快照、浅比较跳过未变字段、onChange 触发、off 后不再触发、context 只读（写不入）。
      > 已移交至 `harden-bus-context-api` Spec 一并实施（避免双 Spec 改动同一文件冲突），context.test.js 共 33 用例，包含浅比较、onChange、deep 选项。

## T3 widget-registry 测试

- [x] T3.1 通读 `wc/widget-registry/index.js`。
- [x] T3.2 `wc/widget-registry/__tests__/registry.test.js`：数组格式归一化、对象格式原样返回、缺 name/js 字段兜底、远程拉取 mock。

## T4 widget templates 测试

- [x] T4.1 通读 `wc/{vue2,vue3,h5}-widget-template/widget-wrapper.js`。
- [x] T4.2 `wc/vue2-widget-template/__tests__/wrapper.test.js`：mount/unmount/config 变化重渲染/disconnected 清理、config JSON.parse 失败返回 `{}`。
- [x] T4.3 `wc/vue3-widget-template/__tests__/wrapper.test.js`：reactive ref config 更新（不 unmount/remount）、shadowRoot 告警分支、disconnected app.unmount + 置空。
- [x] T4.4 `wc/h5-widget-template/__tests__/wrapper.test.js`：render + onMount + onUnmount 清理函数调用、createMinimalScope fetch 不可用兜底 reject。

## T5 ai-assistant 安全测试

- [x] T5.1 通读 `wc/ai-assistant/cli.js`，定位 `WIDGET_NAME_RE`、AI_API_KEY 处理、文件写回。
- [x] T5.2 `wc/ai-assistant/__tests__/cli.test.js`：WIDGET_NAME_RE 拒收 `../`/`/abs`/空/特殊字符、未配 AI_API_KEY 仅打印 Prompt 不发请求（mock fetch 断言未被调用）、文件写回路径校验。

## T6 验收

- [x] T6.1 `npm run test:run` 全绿，新增用例数 ≥ 50。实际 99 用例（i18n 22 + registry 18 + ai-assistant 20 + h5 17 + vue2 11 + vue3 11），workspace 总计 467 全绿。
- [x] T6.2 既有用例不被破坏。
- [x] T6.3 widget template 测试在 happy-dom 环境通过（customElements 可用）。
