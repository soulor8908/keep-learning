## 项目概述

跨技术栈看板物料集成方案（BI 看板基座 + Vue2/Vue3/H5 物料），通过 **纯 ESM + 浏览器原生 importmap** 把不同技术栈的物料以统一方式接入到同一个看板中。面向 2C 页面，对首屏性能、运行时性能和体积敏感。

依赖隔离的解决方案是 `external` + importmap `scopes`（按物料 URL 前缀解析到不同 Vue 版本），不是 Custom Elements，也不是 UMD 全局变量。**不再有 `window.Vue2` / `window.Vue3` / `window.ElementPlus` 全局变量，不再有 `loader.ensureRuntimes` 运行时补齐。**

## 多仓基本条件

**基座（Host）和各物料项目（Widgets）分属不同代码仓**，这是架构的基本约束。运行时基座通过 HTTP 加载物料 ESM 产物，不依赖文件系统路径或同仓源码引用。

本仓库（`wc/` + `demo/`）是本地开发参考实现，用 monorepo 模拟多仓场景。以下设计都按多仓约束执行：

- 每个仓库独立构建、独立部署、独立版本管理
- `@wc/core` 作为 npm 包分发，物料仓库通过 `npm install @wc/core` 引入
- 基座通过 HTTP URL 加载物料 ESM 产物，不直接引用物料源码
- 物料产物通过 `manifest.json` 自描述（`format: 'esm'`），基座注册表只记录 URL 和元数据
- 本地开发用 `file:../wc` 模拟跨仓依赖

## 技术栈

- **框架**：Vue 2/3、原生 H5
- **构建工具**：Vite（每个物料独立构建为 ESM，`formats: ['es']`）
- **UI 库**：ElementUI (Vue2)、ElementPlus (Vue3) —— 按组 specifier 按需加载（`element-plus/common`、`element-ui/table` 等）
- **包管理器**：pnpm
- **测试**：Vitest（happy-dom）+ Playwright（Chromium）

## 仓库结构（多仓视角）

每个仓库独立，通过 `@wc/core` npm 包和 HTTP 产物交互：

```
# 仓库 A：运行时核心（本仓库 wc/）
wc/
├── package.json            # 包名 @wc/core，发布到 npm
├── loader.js               # ESM 动态 import + modCache + CSS 引用计数 + 错误降级 + preloadWidgets
├── WidgetHost.vue          # Vue3 基座组件（url/css props）
├── host-plugin.js          # localServeWidgetsPlugin + importmapInjectPlugin + hostResolveAlias
├── importmap-gen.js        # generateImportmap + createGroupResolver + createManualCheckPlugin
├── compat.js               # importmap 兼容检测 + es-module-shims 注入（可选）
├── ui-groups.json          # UI 组件库分组策略（唯一配置源）
├── templates/              # Vue2 / Vue3 / H5 物料入口模板
└── README.md

# 仓库 B：基座（本仓库 demo/host 模拟）
demo/host/
├── package.json            # 依赖 @wc/core（本地用 file:../wc）
├── src/App.vue             # 物料注册表（只记录 url/css，不引用源码）
├── vite.config.js          # importmapInjectPlugin({ hostStack: 'vue3' }) + hostResolveAlias
└── index.html              # <!--IMPORTMAP_INJECT--> 占位符（plugin 注入 importmap）

# 仓库 B'：单栈基座示例（本仓库 demo/vue2-host / demo/h5-host 模拟）
# 当基座本身是某个技术栈（如 Vue2 老页面、H5 营销页）时，同栈物料走 ESM 直引，
# 跨栈物料仍走 loader（依赖由 importmap 解析，不再有运行时补齐）。
demo/vue2-host/             # Vue2 单栈基座（端口 5001，hostStack='vue2'）
demo/h5-host/               # H5 单栈基座（端口 5002，hostStack='none'）

# 仓库 C：Vue2 物料（本仓库 demo/vue2-widgets 模拟，manual 模式）
demo/vue2-widgets/
├── package.json            # 依赖 @wc/core（本地用 file:../wc）
├── build.mjs               # 分包构建脚本（UI_GROUP_MODE=manual 时只校验组 specifier）
├── src/widgets/            # 各物料独立目录（SFC 手动 import element-ui 组）
└── dist/                   # 产物：每个物料独立 .js + .css + manifest.json（format: 'esm'）

# 仓库 D：Vue3 物料（本仓库 demo/vue3-widgets 模拟，auto 模式）
demo/vue3-widgets/
├── package.json
├── build.mjs               # unplugin-vue-components + createGroupResolver 自动注入组 import
├── src/widgets/
└── dist/

# 仓库 E：H5 物料（本仓库 demo/h5-widgets 模拟）
demo/h5-widgets/
├── package.json
├── build.mjs
├── src/widgets/
└── dist/
```

## 关键入口 / 核心模块

| 仓库 | 端口 | 入口 | 用途 |
|------|------|------|------|
| `@wc/core` | - | `loader.js` / `WidgetHost.vue` / `host-plugin.js` / `importmap-gen.js` / `compat.js` / `templates/` | 运行时核心，npm 包分发 |
| `demo/host` | 5000 | `index.html` + `vite.config.js` | 统一基座预览（Vue2/Vue3/H5 全部走 loader，hostStack='vue3'） |
| `demo/vue2-host` | 5001 | `index.html` + `vite.config.js` | Vue2 单栈基座（同栈 ESM，跨栈 loader，hostStack='vue2'） |
| `demo/h5-host` | 5002 | `index.html` + `vite.config.js` | H5 单栈基座（同栈 ESM，跨栈 loader，hostStack='none'） |
| `demo/vue2-widgets` | - | `build.mjs` | Vue2 物料分包 ESM 构建（manual 模式） |
| `demo/vue3-widgets` | - | `build.mjs` | Vue3 物料分包 ESM 构建（auto 模式） |
| `demo/h5-widgets` | - | `build.mjs` | H5 物料分包 ESM 构建 |

## 核心 API

| 模块 | 导出 | 说明 |
|------|------|------|
| `@wc/core/loader` | `mountWidget(container, widget)`、`unmountWidget(api)`、`preloadWidgets(urls)` | ESM 加载器；`mountWidget` 用 `dynamic import(url)` 拉取物料模块图，`modCache` 去重、CSS 引用计数共享、错误降级。**不再有 `ensureRuntimes`**（依赖隔离交给 importmap） |
| `@wc/core/WidgetHost.vue` | `WidgetHost` | Vue3 基座组件（支持 `url`、`css`、`widgetProps`、`context` 属性，`@widget-event` 事件） |
| `@wc/core/host-plugin` | `localServeWidgetsPlugin(dirs?)`、`importmapInjectPlugin(opts)`、`hostResolveAlias(opts)` | Vite 插件：dev 托管物料产物 / 注入 importmap / 基座 dev alias |
| `@wc/core/importmap-gen` | `generateImportmap(groups, opts)`、`loadUiGroups()`、`createGroupResolver()`、`createManualCheckPlugin()` | importmap 生成与 UI 分组解析 |
| `@wc/core/compat` | `supportsImportmap()`、`injectImportmapShim(url?)`、`DEFAULT_SHIM_URL` | importmap 兼容检测与 es-module-shims 注入（可选） |
| `@wc/core/templates/vue2` | `createVue2Widget(Component, options)` | Vue2 物料入口模板 |
| `@wc/core/templates/vue3` | `createVue3Widget(Component, options)` | Vue3 物料入口模板 |
| `@wc/core/templates/h5` | `createH5Widget(renderFn)` | H5 物料入口模板 |

## 运行与预览（本地开发）

本地开发用 monorepo 模拟多仓。各仓库需独立进入目录执行命令：

```bash
# 1. 进入每个物料仓库，独立构建
# Vue2 物料（manual 模式：SFC 手动 import element-ui 组）
cd demo/vue2-widgets && pnpm install --ignore-workspace && UI_GROUP_MODE=manual pnpm run build
# Vue3 物料（auto 模式：unplugin-vue-components 自动注入）
cd demo/vue3-widgets && pnpm install --ignore-workspace && pnpm run build
# H5 物料
cd demo/h5-widgets && pnpm install --ignore-workspace && pnpm run build

# 2. 进入基座仓库，启动开发服务器
# 多仓开发时，通过 VITE_WIDGETS_DIRS 环境变量指定物料产物目录
cd demo/host
VITE_WIDGETS_DIRS="../vue2-widgets/dist,../vue3-widgets/dist,../h5-widgets/dist" pnpm run serve

# 3. 可选：启用浏览器兼容（注入 es-module-shims 嗅探脚本，兼容不支持 importmap 的旧浏览器）
WIDGET_COMPAT=1 cd demo/host && pnpm run serve

# 4. 部署构建（多仓部署时通过 WIDGETS_DIRS 传入物料产物目录）
cd demo/host && pnpm vite build
WIDGETS_DIRS="/path/to/vue2-widgets/dist,/path/to/vue3-widgets/dist,/path/to/h5-widgets/dist" \
  bash scripts/deploy_build.sh
```

### 本地开发快捷方式（monorepo 内）

```bash
# 安装根依赖（仅测试工具）
pnpm install

# 单元测试（Vitest + happy-dom）
pnpm test
pnpm test:run
pnpm test:ci

# 端到端测试（Playwright + Chromium，自动构建物料 + 启动 host dev server）
pnpm e2e

# 单栈基座预览（多仓视角下需进入各自目录）
cd demo/vue2-host && pnpm install --ignore-workspace && pnpm serve    # 端口 5001
cd demo/h5-host   && pnpm install --ignore-workspace && pnpm serve    # 端口 5002
```

> 说明：`demo/*` 目录不在根 pnpm workspace 内（多仓模拟），需用 `--ignore-workspace` 让 pnpm 在各自目录独立安装依赖。

## 分包构建

每个物料仓库独立构建，不依赖基座或其他物料仓库：

- 扫描 `src/widgets/` 下所有子目录
- 每个目录生成独立的 `{name}.js` + `{name}.css`（`formats: ['es']`）
- `external: ['vue', 'element-plus', 'element-ui', /^element-plus\//, /^element-ui\//]`，产物保留 bare import，运行时由 importmap 解析
- 产物输出到 `dist/` 目录，同时生成 `manifest.json`（含 `format: 'esm'`）

新增物料只需在 `src/widgets/` 下创建目录，无需修改构建配置。

### UI 组件库接入模式

| 模式 | 适用 | 物料写法 | 构建期处理 |
|------|------|---------|-----------|
| auto | Vue3 物料 | SFC 不写 import，直接用 `<el-table>` | `unplugin-vue-components` + `createGroupResolver` 自动注入 `import { ElTable } from 'element-plus/table'` |
| manual | Vue2 物料 | SFC 手动 `import { Tag as ElTag } from 'element-ui/common'` + `components` 注册 | `createManualCheckPlugin` 只校验组 specifier 合法 |

> Vue2 走 manual 的原因：`unplugin-vue-components` v32 不兼容 `@vitejs/plugin-vue2`，auto 模式对 Vue2 SFC 不生效。Vue2 物料构建需设 `UI_GROUP_MODE=manual`。

## 跨仓依赖

### `@wc/core` 引入方式

```json
// 多仓部署（正式发布）
{
  "devDependencies": {
    "@wc/core": "^1.0.0"
  }
}

// 本地开发（同级目录模拟）
{
  "devDependencies": {
    "@wc/core": "file:../wc"
  }
}
```

### 物料加载方式

基座不引用物料源码，只通过 HTTP URL 加载 ESM 产物：

```js
// 基座注册表（WIDGET_REGISTRY）
const WIDGET_REGISTRY = {
  salesPanel: {
    name: 'sales-panel',                // 物料名（WidgetHost class）
    url: '/widgets/vue2/sales-panel.js', // ESM 模块 URL（前缀决定 importmap scope）
    css: '/widgets/vue2/sales-panel.css' // CSS URL（可选）
  }
};
```

## 部署构建（多仓）

```bash
# 1. 各物料仓库独立构建（各自 CI/CD 执行）
cd /repo/vue2-widgets && UI_GROUP_MODE=manual pnpm run build   # 产物 → dist/
cd /repo/vue3-widgets && pnpm run build                         # 产物 → dist/
cd /repo/h5-widgets && pnpm run build                           # 产物 → dist/

# 2. 基座仓库独立构建
cd /repo/host && pnpm vite build          # 产物 → dist/

# 3. 物料产物部署到 CDN 或静态服务器
# 基座构建时通过 WIDGETS_DIRS 环境变量集成物料产物
WIDGETS_DIRS="/repo/vue2-widgets/dist,/repo/vue3-widgets/dist,/repo/h5-widgets/dist" \
  bash scripts/deploy_build.sh
```

## 用户偏好与长期约束

- Node.js 项目统一使用 pnpm 管理依赖
- 预览端口固定为 5000
- 部署入口为 demo/host（本地模拟），多仓中每个仓库独立部署
- 物料需支持离线/内网环境（`UI_CDN_BASE` 覆盖 importmap 默认 esm.sh 前缀）
- 只适配原生 H5、Vue2、Vue3，不做过度设计
- 2C 页面：首屏性能、体积、鲁棒性优先
- 不兼容历史版本，API 可自由迭代
- **多仓约束**：基座和物料分属不同仓库，运行时只通过 HTTP URL 和 `@wc/core` npm 包交互

## 关键运行时全局变量

纯 ESM 方案下，依赖隔离不再依赖 window 全局变量。仅保留少量可选全局：

| 全局变量 | 提供者 | 用途 |
|---------|--------|------|
| `window._` | 各 host index.html 按需引入 | lodash（可选） |
| `window.axios` | 各 host index.html 按需引入 | axios（可选） |
| `window.__WIDGET_SHIM_URL__` | 业务侧设置（在 importmap 注入前） | 覆盖默认 es-module-shims URL（离线/内网自托管） |
| `window.__loader` | `demo/host/src/main.js` dev 期注入（生产构建 tree-shake） | e2e 测试直接调用 `mountWidget` / `unmountWidget` |

> **不再有** `window.Vue2` / `window.Vue3` / `window.ELEMENT` / `window.ElementPlus` / `window.__WIDGET_RUNTIME_URLS__`。Vue 与组件库依赖全部由 importmap 顶层 imports + scopes 解析到 CDN（或 `UI_CDN_BASE` 指向的自托管 ESM）。

## 代码习惯约定

### 通用规则

1. **语言**：注释与文档用中文，技术术语保留英文。代码标识符用英文。
2. **不使用 emoji**：代码、注释、文档中均不使用 emoji。
3. **注释风格**：解释"为什么"而非"是什么"。用 `// ─── 标题 ───` 分隔符划分区块。函数用 JSDoc。
4. **防御性编码**：系统边界做校验与 try/catch；内部代码信任框架保证；失败不阻断主流程时用 try/catch + console.warn 降级。
5. **不过度工程化**：只做被要求的事；一次性操作不抽 helper；不为假想的未来需求设计。

### 模块实现

1. **ESM 优先**：`wc/` 下用 ESM。需引用 CJS 时用 `createRequire`。
2. **轻量运行时**：`wc/loader.js` 只负责 ESM 动态 import、modCache 去重、CSS 引用计数、错误降级，不做 semver、CE 注册、生命周期管理、运行时依赖补齐。
3. **依赖隔离**：Vue2/Vue3 物料内部 `import 'vue'` 由 importmap `scopes`（`/widgets/vue2/` → Vue2，`/widgets/vue3/` → Vue3）解析，天然隔离，无需全局变量。
4. **基座 dev alias**：`hostResolveAlias({ hostStack, cdnBase })` 把基座自身的 bare import 重定向到与 importmap 顶层 imports 一致的 CDN URL，避免 Vite dev 从 node_modules 解析绕过 importmap。

### 测试习惯

1. 改完 `.js` 用 `node --check` 验证语法。
2. 测试框架：Vitest（happy-dom 环境，单元测试）；Playwright（Chromium，e2e 测试）。
3. 临时文件用完即删。

### Git 提交

1. 提交信息：中文，`type(scope): 概述` 格式。
2. 不主动提交，只在用户明确要求时 commit。
