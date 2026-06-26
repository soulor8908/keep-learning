# 性能优化指南

本仓库是 Vue2/Vue3 微前端物料（widget）架构：基座（`vue2-host` / `vue3-host`）通过 `wc/widget-loader` 在运行时加载多个以 Custom Element 形式挂载的物料（`bi-*` 前缀），物料通过 UMD external 化公共依赖（Vue / element-plus / lodash / axios 等）。已有的性能相关内容散落在 `docs/elementui-on-demand-loading.md`（ElementUI 按需加载）与 `wc/README.md` §5.4，本文档将其集中并系统化。

> 本文所有常量、机制、配置项均来自源码真实值，引用文件时使用相对路径或文件名。

---

## 1. 概述

性能优化的核心目标围绕"微前端物料在基座中按需、并发、隔离加载"这一场景展开，分为四个层面：

- **首屏物料加载**：减少首屏所需 JS/CSS 体积与请求数，缩短 LCP。关键手段是公共依赖 external 化与 UI 组件注册表驱动按需加载（见第 2 节）。
- **运行时内存**：避免多物料重复加载同一资源、避免已卸载物料残留引用导致泄漏。关键手段是 `loadedResources` Map 去重、`unmountWidget` / `unloadWidget` 显式清理（见第 3 节）。
- **长页面滚动**：看板中常出现单页几十至上百个物料容器，DOM 节点数与重渲染开销需控制。关键手段是批量容器构建、并发上限、预加载不阻塞主线程（见第 2、3 节）。
- **并发加载**：CDN 抖动或网络拥塞下避免请求堆积与超时雪崩。关键手段是并发控制、超时与指数退避重试（见第 2 节）。

---

## 2. 加载性能

### 2.1 公共依赖 external 化

物料构建期通过 `wc/widget-wrapper-plugin/vite-plugin.js` 的 `rollupOptions.external` 将公共依赖排除出物料产物，由基座统一加载一份并挂到 `window`，避免 N 个物料各自打包 N 份相同依赖导致体积线性膨胀与多版本冲突。

externals 清单与 globals 映射（来自 `vite-plugin.js`）：

| external 模块 | globalVar（window 挂载点） | 说明 |
| --- | --- | --- |
| `vue` | `Vue`（可经 `vueGlobal` 选项覆盖） | Vue 运行时 |
| `element-plus` | `ElementPlus` | Vue3 UI 库 |
| `wc-i18n` | `__wcI18n__` | 国际化运行时，基座提供共享实例与 locale 状态 |
| `wc-widget-scope` | `__wcWidgetScope__` | 软隔离 scope 运行时，基座提供 `createWidgetScope` |
| `lodash` | `_` | 高频工具库 |
| `axios` | `axios` | HTTP 客户端 |

基座承诺的公共依赖版本契约（来自 `wc/widget-loader/index.js` 的 `SUPPORTED_DEPS`）：

| 依赖键 | version | compatibleRange | globalVar |
| --- | --- | --- | --- |
| `vue2` | `2.6.14` | `^2.6.0` | `Vue2` |
| `vue3` | `3.4.21` | `^3.0.0` | `Vue3` |
| `lodash` | `4.17.21` | `^4.17.0` | `_` |
| `axios` | `1.7.7` | `^1.0.0` | `axios` |

物料通过 `widget.runtimeDeps`（取值集合 `RUNTIME_DEP_KEYS = ['lodash', 'axios']`）声明自身使用的高频第三方库，`checkDependencies` 会按 `window[globalVar]` 校验存在性与版本兼容；缺失或不兼容版本则抛 `DEP_VERSION_MISMATCH` 拒绝加载，避免晦涩的 runtime error。

### 2.2 preloadUiDependencies 预加载与去重

`wc/widget-loader/index.js` 导出的 `preloadUiDependencies(widgets, options)` 在挂载一批物料前预加载其 UI 组件依赖（element-ui / element-plus），完成后再逐个 `mountWidget`。

关键机制（均来自源码）：

- **按 lib 分组**：以 `lib`（`element-ui` / `element-plus`）为键分组，组内合并所有物料的 `components` 到一个 `Set` 去重，避免多物料重复加载同一组件。`LIB_VUE_MAP = { 'element-ui': '2', 'element-plus': '3' }` 用于校验 `lib` 与物料 `vueVersion` 匹配，不匹配抛 `UI_DEP_LIB_MISMATCH`。
- **base CSS 统一加载一次**：每个 lib 分组初始化时 `styles` 集合默认含 `'base'`（`groups[lib] = { ..., styles: new Set(['base']) }`）。base.css 由基座统一加载一次，物料不再自带 base CSS，避免 N 个物料重复打包同一份 reset / 变量。
- **per-component 并行加载**：对去重后的每个组件生成 JS + CSS 两个 URL（默认解析器 `defaultResolveUiResource` 产出 `{cdnBase}/ui/{lib}@{version}/{component}.{ext}`），用 `Promise.all` 并行加载。单组件 JS 失败重试 1 次（`loadUiResourceWithRetry(url, loader, 1)`），CSS 失败只记录不阻断（样式缺失仅影响美观）。
- **复用 loadedResources Map 去重**：`loadUiResource` 直接委托 `loader.loadScript` / `loader.loadStyle`，二者内部已做 `loadedResources` 去重，同一 URL 的 Promise 只创建一次，多物料并发请求同一组件共享同一个 Promise。
- **全量包短路**：当 `uiDependencies.full === true` 时，直接加载 `full.js` + `full.css`（默认解析器 `defaultResolveFullResource` 产出 `{cdnBase}/ui/{lib}@{version}/full.{ext}`），跳过 per-component 加载。
- **IIFE 全局挂载约定**：`UI_GLOBAL_VARS = { 'element-ui': '__UI_ELEMENT_UI__', 'element-plus': '__UI_ELEMENT_PLUS__' }`，per-component bundle 执行后把组件挂到 `window[globalVar][componentName]`，`registerUiComponent` 读取后以 `el-{componentName}` 注册到对应 Vue 运行时。

体积收益（来自 `docs/elementui-on-demand-loading.md`）：全量包 `element-ui@2.15.14` JS gzip 约 198.6 kB、CSS 240 kB；`element-plus@2.7.0` JS gzip 约 353.5 kB、CSS 320 kB。按需加载可将首屏 UI 体积从约 350 kB 降至约 60～100 kB，多物料场景下减少 60%～80%。

### 2.3 loadScript / loadStyle 超时与重试

资源加载默认超时（来自 `wc/widget-loader/index.js`）：

```
const DEFAULT_LOAD_TIMEOUT = 15000;
```

`loadScript(url, timeout = DEFAULT_LOAD_TIMEOUT, opts = {})` 与 `loadStyle` 的重试参数：

- `opts.retries`：重试次数，默认 `3`。
- `opts.backoff`：退避基数（ms），默认 `1000`。
- 退避计算：`delay = backoffBase * Math.pow(2, n)`，即第 1 次重试等待 1000ms，第 2 次 2000ms，第 3 次 4000ms。

重试策略的关键区分（来自源码注释与实现）：

- **仅对真正的加载失败重试**：`SCRIPT_ERROR`（JS）与 `CSS_ERROR`（CSS）会触发重试。`onerror` 回调中移除 `<script>` / `<link>` 节点并 reject，`loadPromise.catch` 清理 `loadedResources` 缓存（仅当缓存仍指向当前 promise），允许后续重试重新发请求。
- **LOAD_TIMEOUT 不重试**：超时只通过 `Promise.race([loadPromise, timeoutPromise])` reject 给调用方，不移除 script 节点、不删除缓存。原因（源码注释）：超时可能底层仍在加载，重试会重复创建 `<script>` 标签并可能加剧网络拥塞。即使超时后脚本最终加载成功，后续调用复用已 resolve 的 `loadPromise`，不会重复创建 `<script>`。

竞态修复细节：真实加载结果（`loadPromise`，由 `onload` / `onerror` 决定）与超时（`timeoutPromise`）分离。真实加载提前完成时清理 `timer`，避免高频加载场景下 timer 堆积（源码标注为修复项 N4）。

`waitForCustomElement(name, timeout = 5000)` 优先使用原生 `customElements.whenDefined`（无 CPU 开销），不支持时降级为每 50ms 轮询 `customElements.get`。

### 2.4 资源缓存（loadedResources Map）

`WidgetLoader` 实例持有 `loadedResources = new Map()`（URL → Promise），是整个加载链路的去重核心：

- `_loadScriptOnce` / `_loadStyleOnce` 首行检查 `this.loadedResources.has(url)`，命中则直接返回缓存的 Promise，不发起新请求、不创建新标签。
- 首次加载时 `this.loadedResources.set(url, loadPromise)`，缓存真实加载结果（而非 race 结果），保证超时后真实加载成功仍可被复用。
- 真正失败（`onerror`）时 `loadPromise.catch` 中 `this.loadedResources.delete(url)`，但仅在缓存仍指向当前 promise 时删除，避免误删已被后续重试更新的缓存。

此外 `definedElements = new Set()` 记录已注册的 Custom Element 名，`loadWidget` 命中即短路返回，避免重复 `customElements.define` 抛错。

---

## 3. 运行时性能

### 3.1 多 Host 状态隔离（createWidgetLoader）

`WidgetLoader` 是一个类，模块级导出委托到一个默认单例 `defaultLoader`（保持向后兼容）。多 Host 场景（iframe 嵌套、微前端）应使用工厂 `createWidgetLoader(opts)` 创建独立实例：

```js
export const createWidgetLoader = (opts = {}) => new WidgetLoader(opts);
```

每个实例持有独立状态，避免同页多 Host 共享状态导致 A Host 的加载记录干扰 B Host：

- `hostId`：实例标识，`emitLifecycle` 会把它附加到每条生命周期事件 payload（`{ ...payload, hostId: this.hostId }`），订阅者可据此区分事件来源。
- `loadedResources` Map：资源去重池。
- `definedElements` Set：已注册 Custom Element 名。
- `widgetResources` Map：物料名 → `{ js, css }`，供 `unloadWidget` 清理。
- `mountedWidgets` Map：错误边界归因表（见 3.2）。
- `globalErrorListenerInstalled`：全局 error / unhandledrejection 监听是否已安装。
- `lifecycleHooks`：`{ loading: [], loaded: [], error: [], unmount: [] }` 生命周期钩子。

### 3.2 错误归因 Map（mountedWidgets 用 Map 而非 WeakMap）

`mountedWidgets = new Map()` 以物料 DOM 元素实例为 key，值为 `{ container, widget, failed }`。源码注释明确说明选用 `Map` 而非 `WeakMap` 的原因：

> 用 Map 而非 WeakMap：错误归因需 for...of 遍历所有已挂载物料，WeakMap 不可迭代；元素生命周期由 loader 管理（unmountWidget/unloadWidget 显式 delete），不会内存泄漏。

归因逻辑（`attributeErrorToWidget`）：

1. 资源错误（img/script 加载失败）：`target` 是元素，遍历 `mountedWidgets` 找到 `element.contains(target)` 命中的物料。
2. JS 运行时错误：按 `event.filename` / `event.message` / `event.error.stack` 拼接后，遍历匹配物料的 `js` URL 或物料名。
3. 未捕获的 Promise rejection：按 `reason.stack` 同样匹配物料的 `js` URL 或物料名。

命中后 `markWidgetFailed` 移除崩溃元素、`emitLifecycle('error')`、渲染降级占位，并 `event.preventDefault()` 抑制浏览器默认报错。

### 3.3 内存泄漏防护

- **unmountWidget(element)**：`emitLifecycle('unmount')` → `mountedWidgets.delete(element)` → `element.parentNode.removeChild(element)`。显式 delete 释放错误边界追踪引用。
- **unloadWidget(name)**：移除 `<script>` / `<link>` 标签（遍历比较 `src` / `href`，避免 URL 含特殊字符导致选择器语法错误）→ `loadedResources.delete(js)` / `loadedResources.delete(css)` → `widgetResources.delete(name)` → `definedElements.delete(name)`，使该物料可被重新加载（用于热更新、版本切换、A/B 测试）。
- **降级占位防堆叠**：`renderFallback` 首行移除容器内已有的 `.widget-error-placeholder`（`container.querySelectorAll('.widget-error-placeholder').forEach(...)`），避免多次失败时堆叠多个占位（源码标注为修复项 N8）。
- **fallback 样式只注入一次**：`injectFallbackStyles` 通过模块级 `fallbackStyleInjected` 标志保证 `<style data-widget-loader="fallback">` 只注入一次。
- **DevTools 事件环形缓冲**：`wc/devtools-extension/injected.js` 中 `MAX_EVENTS = 500`，`pushCapped` 超出则 `shift()`，避免生命周期 / 总线事件无限增长。

### 3.4 并发控制与不阻塞主线程

- `loadWidgets(widgets, opts)`：`opts.concurrency` 默认 `6`，分批 `Promise.all`，避免高频加载场景下请求堆积。
- `preloadWidgets(widgets, opts)`：`opts.concurrency` 默认 `3`（低于 `loadWidgets`，避免抢占主流程带宽），`opts.timeout` 默认 `30000`。优先使用 `requestIdleCallback` 在浏览器空闲时段分批加载，不支持时降级为 `setTimeout(0)`；当 `deadline.timeRemaining() <= 0` 且未超时时让出主线程重新调度，避免构成长任务阻塞主线程（源码标注为修复项 N7）。超时后未加载的物料标记 `reason: 'preload_timeout'` 跳过。

### 3.5 长页面物料数量建议

- 单页物料容器较多时，优先用 `preloadWidgets` 在空闲时段预热，避免用户滚动到视口时才发起请求造成卡顿。
- 批量构建容器时使用 `DocumentFragment` 一次性插入（基准见第 6 节"批量创建 100 个 widget 容器"），减少回流。
- 单个物料包过大时，按 `wc/README.md` §5.4 建议把公共业务逻辑拆成 chunks。
- 物料不再可见时应调用 `unmountWidget` 释放 DOM 与错误边界引用；确需彻底回收资源（如版本切换）时调用 `unloadWidget`。

---

## 4. 构建产物体积优化

### 4.1 externals 清单与 globals

见第 2.1 节。物料产物为 UMD 单文件（`formats: ['umd']`），`cssCodeSplit: false` 保证 CSS 合并为单文件，`sourcemap: true` 便于本地调试。文件名由 `fileName: () => '${name}.js'` 与 `cssFileName`（默认等于 `name`）决定。

### 4.2 CSS 命名空间与 scoped 样式

物料 CSS 必须隔离，避免泄漏污染基座与其他物料。`vite-plugin.js` 提供两层互补机制：

- **PostCSS 自动前缀**：`createNamespacePlugin(name)` 在构建期为所有 CSS 选择器自动添加 `.{name}` 前缀（`autoNamespace` 默认 `true`）。这是"自动修复"层。
- **构建期检查**：
  - `enforceScoped`（默认 `'error'`）：检测 `<style>` 是否加 `scoped`。可选 `'error'`（报错中止，默认）/ `'auto-add'`（自动补 scoped）/ `'warn'`（仅告警）/ `'off'`。
  - `enforceCssNamespace`（默认 `'warn'`）：检测选择器是否含 `.{name}` 命名空间前缀，发现遗漏时告警或报错。这是"发现遗漏"层，与 PostCSS 自动前缀互补。
- **不使用 Shadow DOM**：`generateVue3Wrapper` 中明确注释禁止 `defineCustomElement` / `attachShadow`，挂载到 light DOM，否则基座注入的 element-plus 全局样式 / 主题变量 / 字体图标无法穿透。`connectedCallback` 中带防御性守卫：检测到 `shadowRoot` 立即 `console.error`。

### 4.3 UMD 单文件输出

物料以 UMD 格式输出，依赖通过 globals 从 `window` 读取，可被 `<script>` 标签直接加载（与 `widget-loader.loadScript` 完全兼容）。这是 element-plus 等 ESM 含裸导入库无法直接走 CDN per-component 的解决前提——由 `ui-bundle-builder` 预打包为自包含 IIFE 单文件（详见 `docs/elementui-on-demand-loading.md` §4.3 策略 A）。

---

## 5. 性能监控与指标

### 5.1 widget-loader-debug 日志

`wc/widget-loader/index.js` 的 `isDebug()` 读取 `localStorage.getItem('widget-loader-debug') === 'true'`，开启后 `log()` 会向控制台输出 `[widget-loader]` 前缀的加载日志（loading script / script cached / script loaded / waiting for custom element 等），用于排查加载时序与缓存命中情况。

### 5.2 生命周期钩子

`onWidgetLifecycle(event, cb)` 订阅四个事件，每个事件 payload 含 `hostId`，可用于测量各阶段耗时：

| 事件 | 触发时机 | payload 关键字段 |
| --- | --- | --- |
| `loading` | `attemptMount` 开始（`emitLifecycle('loading', { name, container })`） | `name`, `container` |
| `loaded` | 元素挂载完成并注册到错误边界后 | `name`, `element`, `container` |
| `error` | 加载失败 / 版本不兼容 / 运行时崩溃归因 | `name`, `error`, `container` |
| `unmount` | `unmountWidget` | `name`, `element`, `container` |

基座可在 `loading` 与 `loaded` 之间打点计算单物料加载耗时，在 `error` 上累计失败率。

### 5.3 DevTools 扩展性能瀑布图

`wc/devtools-extension` 提供三个 Tab：widgets / events / **performance（性能）**。性能 Tab（`panel.html` 中 `data-tab="performance"`）展示：

- **统计概览**（`renderPerformance` 中 `perfStats`）：已注册（`totalRegistered`）、DOM 中（`totalInDom`）、生命周期事件数（`lifecycleCount`）、总线事件数（`busEventCount`）。
- **生命周期时间线**：倒序展示 `loading → loaded → error → unmount` 事件，每行含时间、事件类型、详情（物料名 / 错误信息），构成物料生命周期瀑布图。

数据通路：`widget-loader` 的 `emitLifecycle` 检测到 `window.__wcDevtoolsBridge.onLifecycle` 后转发事件；`injected.js`（MAIN world 注入）实现该 bridge，把事件存入 `lifecycleEvents` 环形缓冲（`MAX_EVENTS = 500`），同时 hook `customElements.define`（仅追踪 `bi-*` 前缀）与 `window.widgetBus.emit`。面板通过 `__wc-devtools-request` / `__wc-devtools-response` CustomEvent 双向通信拉取快照。

### 5.4 建议监控的关键指标

- **物料加载耗时**：`loading` → `loaded` 间隔的 P50 / P95（区分缓存命中与冷加载）。
- **加载失败率**：`error` 事件占比，按 `error.code` 拆分（`LOAD_TIMEOUT` / `SCRIPT_ERROR` / `CSS_ERROR` / `DEP_VERSION_MISMATCH` / `ELEMENT_TIMEOUT` / `PROPS_ERROR`）。
- **内存增长**：`mountedWidgets.size` 与 `loadedResources.size` 随时间变化，配合 `unmountWidget` / `unloadWidget` 调用频率评估泄漏。
- **重试开销**：`SCRIPT_ERROR` 重试次数与退避耗时占比。
- **首屏 UI 体积**：按需加载下实际加载的 per-component chunk 总量（对照第 2.2 节全量包基线）。

---

## 6. Benchmark 方法

### 6.1 运行基准测试

基准文件 `wc/widget-loader/__tests__/performance.bench.js` 使用 `@vitest-environment happy-dom`，包含 3 个基准。运行命令：

```bash
npx vitest bench
```

注意：普通 `vitest run` 不会收集 `.bench.js`；bench 无断言，仅测耗时（如需阈值断言见同目录 `performance.test.js`）。

测试环境关键设定（来自源码）：

- mock `i18n` / `widget-context`（widget-loader 顶部 import）。
- 双重劫持 `document.createElement('script')` 与 `head.appendChild`：在微任务里手动触发 `onload`，且不真正 append `<script>` 到 DOM（保持 `isConnected=false`），避免 happy-dom 触发真实网络请求。
- `LEAK_TAG = 'bi-perf-leak'` 自定义元素用 `customElements.get` guard 防止重复 define 抛错。
- `cleanScripts()` 在每轮清理 `head` 内 `<script>`，避免跨轮次 DOM 堆积影响测量。

### 6.2 三个基准解读

1. **并发加载 50 个物料（去重命中缓存）**：首轮加载 `CACHE_URL` 写入 `loadedResources`，后续 50 次 `Promise.all` 全部命中缓存，测量缓存命中路径开销（Map lookup + Promise 复用）。
2. **并发加载 50 个不同 URL 物料**：每轮 `loadedResources.clear()` + `cleanScripts()` 重置，加载 50 个不同 URL（`diff-${i}.js`），测量真实并发加载路径（createElement + appendChild mock + onload 微任务）。
3. **批量创建 100 个 widget 容器**：用 `DocumentFragment` 批量插入 100 个 `div.widget-container`，测量长页面 DOM 批量构建性能，测后 `host.remove()` 清理。

**缓存命中 vs 不同 URL 并发的对比**：基准 1 全程命中 `loadedResources` 缓存，基准 2 每轮走真实加载路径（含 createElement / 微任务 onload），二者耗时差异约 57 倍量级，体现了去重缓存对并发加载场景的显著收益。该量级为经验观测值，实际数值随环境（happy-dom 版本、机器负载）波动，应以本地 `npx vitest bench` 实测为准。

### 6.3 自定义 benchmark 方法

- 复用 `createWidgetLoader({ hostId })` 创建隔离实例，避免污染默认单例。
- 在 `bench` 回调内显式 `loadedResources.clear()` / `cleanScripts()` 控制起止状态，确保测量的是目标路径。
- 需要测量 CSS 加载路径时，对 `<link rel="stylesheet">` 做类似的 onload 劫持（当前基准仅劫持 `<script>`）。
- 需要测量 `waitForCustomElement` 时，提前 `customElements.define` 目标元素避免轮询降级路径干扰。
- 长页面场景参考基准 3 的 `DocumentFragment` 模式，避免逐个 `appendChild` 触发回流。

---

## 7. 性能反模式（应避免）

- **物料自带 base CSS 导致重复加载**：`preloadUiDependencies` 已把 `base` 纳入基座统一加载集合，物料产物不应再打包 base CSS。违反会导致 N 个物料重复加载同一份 reset / 变量（见第 2.2 节）。
- **未声明 runtimeDeps 导致 lodash/axios 被打包进物料**：物料若使用 lodash / axios 但未在 `widget.runtimeDeps` 声明，构建期虽 external 化但运行时 `checkDependencies` 不会校验存在性，且若误改 externals 会把整包打入物料产物，体积膨胀。应始终声明 `runtimeDeps: ['lodash', 'axios']`（取值限于 `RUNTIME_DEP_KEYS`）。
- **多 Host 共享同一个默认 loader 实例**：iframe 嵌套 / 微前端场景下若不使用 `createWidgetLoader` 创建独立实例，A Host 的 `loadedResources` / `definedElements` / `mountedWidgets` 会与 B Host 串扰，导致缓存误命中或错误归因错位（见第 3.1 节）。
- **mountedWidgets 不清理导致泄漏**：仅移除 DOM 元素而不调用 `unmountWidget`，`mountedWidgets` Map 仍持有 `{ container, widget, failed }` 引用，widget 对象（含闭包）无法回收。必须经 `unmountWidget`（显式 `delete`）或 `unloadWidget` 清理（见第 3.3 节）。
- **误用 Shadow DOM**：使用 `defineCustomElement` / `attachShadow` 会导致 element-plus 全局样式无法穿透，物料样式错乱（见第 4.2 节）。
- **超时后强制重试加剧拥塞**：`LOAD_TIMEOUT` 不重试是设计决策，调用方不应在超时后立即再次 `loadScript` 同一 URL（源码已保证超时不清理缓存，重试会重复创建 `<script>`），应走 `SCRIPT_ERROR` 的指数退避路径或等待用户手动重试（见第 2.3 节）。

---

## 8. 优化路线图（可选的未来优化）

以下为源码尚未实现、可作为后续演进的优化方向：

- **HTTP/2 Server Push / 资源预加载提示**：基座在看板配置阶段已知物料 JS/CSS 与 UI 组件清单，可通过 `<link rel="preload">` 或 HTTP/2 push 提前推送，缩短首屏 RTT。
- **Service Worker 缓存**：对 `lib@version` 形态的 UI 组件 chunk 与物料产物做 Service Worker 离线缓存，URL 已含版本号天然适合 `Cache-Control: immutable`（见 `docs/elementui-on-demand-loading.md` §4.5 缓存层次），可进一步做跨会话缓存与离线可用。
- **物料预加载策略增强**：当前 `preloadWidgets` 基于编辑态全量预热，未来可结合视口可见性（IntersectionObserver）做"接近视口预加载"，进一步降低空闲时段带宽占用。
- **虚拟滚动**：长页面物料容器上百时，对非视口区域 `unmountWidget` 释放 DOM、进入视口时重新 `mountWidget`（`loadedResources` 已缓存脚本，重新挂载仅重建元素，开销低），控制常驻 DOM 节点数。
- **运行时崩溃归因增强**：当前归因依赖 `filename` / 堆栈匹配物料的 `js` URL 或物料名，对压缩后无 source map 的物料可能归因不到（见 `wc/README.md` §5.5 待增强）。可结合 source map 上报还原，或为物料产物统一注入加载器可识别的 error boundary 标记。
- **指标上报接入监控平台**：`wc/README.md` §5.5 待增强项——加载失败日志上报到 Sentry 等；可基于第 5.2 节生命周期钩子统一采集 P50 / P95 / 失败率。
- **重试退避可配置化**：当前 `retries` / `backoff` 已支持 per-call 覆盖，未来可由基座按 CDN 健康度动态调整全局默认值，避免对持续故障的 CDN 反复打请求。
