# 代码审查修复记录（P0 / P1 / P2）

> 本文档记录 wc 看板物料集成方案的代码审查发现与修复。
> P0 = 阻断性问题（必须修复才能上线）；P1 = 重要问题（影响稳定性/正确性）；P2 = 改进项（体验/健壮性）。
>
> 说明：P0/P1 的修复代码在提交 `7850422` 中（原提交信息误写为"创建分支vant-wc"），
> P2 的修复在提交 `28f6d09` 中。本文档为事后根据代码改动反推补建，确保审查记录可追溯。

---

## 一、P0 修复（阻断性问题）

### P0-1：资源加载无超时，CDN 抖动会导致 Promise 永不 settle

- **文件**：`wc/widget-loader/index.js`
- **问题**：`loadScript` / `loadStyle` 没有超时机制。当 CDN 网络挂起（TCP 连接建立但不响应）时，Promise 永远不 resolve 也不 reject，导致物料挂载卡死、看板白屏。
- **修复**：新增 `DEFAULT_LOAD_TIMEOUT = 15000`（15秒），`loadScript`/`loadStyle` 增加 `timeout` 参数。超时后清理 DOM 节点、删除缓存、reject 错误。用 `settled` 标志防止 onload/onerror/timeout 三者竞态重复触发。

### P0-2：`waitForCustomElement` 定时器泄漏

- **文件**：`wc/widget-loader/index.js`
- **问题**：`waitForCustomElement` 用 `setInterval` 轮询自定义元素注册状态，但返回的 Promise 没有取消机制。调用方放弃等待后定时器仍在运行，造成内存泄漏。
- **修复**：重构为可取消的 Promise，挂载 `promise.cancel()` 方法清理定时器。

### P0-3：`mountedWidgets` 用 name 作 key，同物料多实例互相覆盖

- **文件**：`wc/widget-loader/index.js`
- **问题**：`mountedWidgets = new Map()` 以 `widget.name` 为 key。当看板上同一物料出现多个实例时（如两个销售看板），后挂载的会覆盖前一个的追踪记录，导致错误边界无法正确归因到崩溃实例。
- **修复**：改为 `WeakMap`，以 DOM 元素实例为 key。元素销毁后自动回收，且同物料多实例互不覆盖。

### P0-4：`satisfies` 版本范围校验对 `0.0.x` 处理错误

- **文件**：`wc/widget-loader/index.js`
- **问题**：`^0.0.5` 语义化版本范围应只匹配 `0.0.5`（0.0.x 系列收紧到同 patch），但原实现按 `0.x` 规则只校验 minor，导致 `0.0.6`、`0.0.99` 都能通过，可能引入不兼容的 patch 更新。
- **修复**：增加 `0.0.x` 分支判断，收紧到 `v.major === 0 && v.minor === 0 && v.patch === req.patch`。

---

## 二、P1 修复（重要问题）

### P1-5：`schema-generator` 不支持 TypeScript `defineProps<{}>()` 泛型语法

- **文件**：`wc/schema-generator/index.js`（+251 行，本次最大改动）
- **问题**：Vue3 `<script setup>` 的 `defineProps<{ title: string; count?: number }>()` 泛型语法无法被解析，生成的 schema.json 缺失这些 props。
- **修复**：新增 `extractTsPropsBody` 提取泛型接口体；`tsTypeToJsonType` 把 TS 类型转 JSON Schema type（支持联合类型 `string | number`、数组 `string[]`、泛型 `Array<T>`、对象字面量）；`singleQuoteToJson` 安全转换单引号字符串字面量（不破坏字符串内部的单引号，如 `it's`）；`tryParseJsonLike` 先 JSON.parse 失败再用单引号转换重试。

### P1-6：`schema-generator` 不支持 `<script setup>` 无参/类型式 defineProps

- **文件**：`wc/schema-generator/index.js`
- **问题**：情况 4——`<script setup>` 使用 `defineProps<{}>()` 或无参 `defineProps()` 时，props 提取逻辑遗漏。
- **修复**：补充情况 4 的分支处理。

### P1-7：`css-namespace-checker` 误把 CSS 字符串内容和关键帧内部选择器当作样式选择器

- **文件**：`wc/css-namespace-checker/index.js`
- **问题**：`content: "..."` 字符串里的花括号被误判为规则边界；`@keyframes`/`@font-face`/`@page` 内部的选择器（如 `0%`/`from`/`to`）被误收集为样式选择器，产生误报。
- **修复**：逐字符扫描时跟踪字符串字面量边界（`inString`/`stringChar` 状态机），跳过字符串内容；嵌套规则中识别 `@keyframes`/`@-webkit-keyframes`/`@font-face`/`@page` 并跳过其内部选择器。

### P1-8：`dependency-analyzer` 把 devDependencies 也推荐为 external

- **文件**：`wc/dependency-analyzer/index.js`
- **问题**：分析公共依赖时混入了 devDependencies（如构建工具），错误地推荐它们作为 external，可能导致运行时找不到模块。
- **修复**：只收集 `pkg.dependencies`（运行时依赖），排除 devDependencies；防御性排除项目自身包名。

### P1-9：`i18n` 缺少运行时追加语言包能力

- **文件**：`wc/i18n/index.js`
- **问题**：语言包在模块加载时固定，部门/物料无法运行时注入自己的文案。
- **修复**：新增 `addMessages(locale, msgs)` 函数，浅层合并顶层 key（按命名空间覆盖）；`setLocale` 增加 `force` 参数，强制重新广播 locale 变化（用于热更新语言包后刷新物料）。

### P1-10：`js-risk-scanner` 误把注释和字符串中的关键词判为风险

- **文件**：`wc/js-risk-scanner/index.js`
- **问题**：`// window.xxx = 1` 注释里的 `window` 或字符串 `"localStorage"` 里的 `localStorage` 被误判为风险代码，产生误报。
- **修复**：新增 `stripCommentsAndStrings` 函数，剥离行内注释（`//` 后内容）和字符串字面量内容（用空格占位保留列宽，避免列号错位），只扫描真实代码。

### P1-11：`migration-skill` 对 `<script setup>` 类型式 props 处理不完整

- **文件**：`wc/migration-skill/index.js`
- **问题**：迁移 CLI 遇到 `<script setup>` 的 `defineProps<{}>()` 时，props 补充逻辑不完整。
- **修复**：补充情况 4 的处理分支。

### P1-12：`vue3-widget-template` 包装层缺少 shadowRoot 守卫

- **文件**：`wc/vue3-widget-template/widget-wrapper.js`
- **问题**：如果未来误引入 `defineCustomElement()` 或 `attachShadow()`，物料样式会被 Shadow DOM 隔离，ElementUI/ElementPlus 全局样式无法穿透，且没有运行时告警。
- **修复**：`connectedCallback` 中检测 `this.shadowRoot`，存在则 `console.error` 告警。

### P1-13：`widget-bus` 缺少 `off` 方法（无法取消订阅）

- **文件**：`wc/widget-bus/index.js`
- **问题**：跨技术栈消息总线只有 `on`/`emit`，没有 `off`，物料卸载时无法取消订阅，造成回调泄漏。
- **修复**：新增 `off(event, cb)` 方法。

### P1-14：缺少 `unmountWidget` API（无法主动卸载物料）

- **文件**：`wc/widget-loader/index.js`
- **问题**：只有 `mountWidget`，没有卸载 API。基座切换看板时无法清理旧物料，造成 DOM 堆积和内存泄漏。
- **修复**：新增 `export function unmountWidget(element)`，移除 DOM 元素、清理错误边界追踪、触发 `unmount` 生命周期事件。

### P1-15：缺少物料生命周期事件机制

- **文件**：`wc/widget-loader/index.js`
- **问题**：基座无法感知物料的 loading/loaded/error/unmount 状态，无法做统一监控和加载态展示。
- **修复**：新增 `lifecycleHooks` 注册表和 `emitLifecycle` 内部函数；导出 `onWidgetLifecycle(event, cb)` 供基座订阅，返回取消订阅函数。在 `attemptMount`/`mountWithFallback`/`mountWidget`/`markWidgetFailed`/`unmountWidget` 中触发对应事件。

### P1-16：`unhandledrejection` 归因后未阻止控制台告警

- **文件**：`wc/widget-loader/index.js`
- **问题**：全局 `unhandledrejection` 监听器归因到物料并降级后，没有调用 `event.preventDefault()`，控制台仍会打印未处理 rejection 告警，干扰基座。
- **修复**：归因并降级后调用 `event.preventDefault()`。

---

## 三、P2 修复（改进项）

> P2 修复在提交 `28f6d09` 中，提交信息规范完整，此处简要列出，详见提交信息。

### P2-27：`unmountWidget` API
- 确认已在 P1-14 实现，无需改动。

### P2-29：降级占位样式可被基座覆盖
- `renderFallback` 移除内联样式，改用 `injectFallbackStyles` 注入样式表 + CSS 类，支持基座覆盖主题。

### P2-30：mock-aui 叶子组件保留 slot 投影（注：mock-aui 已删除，此条不再适用）
- `statistic`/`progress`/`list-item` 改用 `getInner` 内部容器渲染，避免 `innerHTML` 清空 slot 投影内容。

### P2-31：ai-assistant 真实 AI 调用
- `callAI` 实现真实 OpenAI 兼容接口调用（环境变量 `AI_API_KEY`/`AI_API_URL`/`AI_MODEL`），未配置时回退打印 Prompt。

### P2-32：README Vue2 示例修正
- 修正 Vue2 示例 `widgetPlugin()` 无参抛错，改为传入 `name`/`component`/`vueGlobal` + `chainWebpack`；移除已废弃的 `@vue/web-component-wrapper` 安装。

---

## 四、修复验证

所有 P0/P1/P2 修复均已合并到 `dev-wc` 分支，并通过 demo 项目（vue2-host / vue3-host）的构建与运行验证。

| 修复批次 | 提交 | 验证状态 |
|---|---|---|
| P0 (1-4) + P1 (5-16) | `7850422` | ✅ 已验证 |
| P2 (27/29/30/31/32) | `28f6d09` | ✅ 已验证 |
