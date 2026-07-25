# @wc/core — 跨技术栈看板物料加载核心（纯 ESM + importmap）

通过 **ESM + 浏览器原生 importmap** 把 Vue2 / Vue3 / H5 物料以统一方式接入同一个看板。
依赖隔离与共享全部交给 importmap 的 `scopes`，运行时只做动态 `import()` + CSS 引用计数 + 错误降级，
不再依赖任何 `window` 全局变量，也不再使用 UMD。

> 本方案已完全移除 UMD。旧版的 `external + globals + window.Vue2/Vue3`、`ensureRuntimes`、
> `checkDeps`/版本校验等机制全部删除——importmap 是依赖的单一来源，缺依赖时 `import()` 直接抛错被降级捕获。

## 与 UMD 旧方案的根本差异

| 维度 | UMD 旧方案 | ESM 新方案 |
|------|-----------|-----------|
| 物料产物 | UMD（`window[name]`） | ESM（`import()` 命名空间） |
| 依赖隔离 | `external` + `globals` + `window.Vue2/Vue3` | importmap `scopes`（`/widgets/vue2/*`→Vue2，`/widgets/vue3/*`→Vue3） |
| 运行时按需 | `ensureRuntimes` 拉 `/runtime/*.js` 注 `window.*` | 浏览器原生模块图按需拉取，importmap 单一来源 |
| 版本校验 | `checkVersionCompat`（自写 semver 子集） | 不需要——版本由 importmap 钉死 |
| 基座加载 | `mountWidget(c, { name, js, vueVersion, runtimeDeps })` | `mountWidget(c, { name, url, css })` |

## 目录

```
wc/
├── loader.js            # 动态 import() + URL 缓存 + CSS 引用计数 + 错误降级 + 会话防竞态 + 超时 + 预热
├── WidgetHost.vue       # Vue3 基座组件（props 用 url/css，无 vueVersion/runtimeDeps）
├── compat.js            # 浏览器兼容（可选项）：旧浏览器注入 es-module-shims polyfill
├── importmap-gen.js     # UI 分组按需共享工具（生成 importmap / resolver / manual 校验）
├── ui-groups.json       # UI 组件库分组策略（唯一配置源）
├── templates/           # Vue2 / Vue3 / H5 物料入口模板
│   ├── vue2.js
│   ├── vue3.js
│   └── h5.js
└── __tests__/           # 单元测试（vitest + happy-dom）
```

## 核心 API

| 导出 | 说明 |
|------|------|
| `mountWidget(container, widget)` | 加载并挂载 ESM 物料。`widget: { name?, url, css?, props?, context?, cssIntegrity?, timeout?, onError? }`。**一个容器一个物料**：同容器重复挂载自动取消/卸载旧实例（防竞态覆盖）。返回 `{ unmount, update }`：`update(props)` 热更新返回 `true`，物料不支持 update 返回 `false`（调用方应重挂载） |
| `unmountWidget(api)` | 卸载物料（等价 `api.unmount()`，按引用计数移除 CSS，自动清理物料经 `on()` 注册的全局监听） |
| `unmountContainer(container)` | 取消/卸载容器上的当前物料（含进行中的挂载），用于基座组件销毁时 api 尚未 resolve 的场景 |
| `preloadWidgets(urls)` | 懒加载预热（`requestIdleCallback` 内 `import()`） |
| `injectImportmapShim()` / `supportsImportmap()` | 浏览器兼容（见下） |
| `generateImportmap(groups, opts)` / `loadUiGroups()` / `createGroupResolver()` / `createManualCheckPlugin()` | UI 分组按需构建/注入工具 |
| `createVue2Widget` / `createVue3Widget` / `createH5Widget` | 三种技术栈物料入口模板（均支持 props 热更新：mount 返回 `{ unmount, update }`） |

### mountWidget 选项

| 选项 | 默认 | 说明 |
|------|------|------|
| `timeout` | `30000` | 加载超时毫秒数（`0` 表示不限制）。超时只是放弃等待走错误降级，底层 import 成功后仍进缓存（相当于预热） |
| `onError(err, { name, url, container })` | - | 失败上报钩子（监控用），钩子自身抛错不阻断错误降级 |
| `cssIntegrity` | - | CSS 的 SRI 校验值（设置 `<link integrity crossorigin>`） |

### WidgetHost（Vue3 基座组件）

props：`name`、`url`、`css`、`widgetProps`、`context`、`cssIntegrity`、`timeout`、`onBeforeMount`、`onMounted`、`onUnmounted`。
事件：`@widget-event`（物料 emit 转发）、`@widget-error`（加载失败上报）。

- `url` / `name` / `css` 变化 → 重挂载
- `widgetProps` 变化 → 物料支持 `update` 则热更新（不重挂载、内部状态保留），否则退化为重挂载
- 挂载期间 `widgetProps` 变化会在挂载完成后自动对齐一次最新 props

## 物料加载流程

```
基座 index.html 由 vite 插件注入 <script type="importmap">{ imports, scopes }</script>
  - imports:  vue / lodash / axios / element-plus/{common,table,form,heavy} 等 canonical URL
  - scopes:   /widgets/vue2/* → vue=Vue2；/widgets/vue3/* → vue=Vue3

mountWidget(container, { url: '/widgets/vue3/finance-panel.js', css, props })
  1. 取消同容器旧会话（防竞态），容器加 widget-loading class
  2. loadModule(url)        → 动态 import()，浏览器按 importmap 解析 bare import，自动隔离 Vue2/Vue3
  3. loadStyle(css)         → <link> 引用计数，多物料共享同一份 CSS
  4. mod.default.mount(c, props) → 物料内部 createApp/new Vue/innerHTML
  5. 失败 → onError 上报 + renderError（textContent 纯文本渲染，错误占位 + 重试按钮）
  6. 卸载 → api.unmount() + on() 监听自动清理 + CSS 引用计数平衡
```

## 写一个物料（Vue3）

```js
// src/widgets/finance-panel/index.js
import FinancePanel from './FinancePanel.vue';
import { createVue3Widget } from '@wc/core/templates/vue3';

export default createVue3Widget(FinancePanel, { deps: ['element-plus'] });
```

物料 SFC 里直接写 `<el-table>`，UI 组件由构建期（`unplugin-vue-components` + `createGroupResolver`）
自动注入 `import { ElTable } from 'element-plus/table'`，运行时由 importmap 解析到分组 URL。
**不再需要** `app.use(ElementPlus)` 全量注册，也**不再读** `window.ElementPlus`。

## 浏览器兼容（可选项）

纯 ESM + importmap 要求 Chrome 89+ / Edge 89+ / Firefox 108+ / Safari 16.4+。
对支持原生 ESM 但不支持 importmap 的旧浏览器，引入 [es-module-shims](https://github.com/guybedford/es-module-shims) 即可，物料与基座代码无需改动。

- **Vite 基座**：`COMPAT=true pnpm serve`，`importmapInjectPlugin` 会在 importmap 前注入 shim 标签。
- **静态 HTML**：运行时 `import { injectImportmapShim } from '@wc/core/compat'; injectImportmapShim();`
  （需在 importmap 之前调用）。

es-module-shims 在已支持 importmap 的浏览器里是 no-op，因此也可以无条件引入；做成可选项
只是为不在现代浏览器多拉一个约 6KB 的脚本。离线/内网可用 `window.__WIDGET_SHIM_URL__` 覆盖 shim URL。

## 测试

```bash
pnpm test:run     # 单元测试（vitest + happy-dom）
pnpm e2e          # 端到端（Playwright，自动构建物料并启动 host）
```
