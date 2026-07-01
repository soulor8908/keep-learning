# 跨技术栈 BI 看板物料集成

面向 2C 页面的轻量物料集成方案：通过 **纯 ESM + 浏览器原生 importmap** 把 Vue2 / Vue3 / H5 物料以统一方式接入同一看板。Vue2 与 Vue3 的依赖隔离由 importmap `scopes` 完成，无需任何运行时全局变量。

## 核心思路

- **物料构建为 ESM**：每个物料一个独立 `.js`（`formats: ['es']`），`vue` / `element-ui` / `element-plus` 全部 external，产物里保留 `import { ElButton } from 'element-plus/common'` 这样的 bare import。
- **importmap 解析依赖**：基座 `index.html` 注入 importmap，顶层 `imports` 声明 `vue` / `element-plus` / `element-ui` 及其组 specifier 的 CDN URL；`scopes` 按 URL 前缀把 `/widgets/vue2/*` 钉到 Vue2、`/widgets/vue3/*` 钉到 Vue3。
- **动态 import() 加载物料**：基座用 `loader.mountWidget(container, { url, css, props })` 调用浏览器原生 `import(url)` 拉取物料模块图并挂载，`modCache` 去重、CSS 引用计数共享。
- **不再有 UMD / 不再有 window 全局**：无 `window.Vue2` / `window.Vue3` / `window.ElementPlus`，无 `loader.ensureRuntimes` 运行时补齐。

```text
基座 index.html 注入 importmap：
  {
    "imports": {
      "vue": "https://esm.sh/vue@3.4.21",
      "element-plus": "https://esm.sh/element-plus@2.7.0?deps=vue@3.4.21",
      "element-plus/common": "https://esm.sh/element-plus@2.7.0?exports=ElButton,ElInput,...&deps=vue@3.4.21",
      "element-ui/common": "https://esm.sh/element-ui@2.15.14?exports=Button,Input,...&deps=vue@2.6.14"
    },
    "scopes": {
      "/widgets/vue2/": { "vue": "https://esm.sh/vue@2.6.14" },
      "/widgets/vue3/": { "vue": "https://esm.sh/vue@3.4.21" }
    }
  }

物料 ESM 构建（每个物料独立一个 .js）：
  external: ['vue', 'element-plus', /^element-plus\//]
  产物中保留 import { ElButton } from 'element-plus/common'

基座加载：
  mountWidget(container, { name, url, css, props })
  // → dynamic import(url) → mod.default.mount(container, props)
```

## 目录

```
wc/
├── loader.js              # ESM 动态 import + modCache + CSS 引用计数 + 错误降级 + preloadWidgets
├── WidgetHost.vue         # Vue3 基座组件（url/css props）
├── host-plugin.js         # localServeWidgetsPlugin + importmapInjectPlugin + hostResolveAlias
├── importmap-gen.js       # generateImportmap + createGroupResolver + createManualCheckPlugin
├── compat.js              # importmap 兼容检测 + es-module-shims 注入（可选）
├── ui-groups.json         # UI 组件库分组策略（唯一配置源）
├── templates/             # Vue2 / Vue3 / H5 物料入口模板
└── README.md

demo/
├── host/                  # 统一基座（Vue2 + Vue3 + H5 共存，端口 5000）
├── vue2-host/             # Vue2 单栈基座（同栈 ESM，跨栈 loader，端口 5001）
├── h5-host/               # H5 单栈基座（同栈 ESM，跨栈 loader，端口 5002）
├── vue2-widgets/          # Vue2 物料（每个物料独立 ESM，manual 模式）
│   ├── build.mjs          # 分包构建脚本
│   └── src/widgets/       # 各物料独立目录
├── vue3-widgets/          # Vue3 物料（每个物料独立 ESM，auto 模式）
│   ├── build.mjs
│   └── src/widgets/
└── h5-widgets/            # H5 物料（每个物料独立 ESM）
    ├── build.mjs
    └── src/widgets/
```

## 快速开始（本地开发）

```bash
# 安装根依赖（测试工具）
pnpm install

# 各物料仓库独立构建
cd demo/vue2-widgets && pnpm install --ignore-workspace && pnpm run build
cd demo/vue3-widgets && pnpm install --ignore-workspace && pnpm run build
cd demo/h5-widgets && pnpm install --ignore-workspace && pnpm run build

# 启动基座（指定物料产物目录）
cd demo/host
VITE_WIDGETS_DIRS="../vue2-widgets/dist,../vue3-widgets/dist,../h5-widgets/dist" pnpm run serve

# 启动 Vue2 单栈基座（端口 5001）
cd demo/vue2-host && pnpm install --ignore-workspace && pnpm serve

# 启动 H5 单栈基座（端口 5002）
cd demo/h5-host && pnpm install --ignore-workspace && pnpm serve
```

访问 http://localhost:5000，页面会同时展示 Vue2 / Vue3 / H5 六个物料。

> 说明：`demo/*` 目录不在根 pnpm workspace 内（多仓模拟），需用 `--ignore-workspace` 让 pnpm 在各自目录独立安装依赖。

## 开发

```bash
# 单元测试（根目录，Vitest + happy-dom）
pnpm test:run

# 端到端测试（根目录，Playwright + Chromium）
pnpm e2e

# 单独预览物料（进入物料仓库）
cd demo/vue2-widgets && pnpm run serve
cd demo/vue3-widgets && pnpm run serve
cd demo/h5-widgets && pnpm run serve
```

## 多基座形态

| 基座 | 端口 | 同栈物料 | 跨栈物料 |
|------|------|----------|----------|
| `demo/host` | 5000 | 无 | Vue2 / Vue3 / H5 全部走 `loader` 动态 `import()` |
| `demo/vue2-host` | 5001 | Vue2 物料 ESM 直引（Vite 编译 SFC） | Vue3 / H5 走 `loader` |
| `demo/h5-host` | 5002 | H5 物料 ESM 直引（直接调用 render 函数） | Vue2 / Vue3 走 `loader` |

**为什么要多种基座**：实际业务里基座本身就是某种技术栈——Vue2 老页面、H5 营销页等。同栈物料没必要走 importmap 中转，ESM 直引更轻量；跨栈物料仍由 `loader` 统一加载，依赖由 importmap 解析。

### hostStack 选项

`importmapInjectPlugin` 与 `hostResolveAlias` 都接受 `hostStack` 参数，决定 importmap 顶层 `vue` 解析与基座 dev alias：

| hostStack | 顶层 vue | 适用基座 |
|-----------|---------|---------|
| `'vue3'` | Vue3 | `demo/host` |
| `'vue2'` | Vue2 | `demo/vue2-host` |
| `'none'` | 不声明 | `demo/h5-host`（基座无框架） |

## 写一个物料

### 1. 创建物料目录（在物料仓库中）

```
src/widgets/my-widget/
├── index.js           # 物料入口
└── MyWidget.vue       # Vue 组件
```

### 2. 编写物料入口

```js
// src/widgets/my-widget/index.js
import MyWidget from './MyWidget.vue';
import { createVue3Widget } from '@wc/core/templates/vue3';

export default createVue3Widget(MyWidget, {
  // Vue3 物料走 auto 模式：SFC 直接用 <el-table>，build.mjs 自动注入组 import
});
```

> Vue2 物料需走 **manual 模式**（`unplugin-vue-components` v32 不兼容 `@vitejs/plugin-vue2`）：在 SFC 中显式 `import { Tag as ElTag } from 'element-ui/common'` 并注册 `components`，`build.mjs` 用 `createManualCheckPlugin` 校验组 specifier。

### 3. 自动构建

在物料仓库中运行：

```bash
pnpm run build
```

`build.mjs` 会自动扫描 `src/widgets/` 下所有目录，无需额外配置。产物输出到 `dist/` 目录，每个物料独立一个 `.js` + `.css` + 一个总 `manifest.json`。

### 4. 在基座中加载

```vue
<WidgetHost
  name="my-widget"
  url="/widgets/vue3/my-widget.js"
  css="/widgets/vue3/my-widget.css"
  :widget-props="{ title: '示例' }"
  @widget-event="onWidgetEvent"
/>
```

### 命名规范

- 目录名：`my-widget`（kebab-case）
- 物料 URL：`/widgets/{stack}/{name}.js`（按 importmap scope 前缀归类）
- 文件名：`my-widget.js` + `my-widget.css`

## 浏览器兼容（可选）

原生 importmap 在 Chrome 89+ / Edge 89+ / Firefox 108+ / Safari 16.4+ 支持。对不支持 importmap 的旧浏览器，启动基座时设 `WIDGET_COMPAT=1`，`importmapInjectPlugin` 会在 importmap 之前注入嗅探脚本，按需加载 `es-module-shims` polyfill：

```bash
WIDGET_COMPAT=1 cd demo/host && pnpm serve
```

- 现代浏览器：`HTMLScriptElement.supports('importmap')` 为 true，不加载 shim，零成本。
- 旧浏览器：不支持 → 动态加载 es-module-shims。
- 自托管 shim：`importmapInjectPlugin({ compat: true, shimUrl: 'https://内网/es-module-shims.js' })` 或运行期设 `window.__WIDGET_SHIM_URL__`。

详见 `wc/compat.js` 与 `docs/architecture.md` §8。

## 离线 / 内网部署

importmap 中所有依赖 URL 默认指向 `esm.sh`，离线/内网环境可通过以下方式改指向自托管 ESM：

- `UI_CDN_BASE` 环境变量：`importmapInjectPlugin` 与 `hostResolveAlias` 接受 `cdnBase`，覆盖默认 esm.sh 前缀。
- 物料产物部署到 CDN 或静态服务器，基座 `WIDGETS_DIRS` 指定产物目录。
