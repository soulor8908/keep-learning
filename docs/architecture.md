# 跨技术栈看板物料集成技术架构

本文档面向需要理解项目内部实现的前端开发者，介绍跨 Vue 2 / Vue 3 / H5 技术栈的看板物料是如何被基座加载、隔离与打包的。

> 本方案为**纯 ESM**：所有依赖（vue / element-ui / element-plus）通过浏览器原生 `importmap` 解析，物料以 ESM 产物 + `mount()` 接入基座。不再有 UMD 产物、不再有 `window.Vue2` / `window.Vue3` / `window.ElementPlus` 全局变量、不再有 `loader.ensureRuntimes` 运行时按需补齐逻辑。

## 目录

1. [架构总览](#1-架构总览)
2. [Vue 2 / Vue 3 依赖隔离（importmap scopes）](#2-vue-2--vue-3-依赖隔离importmap-scopes)
3. [物料加载流程](#3-物料加载流程)
4. [分包构建](#4-分包构建)
5. [UI 组件库分组按需加载](#5-ui-组件库分组按需加载)
6. [错误边界](#6-错误边界)
7. [多基座形态](#7-多基座形态)
8. [浏览器兼容（可选）](#8-浏览器兼容可选)

---

## 1. 架构总览

项目由三个层次组成：

- **基座（Host）**：负责提供运行时环境、加载物料、渲染看板。
  - `demo/host`：统一基座（Vue3），Vue2 / Vue3 / H5 物料全部走 `loader` 动态 `import()`。
  - `demo/vue2-host`：Vue2 单栈基座，同栈 Vue2 物料走 ESM 直引，跨栈走 `loader`。
  - `demo/h5-host`：H5 单栈基座，同栈 H5 物料走 ESM 直引，跨栈走 `loader`。
- **运行时核心**：`wc/loader.js`、`wc/WidgetHost.vue`、`wc/host-plugin.js`、`wc/importmap-gen.js`、`wc/compat.js`、`wc/templates/`。
- **物料（Widget）**：独立的 ESM `.js` + `.css` 产物，通过 `mount()` 接入基座。

```text
┌─────────────────────────────────────────────────────────────┐
│                         基座 Host                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  index.html  ←  importmapInjectPlugin 注入 importmap  │   │
│  │    <script type="importmap">{ imports, scopes }</script>│  │
│  └──────────────────────────────────────────────────────┘   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  vue (CDN)  │  │ element-plus│  │  loader.js          │  │
│  │  importmap  │  │  importmap  │  │  (dynamic import()  │  │
│  │   顶层解析  │  │   顶层解析  │  │   + modCache + CSS) │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         └────────────────┴────────────────────┘             │
│                          │                                  │
│              WidgetHost.vue 组件挂载物料                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                          ▼                                  │
│                    物料 Widget (ESM)                         │
│   ┌─────────────────────┐  ┌─────────────────────────────┐  │
│   │ sales-panel.js      │  │ finance-panel.js            │  │
│   │ Vue 2 物料          │  │ Vue 3 物料                  │  │
│   │ external: vue       │  │ external: vue               │  │
│   │ external: element-ui│  │ external: element-plus/*    │  │
│   └─────────────────────┘  └─────────────────────────────┘  │
│   物料内部 import 'vue' / 'element-ui/common' 等 bare import │
│   由 importmap scopes（/widgets/vue2/）解析到对应版本        │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Vue 2 / Vue 3 依赖隔离（importmap scopes）

### 2.1 隔离机制

纯 ESM 方案下，Vue2 与 Vue3 的隔离由 importmap 的 `scopes` 完成：物料 URL 前缀决定其内部 `bare 'vue'` 解析到哪个版本。

```json
{
  "imports": {
    "vue": "https://esm.sh/vue@3.4.21",
    "element-plus": "https://esm.sh/element-plus@2.7.0?deps=vue@3.4.21",
    "element-ui": "https://esm.sh/element-ui@2.15.14?deps=vue@2.6.14",
    "element-plus/common": "https://esm.sh/element-plus@2.7.0?exports=ElButton,ElInput,...&deps=vue@3.4.21"
  },
  "scopes": {
    "/widgets/vue2/": { "vue": "https://esm.sh/vue@2.6.14" },
    "/widgets/vue3/": { "vue": "https://esm.sh/vue@3.4.21" }
  }
}
```

- 顶层 `imports.vue` 按基座技术栈决定（vue3 基座 → Vue3，vue2 基座 → Vue2，h5 基座 → 不声明）。
- `scopes['/widgets/vue2/'].vue` 把 `/widgets/vue2/*` 下的物料内部 `import 'vue'` 钉到 Vue2，与 Vue3 物料互不干扰。
- 组 specifier（`element-plus/common` 等）放在顶层 imports，全项目同一 URL → 浏览器模块图自动去重。

### 2.2 与旧 UMD 方案的对比

| 维度 | 旧 UMD 方案 | 纯 ESM 方案 |
|------|------------|------------|
| 依赖隔离 | `window.Vue2` / `window.Vue3` 不同全局变量名 | importmap `scopes` 按 URL 前缀解析 |
| 运行时补齐 | `loader.ensureRuntimes` 按需拉 `/runtime/*.js` | 无需补齐，importmap 直接指向 CDN |
| 物料产物格式 | UMD（`output.globals`） | ESM（`formats: ['es']`） |
| 全局变量 | `window.Vue2/Vue3/ELEMENT/ElementPlus` | 无 |
| 组件库按需 | 全量包懒加载 | 分组 specifier（`element-plus/common` 等） |

---

## 3. 物料加载流程

`wc/loader.js` 提供从模块加载到 DOM 挂载的完整流程。核心是浏览器原生 `dynamic import(url)`。

### 3.1 加载流程图

```text
基座调用 WidgetHost 组件 / 直接调用 mountWidget
    │
    ├─ loadModule(url)         // dynamic import(url)，命中 modCache 直接返回命名空间
    ├─ loadStyle(css)          // <link> 加载 CSS（引用计数，跨物料共享）
    ├─ mod.default.mount(container, props)   // 调用物料导出的 mount 方法
    └─ 失败时 renderError(container, message)  // 渲染错误占位 + 重试按钮
         │
         └─ 返回 { unmount } API，用于卸载时清理 DOM 与 CSS 引用计数
```

### 3.2 关键函数

#### `loadModule(url)`

- 用 `await import(url)` 加载 ESM 模块；
- `modCache` Map 做去重缓存，同一 URL 多次挂载不重复求值；
- 加载失败（404 / 语法错 / 依赖缺失）抛错被 `mountWidget` 捕获降级。

#### `loadStyle(url)`

- `<link>` 标签动态加载 CSS；
- `cssRefs` Map 引用计数，同一 CSS 跨物料共享一个 `<link>`，全部卸载后才移除。

#### `mountWidget(container, widget)`

对外的挂载入口，签名：

```js
mountWidget(container, {
  name,          // 物料名（用于 WidgetHost class 与日志）
  url,           // ESM 模块 URL（必填）
  css,           // CSS URL（可选）
  props,         // 传给物料 mount 的 props（含 emit/on 注入）
  context,       // 上下文对象
  cssIntegrity   // SRI（可选）
})
```

流程：`Promise.all([loadModule(url), loadStyle(css)])` → 取 `mod.default` → 校验有 `mount` 方法 → 调用 `mod.default.mount(container, props)` → 返回 `{ unmount }`。任一步失败渲染错误占位。

#### `unmountWidget(api)`

调用物料返回的 `unmount()`，清理 DOM 与 CSS 引用计数；对 `null` / 非法输入安全空操作。

#### `preloadWidgets(urls)`

用 `requestIdleCallback`（降级 `setTimeout`）预热模块图，不挂载、不渲染，仅填充 `modCache`。

---

## 4. 分包构建

### 4.1 构建流程

每个技术栈的物料通过 `build.mjs` 自动分包构建为 ESM：

```text
src/widgets/
├── finance-panel/
│   ├── index.js           // 物料入口
│   └── FinancePanel.vue   // Vue 组件
└── ...

构建脚本扫描 src/widgets/ 目录
    │
    ├─ finance-panel → finance-panel.js + finance-panel.css（formats: ['es']）
    └─ ...
```

### 4.2 external 约定

物料构建时把 `vue` / `element-ui` / `element-plus` 及其组 specifier 全部 external，交给基座 importmap 解析：

```js
// vue3-widgets/build.mjs
const EXTERNAL_PATTERNS = ['vue', 'element-plus', /^element-plus\//];
rollupOptions: { external: isExternal }
```

产物中保留 `import { ElButton } from 'element-plus/common'` 这样的 bare import，运行时由 importmap 顶层 imports 解析到 esm.sh CDN（或自托管 ESM）。

### 4.3 manifest.json

构建完成后在 `dist/` 生成 `manifest.json`，声明 `format: 'esm'` 与各物料的 `js` / `css` 文件名：

```json
{
  "stack": "vue3",
  "format": "esm",
  "widgets": [
    { "name": "finance-panel", "js": "finance-panel.js", "css": "finance-panel.css" }
  ]
}
```

### 4.4 产物结构

```
demo/vue3-widgets/dist/
├── finance-panel.js    # ~5.6 KB
├── finance-panel.css   # ~0.5 KB
├── user-panel.js       # ~5.0 KB
├── user-panel.css      # ~0.4 KB
└── manifest.json
```

---

## 5. UI 组件库分组按需加载

组件库（element-plus / element-ui）按使用频次分组，每组一个 canonical URL 放进 importmap 顶层 imports，物料只 import 用到的组，用到才加载。

### 5.1 分组策略

分组配置在 `wc/ui-groups.json`，是唯一配置源：

```json
{
  "element-plus": {
    "version": "2.7.0",
    "vueDep": "vue@3.4.21",
    "groups": {
      "common": ["ElButton", "ElInput", "ElTag", "ElIcon", "ElForm", "ElFormItem", "ElMessage", "ElMessageBox"],
      "table":  ["ElTable", "ElTableColumn", "ElPagination"],
      "form":   ["ElSelect", "ElOption", "ElCascader", "ElSwitch", "ElRadio", "ElRadioGroup", "ElCheckbox", "ElCheckboxGroup"],
      "heavy":  ["ElDatePicker", "ElColorPicker", "ElUpload", "ElTree", "ElTreeSelect"]
    }
  }
}
```

### 5.2 两种物料接入模式

| 模式 | 适用 | 物料写法 | 构建期处理 |
|------|------|---------|-----------|
| auto | Vue3 物料 | SFC 不写 import，直接用 `<el-table>` | `unplugin-vue-components` + `createGroupResolver` 自动注入 `import { ElTable } from 'element-plus/table'` |
| manual | Vue2 物料 | SFC 手动 `import { Tag as ElTag } from 'element-ui/common'` + `components` 注册 | `createManualCheckPlugin` 只校验组 specifier 合法 |

> Vue2 物料走 manual 模式的原因：`unplugin-vue-components` v32 不兼容 `@vitejs/plugin-vue2`，auto 模式对 Vue2 SFC 不生效。

### 5.3 跨物料去重

同一组 specifier 全项目同一 URL（如 `element-plus/common` 永远是 `https://esm.sh/element-plus@2.7.0?exports=ElButton,ElInput,...`），浏览器模块图天然去重——多个物料 import 同一组只加载一次，跨物料跨基座共享。

---

## 6. 错误边界

### 6.1 设计目标

- 单个物料崩溃不拖垮整个看板；
- 自动捕获加载失败并渲染降级占位；
- 提供可点击重试。

### 6.2 错误降级

`mountWidget` 失败时，`renderError` 会：

1. 渲染错误占位节点，显示错误信息（模块加载失败 / 未导出 mount / mount 抛异常 / CSS 加载失败）；
2. 提供「重试」按钮；
3. 重试时重新调用 `mountWidget`，不影响其他物料。

---

## 7. 多基座形态

实际业务里基座本身往往也是某种技术栈：Vue2 老页面、H5 营销页等。本项目提供三种基座形态，分别对应「同栈直引」与「跨栈 loader」两种加载路径的组合。

| 基座 | 端口 | 同栈物料 | 跨栈物料 |
|------|------|----------|----------|
| `demo/host` | 5000 | 无 | Vue2 / Vue3 / H5 全部走 `loader` 动态 `import()` |
| `demo/vue2-host` | 5001 | Vue2 物料 ESM 直引（Vite 编译 SFC） | Vue3 / H5 走 `loader` |
| `demo/h5-host` | 5002 | H5 物料 ESM 直引（直接调用 render 函数） | Vue2 / Vue3 走 `loader` |

### 7.1 同栈 ESM 直引

当物料与基座同栈时，直接 `import` SFC（Vue2/Vue3）或 render 函数（H5），由 Vite 编译挂载，不走 loader 协议。

### 7.2 基座自身依赖解析（resolve.alias）

基座自身的 `import 'vue'` / `import 'element-plus'` 在 Vite dev 下会被 Vite 拦截并从 node_modules 解析，绕过浏览器原生 importmap。`wc/host-plugin.js` 的 `hostResolveAlias({ hostStack, cdnBase })` 生成与 importmap 顶层 imports 一致的 `resolve.alias` 映射，把基座 bare import 直接重定向到 CDN URL，与物料共享同一份 ESM 实例。生产构建下 `rollupOptions.external` 已标记外部，alias 不影响产物。

### 7.3 hostStack 选项

`importmapInjectPlugin` 与 `hostResolveAlias` 都接受 `hostStack` 参数，决定顶层 `vue` 解析：

| hostStack | 顶层 vue | 适用基座 |
|-----------|---------|---------|
| `'vue3'` | Vue3 | `demo/host` |
| `'vue2'` | Vue2 | `demo/vue2-host` |
| `'none'` | 不声明 | `demo/h5-host`（基座无框架） |

---

## 8. 浏览器兼容（可选）

原生 importmap 在 Chrome 89+ / Edge 89+ / Firefox 108+ / Safari 16.4+ 支持。对不支持 importmap 的旧浏览器，提供可选的 `es-module-shims` polyfill。

### 8.1 启用方式

基座启动时设 `WIDGET_COMPAT=1` 环境变量，`importmapInjectPlugin({ compat: true })` 会在 importmap 之前注入嗅探脚本：

```js
// 现代浏览器：HTMLScriptElement.supports('importmap') 为 true → 不加载 shim，零成本
// 旧浏览器：不支持 → 动态加载 es-module-shims polyfill
if (!(HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'))) {
  var s = document.createElement('script');
  s.src = 'https://esm.sh/es-module-shims@1.10.0';  // DEFAULT_SHIM_URL
  s.async = true;
  document.head.appendChild(s);
}
```

### 8.2 自定义 shim URL

- 构建期：`importmapInjectPlugin({ compat: true, shimUrl: 'https://内网/es-module-shims.js' })`
- 运行期：`window.__WIDGET_SHIM_URL__ = 'https://内网/es-module-shims.js'`（在 importmap 注入前设置）

### 8.3 兼容 API

`wc/compat.js` 导出：

- `supportsImportmap()`：检测当前浏览器是否原生支持 importmap。
- `injectImportmapShim(url)`：手动注入 es-module-shims 脚本。
- `DEFAULT_SHIM_URL`：默认 shim URL（esm.sh 上的 es-module-shims）。

---

## 关键文件索引

| 文件 | 用途 |
|------|------|
| `wc/loader.js` | ESM 动态 import + modCache + CSS 引用计数 + 错误降级 + preloadWidgets |
| `wc/WidgetHost.vue` | Vue3 基座组件（url/css props） |
| `wc/host-plugin.js` | `localServeWidgetsPlugin`（dev 托管物料产物）+ `importmapInjectPlugin`（注入 importmap）+ `hostResolveAlias`（基座 dev alias） |
| `wc/importmap-gen.js` | `generateImportmap`（生成 importmap）+ `createGroupResolver`（auto resolver）+ `createManualCheckPlugin`（manual 校验） |
| `wc/compat.js` | importmap 兼容检测与 es-module-shims 注入 |
| `wc/ui-groups.json` | UI 组件库分组策略（唯一配置源） |
| `wc/templates/vue3.js` | Vue3 物料入口模板 |
| `wc/templates/vue2.js` | Vue2 物料入口模板 |
| `wc/templates/h5.js` | H5 物料入口模板 |
| `demo/host/vite.config.js` | 统一基座 Vite 配置（hostStack='vue3'） |
| `demo/vue2-host/vite.config.js` | Vue2 单栈基座（hostStack='vue2'） |
| `demo/h5-host/vite.config.js` | H5 单栈基座（hostStack='none'） |
| `demo/*/build.mjs` | 各技术栈物料 ESM 分包构建脚本 |
