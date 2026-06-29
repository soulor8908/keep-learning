## 项目概述

跨技术栈看板物料集成方案（BI 看板基座 + Vue2/Vue3/H5 物料），通过 UMD + `mount()` 把不同技术栈的物料以统一方式接入到同一个看板中。面向 2C 页面，对首屏性能、运行时性能和体积敏感。

依赖冲突的解决方案是 `external` + `globals` + 不同全局变量名（`Vue2` / `Vue3`），不是 Custom Elements。新架构已删除 CE 包装层。

## 多仓基本条件

**基座（Host）和各物料项目（Widgets）分属不同代码仓**，这是架构的基本约束。运行时基座通过 HTTP 加载 UMD 产物，不依赖文件系统路径或同仓源码引用。

本仓库（`wc/` + `demo/`）是本地开发参考实现，用 monorepo 模拟多仓场景。以下设计都按多仓约束执行：

- 每个仓库独立构建、独立部署、独立版本管理
- `@wc/core` 作为 npm 包分发，物料仓库通过 `npm install @wc/core` 引入
- 基座通过 HTTP URL 加载物料 UMD 产物，不直接引用物料源码
- 物料产物通过 `manifest.json` 自描述，基座注册表只记录 URL 和元数据
- 本地开发用 `file:../wc` 模拟跨仓依赖

## 技术栈

- **框架**：Vue 2/3、原生 H5
- **构建工具**：Vite（每个物料独立构建为 UMD）
- **UI 库**：ElementUI (Vue2)、ElementPlus (Vue3) —— 可选，按需加载
- **包管理器**：pnpm
- **测试**：Vitest + Playwright

## 仓库结构（多仓视角）

每个仓库独立，通过 `@wc/core` npm 包和 HTTP 产物交互：

```
# 仓库 A：运行时核心（本仓库 wc/）
wc/
├── package.json            # 包名 @wc/core，发布到 npm
├── loader.js               # UMD 加载 + URL 缓存 + 依赖检查 + 错误降级 + 运行时按需加载
├── WidgetHost.vue          # Vue3 基座组件
├── templates/              # Vue2 / Vue3 / H5 物料入口模板
└── README.md

# 仓库 B：基座（本仓库 demo/host 模拟）
demo/host/
├── package.json            # 依赖 @wc/core（本地用 file:../wc）
├── src/App.vue             # 物料注册表（只记录 URL，不引用源码）
├── vite.config.js          # 开发服务器配置
└── index.html              # 注入运行时全局变量

# 仓库 B'：单栈基座示例（本仓库 demo/vue2-host / demo/h5-host 模拟）
# 当基座本身是某个技术栈（如 Vue2 老页面、H5 营销页）时，同栈物料走 ESM 直引，
# 跨栈物料仍走 loader（loader 内部按需补齐运行时）。
demo/vue2-host/            # Vue2 单栈基座（端口 5001）
demo/h5-host/               # H5 单栈基座（端口 5002）

# 仓库 C：Vue2 物料（本仓库 demo/vue2-widgets 模拟）
demo/vue2-widgets/
├── package.json            # 依赖 @wc/core（本地用 file:../wc）
├── build.mjs               # 分包构建脚本
├── src/widgets/            # 各物料独立目录
└── dist/                   # 产物：每个物料独立 .js + .css + manifest.json

# 仓库 D：Vue3 物料（本仓库 demo/vue3-widgets 模拟）
demo/vue3-widgets/
├── package.json
├── build.mjs
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
| `@wc/core` | - | `loader.js` / `WidgetHost.vue` / `templates/` | 运行时核心，npm 包分发 |
| `demo/host` | 5000 | `index.html` + `vite.config.js` | 统一基座预览（Vue2/Vue3/H5 全部走 loader） |
| `demo/vue2-host` | 5001 | `index.html` + `vite.config.js` | Vue2 单栈基座（同栈 ESM，跨栈 loader） |
| `demo/h5-host` | 5002 | `index.html` + `vite.config.js` | H5 单栈基座（同栈 ESM，跨栈 loader） |
| `demo/vue2-widgets` | - | `build.mjs` | Vue2 物料分包 UMD 构建 |
| `demo/vue3-widgets` | - | `build.mjs` | Vue3 物料分包 UMD 构建 |
| `demo/h5-widgets` | - | `build.mjs` | H5 物料分包 UMD 构建 |

## 核心 API

| 模块 | 导出 | 说明 |
|------|------|------|
| `@wc/core/loader` | `mountWidget(container, widget)`、`unmountWidget(api)`、`preloadWidgets(urls)`、`ensureRuntimes(needs)` | 轻量加载器；`mountWidget` 内部已调用 `ensureRuntimes`，按物料声明的 `vueVersion` + `runtimeDeps` 按需补齐 `window.Vue2/Vue3/ELEMENT/ElementPlus` |
| `@wc/core/WidgetHost.vue` | `WidgetHost` | Vue3 基座组件（支持 `css`、`runtimeDeps` 属性） |
| `@wc/core/templates/vue2` | `createVue2Widget(Component, options)` | Vue2 物料入口模板 |
| `@wc/core/templates/vue3` | `createVue3Widget(Component, options)` | Vue3 物料入口模板 |
| `@wc/core/templates/h5` | `createH5Widget(renderFn)` | H5 物料入口模板 |

## 运行与预览（本地开发）

本地开发用 monorepo 模拟多仓。各仓库需独立进入目录执行命令：

```bash
# 1. 进入每个物料仓库，独立构建
# Vue2 物料
cd demo/vue2-widgets && pnpm install && pnpm run build
# Vue3 物料
cd demo/vue3-widgets && pnpm install && pnpm run build
# H5 物料
cd demo/h5-widgets && pnpm install && pnpm run build

# 2. 进入基座仓库，启动开发服务器
# 多仓开发时，通过 VITE_WIDGETS_DIRS 环境变量指定物料产物目录
cd demo/host
VITE_WIDGETS_DIRS="../vue2-widgets/dist,../vue3-widgets/dist,../h5-widgets/dist" pnpm run serve

# 3. 部署构建（多仓部署时通过 WIDGETS_DIRS 传入物料产物目录）
# 基座仓库
cd demo/host && pnpm vite build
# 物料产物复制到基座 dist（多仓场景通过 WIDGETS_DIRS 指定）
WIDGETS_DIRS="/path/to/vue2-widgets/dist,/path/to/vue3-widgets/dist,/path/to/h5-widgets/dist" \
  bash scripts/deploy_build.sh
```

### 本地开发快捷方式（monorepo 内）

```bash
# 安装根依赖（仅测试工具）
pnpm install

# 测试
pnpm test
pnpm test:run
pnpm test:ci
pnpm e2e

# 单栈基座预览（多仓视角下需进入各自目录）
cd demo/vue2-host && pnpm install && pnpm serve    # 端口 5001
cd demo/h5-host   && pnpm install && pnpm serve    # 端口 5002
```

## 分包构建

每个物料仓库独立构建，不依赖基座或其他物料仓库：

- 扫描 `src/widgets/` 下所有子目录
- 每个目录生成独立的 `{name}.js` + `{name}.css`
- UMD 全局名 = 目录名（如 `my-widget`），不再做转换
- 产物输出到 `dist/` 目录，同时生成 `manifest.json`

新增物料只需在 `src/widgets/` 下创建目录，无需修改构建配置。

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

基座不引用物料源码，只通过 HTTP URL 加载 UMD 产物：

```js
// 基座注册表（WIDGET_REGISTRY）
const WIDGET_REGISTRY = {
  salesPanel: {
    name: 'sales-panel',        // UMD 全局变量名
    js: '/widgets/sales-panel.js',   // HTTP URL
    css: '/widgets/sales-panel.css', // HTTP URL
    vueVersion: '2'
  }
};
```

## 部署构建（多仓）

```bash
# 1. 各物料仓库独立构建（各自 CI/CD 执行）
cd /repo/vue2-widgets && pnpm run build   # 产物 → dist/
cd /repo/vue3-widgets && pnpm run build   # 产物 → dist/
cd /repo/h5-widgets && pnpm run build     # 产物 → dist/

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
- 物料需支持离线/内网环境
- 只适配原生 H5、Vue2、Vue3，不做过度设计
- 2C 页面：首屏性能、体积、鲁棒性优先
- 不兼容历史版本，API 可自由迭代
- **多仓约束**：基座和物料分属不同仓库，运行时只通过 HTTP URL 和 `@wc/core` npm 包交互

## 关键运行时全局变量

| 全局变量 | 提供者 | 用途 |
|---------|--------|------|
| `window.Vue2` | `loader.ensureRuntimes`（缺失时拉 `/runtime/vue2.js`），或 vue2-host `main.js` 直接注入 | Vue2 物料运行时 |
| `window.Vue3` | `loader.ensureRuntimes`（缺失时拉 `/runtime/vue3.js`） | Vue3 物料运行时 |
| `window.ELEMENT` | `loader.ensureRuntimes`（物料声明 `runtimeDeps: ['element-ui']` 时按需加载，自动先加载 vue2） | element-ui 组件库（可选） |
| `window.ElementPlus` | `loader.ensureRuntimes`（物料声明 `runtimeDeps: ['element-plus']` 时按需加载，自动先加载 vue3） | ElementPlus 组件库（可选） |
| `window._` | 各 host index.html 按需引入 | lodash（可选） |
| `window.axios` | 各 host index.html 按需引入 | axios（可选） |
| `window.__WIDGET_RUNTIME_URLS__` | 业务侧设置（在 mountWidget 之前） | 覆盖默认运行时 URL，把 vue2/vue3/element-ui/element-plus 打到自有 CDN |

## 代码习惯约定

### 通用规则

1. **语言**：注释与文档用中文，技术术语保留英文。代码标识符用英文。
2. **不使用 emoji**：代码、注释、文档中均不使用 emoji。
3. **注释风格**：解释"为什么"而非"是什么"。用 `// ─── 标题 ───` 分隔符划分区块。函数用 JSDoc。
4. **防御性编码**：系统边界做校验与 try/catch；内部代码信任框架保证；失败不阻断主流程时用 try/catch + console.warn 降级。
5. **不过度工程化**：只做被要求的事；一次性操作不抽 helper；不为假想的未来需求设计。

### 模块实现

1. **ESM 优先**：`wc/` 下用 ESM。需引用 CJS 时用 `createRequire`。
2. **轻量运行时**：`wc/loader.js` 只负责 UMD 加载、依赖检查、错误降级，不做 semver、CE 注册、生命周期管理。
3. **依赖隔离**：Vue2/Vue3 物料读取不同的 `window` 全局名，天然隔离。

### 测试习惯

1. 改完 `.js` 用 `node --check` 验证语法。
2. 测试框架：Vitest（happy-dom 环境）。
3. 临时文件用完即删。

### Git 提交

1. 提交信息：中文，`type(scope): 概述` 格式。
2. 不主动提交，只在用户明确要求时 commit。
