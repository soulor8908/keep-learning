# 跨技术栈看板物料集成技术架构

本文档面向需要理解项目内部实现的前端开发者，介绍跨 Vue 2 / Vue 3 / H5 技术栈的看板物料是如何被基座加载、隔离与打包的。

## 目录

1. [架构总览](#1-架构总览)
2. [Vue 2 / Vue 3 双运行时隔离](#2-vue-2--vue-3-双运行时隔离)
3. [物料加载流程](#3-物料加载流程)
4. [分包构建](#4-分包构建)
5. [错误边界](#5-错误边界)

---

## 1. 架构总览

项目由三个层次组成：

- **基座（Host）**：负责提供运行时环境、加载物料、渲染看板。
  - `demo/host`：统一基座，同时加载 Vue2 + Vue3 运行时。
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
| `window.Vue2` | Vue 2 运行时 | `demo/host/index.html` |
| `window.Vue3` | Vue 3 运行时 | `demo/host/index.html` |
| `window.ELEMENT` | ElementUI 组件库 | `demo/host/index.html` |
| `window.ElementPlus` | ElementPlus 组件库 | `demo/host/index.html` |
| `window._` | lodash 工具库 | `demo/host/index.html` |

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
基座调用 WidgetHost 组件
    │
    ├─ loadScript(js)          // 加载 UMD JS 文件
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

#### `mountWidget(container, widget)`

对外的挂载入口：

1. 加载脚本和样式；
2. 检查依赖（Vue 运行时是否加载）；
3. 从 `window[name]` 查找物料模块；
4. 调用 `mod.mount(container, props)` 挂载；
5. 失败时渲染错误占位。

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

### 4.2 UMD 全局名转换

目录名自动转换为 UMD 全局名：

| 目录名 | UMD 全局名 |
|--------|-----------|
| `finance-panel` | `biFinancePanel` |
| `user-panel` | `biUserPanel` |
| `sales-panel` | `biSalesPanel` |
| `clock-widget` | `biClockWidget` |

转换规则：`bi` + 首字母大写 + kebab 转 camelCase。

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

## 关键文件索引

| 文件 | 用途 |
|------|------|
| `wc/loader.js` | UMD 加载、依赖检查、错误降级 |
| `wc/WidgetHost.vue` | Vue3 基座组件 |
| `wc/templates/vue3.js` | Vue3 物料入口模板 |
| `wc/templates/vue2.js` | Vue2 物料入口模板 |
| `wc/templates/h5.js` | H5 物料入口模板 |
| `demo/host/index.html` | 基座 HTML，注入运行时依赖 |
| `demo/host/src/App.vue` | 基座主组件，物料注册表 |
| `demo/host/vite.config.js` | 基座 Vite 配置，物料文件映射 |
| `demo/*/build.mjs` | 分包构建脚本 |
