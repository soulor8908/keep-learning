## 项目概述

跨技术栈看板物料集成方案（BI 看板基座 + Vue2/Vue3/H5 物料），通过 UMD + `mount()` 把不同技术栈的物料以统一方式接入到同一个看板中。面向 2C 页面，对首屏性能、运行时性能和体积敏感。

依赖冲突的解决方案是 `external` + `globals` + 不同全局变量名（`Vue2` / `Vue3`），不是 Custom Elements。新架构已删除 CE 包装层。

## 技术栈

- **框架**：Vue 2/3、原生 H5
- **构建工具**：Vite（每个物料独立构建为 UMD）
- **UI 库**：ElementUI (Vue2)、ElementPlus (Vue3) —— 可选，按需加载
- **包管理器**：pnpm
- **测试**：Vitest + Playwright

## 目录结构

```
/workspace/projects/
├── package.json              # 根依赖（测试工具 + concurrently）
├── scripts/                  # 构建与部署脚本
│   ├── deploy_build.sh       # 部署构建
│   └── deploy_run.sh         # 部署运行
├── demo/                     # 子项目
│   ├── host/                 # 统一基座（Vue2 + Vue3 + H5 共存）
│   ├── vue2-widgets/         # Vue2 物料（每个物料独立 UMD）
│   │   ├── build.mjs         # 分包构建脚本
│   │   └── src/widgets/      # 各物料独立目录
│   ├── vue3-widgets/         # Vue3 物料（每个物料独立 UMD）
│   │   ├── build.mjs
│   │   └── src/widgets/
│   └── h5-widgets/           # H5 物料（每个物料独立 UMD）
│       ├── build.mjs
│       └── src/widgets/
└── wc/                       # 运行时核心
    ├── loader.js             # UMD 加载 + URL 缓存 + 依赖检查 + 错误降级
    ├── WidgetHost.vue        # Vue3 基座组件
    ├── templates/            # Vue2 / Vue3 / H5 物料入口模板
    └── README.md
```

## 关键入口 / 核心模块

| 子项目 | 端口 | 入口 | 用途 |
|--------|------|------|------|
| demo/host | 5000 | index.html | 统一基座（主预览入口） |
| demo/vue2-widgets | - | build.mjs | Vue2 物料分包 UMD 构建 |
| demo/vue3-widgets | - | build.mjs | Vue3 物料分包 UMD 构建 |
| demo/h5-widgets | - | build.mjs | H5 物料分包 UMD 构建 |

## 核心 API

| 模块 | 导出 | 说明 |
|------|------|------|
| @wc/core/loader | `mountWidget(container, widget)`、`unmountWidget(api)`、`preloadWidgets(urls)` | 轻量加载器 |
| @wc/core/WidgetHost.vue | `WidgetHost` | Vue3 基座组件（支持 `css` 属性） |
| @wc/core/templates/vue2 | `createVue2Widget(Component, options)` | Vue2 物料入口模板 |
| @wc/core/templates/vue3 | `createVue3Widget(Component, options)` | Vue3 物料入口模板 |
| @wc/core/templates/h5 | `createH5Widget(renderFn)` | H5 物料入口模板 |

## 运行与预览

```bash
# 安装根依赖
pnpm install

# 构建所有物料（每个物料独立 UMD 文件）
pnpm build:widgets

# 启动统一基座
pnpm serve

# 一键启动：构建物料 + watch + host
pnpm dev

# 单独预览某个物料
pnpm dev:widget:vue2
pnpm dev:widget:vue3
pnpm dev:widget:h5
```

## 分包构建

每个技术栈的物料通过 `build.mjs` 自动分包构建：

- 扫描 `src/widgets/` 下所有子目录
- 每个目录生成独立的 `{name}.js` + `{name}.css`
- UMD 全局名自动转换：`my-widget` → `biMyWidget`
- 产物输出到 `dist/` 目录

新增物料只需在 `src/widgets/` 下创建目录，无需修改构建配置。

## 用户偏好与长期约束

- Node.js 项目统一使用 pnpm 管理依赖
- 预览端口固定为 5000
- 部署入口为 demo/host
- 物料需支持离线/内网环境
- 只适配原生 H5、Vue2、Vue3，不做过度设计
- 2C 页面：首屏性能、体积、鲁棒性优先
- 不兼容历史版本，API 可自由迭代

## 关键运行时全局变量

| 全局变量 | 提供者 | 用途 |
|---------|--------|------|
| `window.Vue2` | 基座 index.html | Vue2 物料运行时 |
| `window.Vue3` | 基座 index.html | Vue3 物料运行时 |
| `window.ElementPlus` | 基座 index.html | ElementPlus 组件库（可选） |
| `window._` | 基座 index.html | lodash（可选） |
| `window.axios` | 基座 index.html | axios（可选） |

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
