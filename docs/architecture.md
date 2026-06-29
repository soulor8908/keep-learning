# 跨技术栈看板物料集成技术架构

本文档面向需要理解项目内部实现的前端开发者，介绍跨 Vue 2 / Vue 3 / H5 技术栈的看板物料是如何被基座加载、隔离与打包的。

## 目录

1. [架构总览](#1-架构总览)
2. [Vue 2 / Vue 3 双运行时隔离](#2-vue-2--vue-3-双运行时隔离)
3. [物料加载流程](#3-物料加载流程)
4. [分包构建](#4-分包构建)
5. [错误边界](#5-错误边界)
6. [多基座形态](#6-多基座形态)
7. [运行时按需加载](#7-运行时按需加载)

---

## 1. 架构总览

项目由三个层次组成：

- **基座（Host）**：负责提供运行时环境、加载物料、渲染看板。
  - `demo/host`：统一基座，Vue2 / Vue3 / H5 物料全部走 `loader`。
  - `demo/vue2-host`：Vue2 单栈基座，同栈 Vue2 物料走 ESM 直引，跨栈走 `loader`。
  - `demo/h5-host`：H5 单栈基座，同栈 H5 物料走 ESM 直引，跨栈走 `loader`。
- **运行时核心**：`wc/loader.js`、`wc/WidgetHost.vue`、`wc/templates/`。
- **物料（Widget）**：独立的 `.js` + `.css` 产物，通过 UMD + `mount()` 接入基座。

```text
┌─────────────────────────────────────────────────────────────┐
│                         基座 Host                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ window.Vue2 │  │ window.Vue3 │  │  loader.js          │  │
│  │ window.ELEMENT│  │ window.ElementPlus │  │  (loadScript /   │  │
│  │             │  │             │  │   loadStyle /       │  │
│  │             │  │             │  │   mountWidget)      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│         └────────────────┴────────────────────┘             │
│                          │                                  │
│              WidgetHost.vue 组件挂载物料                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                          ▼                                  │
│                    物料 Widget (UMD)                         │
│   ┌─────────────────────┐  ┌─────────────────────────────┐  │
│   │ sales-panel.js      │  │ finance-panel.js            │  │
│   │ Vue 2 物料          │  │ Vue 3 物料                  │  │
│   │ external: vue       │  │ external: vue               │  │
│   └─────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Vue 2 / Vue 3 双运行时隔离

### 2.1 全局变量约定

| 全局变量 | 含义 | 注入位置 |
| --- | --- | --- |
| `window.Vue2` | Vue 2 运行时 | `loader.ensureRuntimes({ vue2: true })`（缺失时按 `/runtime/vue2.js` 拉取） |
| `window.Vue3` | Vue 3 运行时 | `loader.ensureRuntimes({ vue3: true })`（缺失时按 `/runtime/vue3.js` 拉取） |
| `window.ELEMENT` | ElementUI 组件库 | `loader.ensureRuntimes({ elementUi: true })`（自动先加载 vue2） |
| `window.ElementPlus` | ElementPlus 组件库 | `loader.ensureRuntimes({ elementPlus: true })`（自动先加载 vue3） |
| `window._` | lodash 工具库 | 各 host 的 `index.html` 按需引入 |

### 2.2 物料如何被隔离

每个物料被打包成独立的 UMD 文件，并声明依赖的 Vue 主版本（`vueVersion: '2' | '3' | 'none'`）。构建时通过 `external` 排除 Vue，运行时使用基座注入的全局对象：

```js
// Vue3 物料构建配置
rollupOptions: {
  external: ['vue', 'element-plus'],
  output: {
    globals: { vue: 'Vue3', 'element-plus': 'ElementPlus' }
  }
}
```

---

## 3. 物料加载流程

`wc/loader.js` 提供从脚本加载到 DOM 挂载的完整流程。

### 3.1 加载流程图

```text
基座调用 WidgetHost 组件 / 直接调用 mountWidget
    │
    ├─ ensureRuntimes(needs)   // 按物料声明的 vueVersion + runtimeDeps 补齐 window 全局变量
    │     ├─ vueVersion: '2'  → 缺 Vue2 拉取 /runtime/vue2.js
    │     ├─ vueVersion: '3'  → 缺 Vue3 拉取 /runtime/vue3.js
    │     ├─ runtimeDeps: ['element-ui']   → 自动先 vue2 再拉 element-ui（含 install）
    │     └─ runtimeDeps: ['element-plus'] → 自动先 vue3 再拉 element-plus
    ├─ loadScript(js)          // 加载物料 UMD JS 文件
    ├─ loadStyle(css)          // 加载 CSS 文件（可选）
    ├─ findWidget(name)        // 从 window 上查找物料
    └─ mod.mount(container)    // 调用物料的 mount 方法
         │
         └─ 返回 unmount 函数，用于卸载时清理
```

### 3.2 关键函数

#### `loadScript(url)`

- 使用 `<script>` 标签动态加载 JS；
- 通过 `cache` Map 做去重缓存，避免同一 URL 被重复加载；
- 加载失败时从缓存中移除，支持重试。

#### `loadStyle(url)`

- 使用 `<link>` 标签动态加载 CSS；
- 引用计数，卸载时清理不再需要的样式。

#### `ensureRuntimes(needs)`

按物料声明的 `vueVersion` + `runtimeDeps` 把缺失的全局变量按需补齐。已存在的全局变量直接跳过，前置依赖自动解析（element-ui → vue2，element-plus → vue3）。详见 [第 7 节](#7-运行时按需加载)。

#### `mountWidget(container, widget)`

对外的挂载入口：

1. 调用 `ensureRuntimes` 按物料声明补齐 `window.Vue2/Vue3/ELEMENT/ElementPlus`；
2. 加载脚本和样式；
3. 检查依赖（Vue 运行时是否加载）；
4. 从 `window[name]` 查找物料模块；
5. 调用 `mod.mount(container, props)` 挂载；
6. 失败时渲染错误占位。

#### `unmountWidget(api)`

调用物料返回的 `unmount()` 函数，清理 DOM 和样式。

---

## 4. 分包构建

### 4.1 构建流程

每个技术栈的物料通过 `build.mjs` 自动分包构建：

```text
src/widgets/
├── finance-panel/
│   ├── index.js           // 物料入口
│   └── FinancePanel.vue   // Vue 组件
├── user-panel/
│   ├── index.js
│   └── UserPanel.vue
└── ...

构建脚本扫描 src/widgets/ 目录
    │
    ├─ finance-panel → finance-panel.js + finance-panel.css
    ├─ user-panel → user-panel.js + user-panel.css
    └─ ...
```

### 4.2 UMD 全局名

UMD 全局变量名直接等于目录名，不再做转换：

| 目录名 | UMD 全局名 |
|--------|-----------|
| `finance-panel` | `finance-panel` |
| `user-panel` | `user-panel` |
| `sales-panel` | `sales-panel` |
| `clock-widget` | `clock-widget` |

构建完成后会在 `dist/` 目录生成 `manifest.json`，记录所有物料的 name 和文件路径，基座可直接读取配置，无需依赖命名约定。

### 4.3 产物结构

```
demo/vue3-widgets/dist/
├── finance-panel.js    # 3.7 KB
├── finance-panel.css   # 0.5 KB
├── user-panel.js       # 3.3 KB
└── user-panel.css      # 0.4 KB
```

---

## 5. 错误边界

### 5.1 设计目标

- 单个物料崩溃不拖垮整个看板；
- 自动捕获加载失败并渲染降级占位；
- 提供可点击重试。

### 5.2 错误降级

`mountWidget` 失败时，`renderError` 会：

1. 渲染错误占位节点，显示错误信息；
2. 提供「重试」按钮；
3. 重试时重新调用 `mountWidget`，不影响其他物料。

```js
// wc/loader.js
function renderError(container, message, canRetry) {
  container.innerHTML = `
    <div class="widget-error">
      <div>${message}</div>
      ${canRetry ? '<button class="widget-error__retry">重试</button>' : ''}
    </div>
  `;
}
```

---

## 6. 多基座形态

实际业务里基座本身往往也是某种技术栈：Vue2 老页面、H5 营销页等。本项目提供三种基座形态，分别对应「同栈直引」与「跨栈 UMD」两种加载路径的组合。

| 基座 | 端口 | 同栈物料 | 跨栈物料 |
|------|------|----------|----------|
| `demo/host` | 5000 | 无 | Vue2 / Vue3 / H5 全部走 `loader`（UMD） |
| `demo/vue2-host` | 5001 | Vue2 物料 ESM 直引（Vite 编译 SFC） | Vue3 / H5 走 `loader` |
| `demo/h5-host` | 5002 | H5 物料 ESM 直引（直接调用 render 函数） | Vue2 / Vue3 走 `loader` |

### 6.1 同栈 ESM 直引

当物料与基座同栈时，没有理由再绕一圈 UMD 协议：直接 `import` SFC（Vue2/Vue3）或 render 函数（H5），由 Vite 编译挂载。

```js
// vue2-host/src/App.vue
import Vue from 'vue';
import SalesPanel from '../../vue2-widgets/src/widgets/sales-panel/SalesPanel.vue';

// 同栈：ESM 直引，Vite 编译 SFC
const app = new Vue({ render: (h) => h(SalesPanel, { props }) });
app.$mount(container);

// 跨栈：走 loader（loader 内部按需加载 Vue3 / element-plus）
await mountWidget(container, {
  name: 'biFinancePanel',
  js: '/widgets/finance-panel.js',
  vueVersion: '3',
  runtimeDeps: ['element-plus']
});
```

```js
// h5-host/src/main.js
import { renderChart } from '../../h5-widgets/src/widgets/chart-widget/ChartWidget.js';

// 同栈：H5 render 函数直接调用
const cleanup = renderChart(container, props);

// 跨栈：走 loader
await mountWidget(container, {
  name: 'biOrderPanel',
  js: '/widgets/order-panel.js',
  vueVersion: '2',
  runtimeDeps: ['element-ui']
});
```

### 6.2 基座自身的 Vue2 注入

`vue2-host` 自身是 Vue2 应用，`main.js` 直接把 `Vue` 暴露到 `window.Vue2`，作为同栈物料与 loader 检测的「已存在」运行时：

```js
// demo/vue2-host/src/main.js
import Vue from 'vue';
window.Vue2 = Vue;          // loader.ensureRuntimes 检测到已存在则跳过加载
new Vue({ render: (h) => h(App) }).$mount('#app');
```

`loader.ensureRuntimes` 在 `vueVersion: '2'` 时只会检查 `window.Vue2` 是否存在，存在就跳过——因此 `vue2-host` 中跨栈 Vue3 物料才需要走 loader 拉 vue3.js，但同栈 Vue2 物料与 vue2-host 自身共享同一份 Vue2 运行时。

### 6.3 基座 vite 配置的差异

| 基座 | LOCAL_MAP 包含 |
|------|----------------|
| `demo/host` | vue2 + vue3 + element-ui + element-plus（全量，因为基座本身不暴露任何 Vue 运行时） |
| `demo/vue2-host` | 仅 vue3 + element-plus（vue2 由 vue2-host 自身的 `import Vue from 'vue'` 提供，element-ui 由 `App.vue` 中 `import('element-ui')` 动态加载） |
| `demo/h5-host` | vue2 + vue3 + element-ui + element-plus（H5 基座自身无框架，跨栈物料需要全部走 loader） |

---

## 7. 运行时按需加载

基座不再在 `index.html` 首屏全量注入 Vue2 / Vue3 / element-ui / element-plus。`mountWidget` 在加载物料 UMD 之前，先调用 `ensureRuntimes` 按物料声明（`vueVersion` + `runtimeDeps`）补齐缺失的全局变量。

### 7.1 加载策略

| 物料声明 | loader 行为 |
|---------|------------|
| `vueVersion: '2'` | 检查 `window.Vue2`，缺失则加载 `/runtime/vue2.js` |
| `vueVersion: '3'` | 检查 `window.Vue3`，缺失则加载 `/runtime/vue3.js` |
| `vueVersion: 'none'` | 不加载任何 Vue 运行时（H5 物料） |
| `runtimeDeps: ['element-ui']` | 加载 element-ui（前置依赖 vue2 自动先加载） |
| `runtimeDeps: ['element-plus']` | 加载 element-plus（前置依赖 vue3 自动先加载） |

### 7.2 默认运行时 URL

`loader.js` 内置默认 URL 表：

```js
const DEFAULT_RUNTIME_URLS = {
  vue2:           { js: '/runtime/vue2.js',          globalVar: 'Vue2' },
  vue3:           { js: '/runtime/vue3.js',          globalVar: 'Vue3' },
  'element-ui':   { js: '/runtime/element-ui.js',   css: '/runtime/element-ui.css',
                    globalVar: 'ELEMENT',     requires: 'vue2' },
  'element-plus': { js: '/runtime/element-plus.js', css: '/runtime/element-plus.css',
                    globalVar: 'ElementPlus', requires: 'vue3' }
};
```

各基座的 `vite.config.js` 通过 `localServePlugin` 中间件把这些 URL 映射到本地 `node_modules` 文件，断网环境也能跑（详见各基座 vite 配置的 `LOCAL_MAP`）。

### 7.3 URL 覆盖

业务侧可通过 `window.__WIDGET_RUNTIME_URLS__` 在 `mountWidget` 调用前覆盖默认 URL，把运行时打到自有 CDN：

```js
window.__WIDGET_RUNTIME_URLS__ = {
  vue3: { js: 'https://cdn.example.com/vue@3.4.21.js', globalVar: 'Vue3' },
  'element-plus': {
    js: 'https://cdn.example.com/element-plus@2.7.0.js',
    css: 'https://cdn.example.com/element-plus@2.7.0.css',
    globalVar: 'ElementPlus',
    requires: 'vue3'
  }
};
```

### 7.4 element-ui 的 Vue 兼容处理

`element-ui` 在浏览器中挂载时需要全局 `Vue` 而非 `Vue2`。`ensureRuntimes` 内部在加载 element-ui 前会把 `window.Vue = window.Vue2` 临时桥接，并在加载完成后调用 `window.Vue2.use(window.ELEMENT)` 完成 install——这一层是 element-ui 老代码的兼容补丁，不影响 Vue3 物料。

### 7.5 与 ElementUI 按需加载的关系

本节描述的「运行时按需加载」是把整个 element-ui / element-plus 全量包按物料声明懒加载，目标是消除首屏 UI 库体积。进一步的「按组件按需加载」（只加载物料用到的 Button / Input / Select 等）属于更精细的优化，详见 [`docs/elementui-on-demand-loading.md`](./elementui-on-demand-loading.md) 的注册表驱动方案设计。

---

## 关键文件索引

| 文件 | 用途 |
|------|------|
| `wc/loader.js` | UMD 加载、依赖检查、错误降级、运行时按需加载（`ensureRuntimes`） |
| `wc/WidgetHost.vue` | Vue3 基座组件 |
| `wc/templates/vue3.js` | Vue3 物料入口模板 |
| `wc/templates/vue2.js` | Vue2 物料入口模板 |
| `wc/templates/h5.js` | H5 物料入口模板 |
| `demo/host/index.html` | 统一基座 HTML |
| `demo/host/src/App.vue` | 统一基座主组件，物料注册表 |
| `demo/host/vite.config.js` | 统一基座 Vite 配置，运行时与物料文件映射 |
| `demo/vue2-host/index.html` | Vue2 单栈基座 HTML（无运行时 script tag） |
| `demo/vue2-host/src/App.vue` | Vue2 单栈基座（同栈 ESM + 跨栈 loader） |
| `demo/vue2-host/vite.config.js` | 仅映射跨栈所需运行时（vue3 + element-plus） |
| `demo/h5-host/src/main.js` | H5 单栈基座（同栈 ESM render + 跨栈 loader） |
| `demo/h5-host/vite.config.js` | 全量运行时映射（vue2/vue3/element-ui/element-plus） |
| `demo/*/build.mjs` | 分包构建脚本 |
