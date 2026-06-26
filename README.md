# 跨技术栈看板物料集成方案

> 一句话定位：这是一个 **BI 看板基座 + Vue2/Vue3 双版本物料组件库**，通过 Web Components / Custom Elements 把不同技术栈的物料以统一方式接入到同一个看板中。

---

## 目录

- [项目定位](#项目定位)
- [背景与问题](#背景与问题)
- [解决思路](#解决思路)
- [核心设计原则](#核心设计原则)
- [核心概念](#核心概念)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [物料迁移与打包流程](#物料迁移与打包流程)
- [Spec 驱动开发工作流](#Spec-驱动开发工作流)
- [延伸阅读](#延伸阅读)

---

## 项目定位

本项目提供一套轻量的**跨技术栈看板物料集成方案**：

- **看板基座（Host）**：负责统一渲染、按需加载、版本治理、错误隔离、跨物料通信，并统一提供 UI 组件库与主题。
- **物料组件库（Widget Libs）**：各部门继续用熟悉的 Vue2 或 Vue3 开发业务组件，通过打包插件将其输出为标准的 Custom Element（UMD 格式），并复用基座提供的 UI 组件。

核心目标是不强制统一技术栈、业务组件零改造、按需加载、公共依赖复用、UI 一致、支持嵌套。

---

## 背景与问题

在大型 2C 应用中，随着业务规模增长，单体应用往往需要按业务模块拆分为多个子项目，由不同团队独立维护，再通过微前端整合为完整应用。

然而，真实业务场景中，不少页面天然包含多个业务域的需求——一个页面上可能同时存在：

- A 业务的订单区域
- B 业务的支付区域
- C 业务的推荐区域

这些**"交叉页面"**到底归属哪个项目？由谁维护？在哪维护？成为团队协作的核心痛点。强行归属到任一团队，都会带来跨团队协作成本、合并冲突、发布耦合等问题。

---

## 解决思路

本框架借鉴 **BI 看板模式**：每个项目组只需维护好自己的物料（Widget），基座负责整合渲染。这样，交叉页面上不同业务区域的代码和职责天然解耦——A 团队维护 A 物料，B 团队维护 B 物料，基座负责把它们组合到同一个页面上。

由于这些子项目原本就是同一个大应用拆分出来的，UI 规范和交互规范高度一致。因此，**基础 UI 组件（如卡片、表格、表单等）应由基座统一封装提供，各物料直接引用即可，无需各自实现**。这也要求物料支持嵌套——一个物料内部可以引用另一个物料，形成组合。

```text
┌─────────────────────────────────────────────────────────────┐
│                    交叉页面（一个页面）                       │
│                                                             │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│   │ A 业务订单区  │   │ B 业务支付区  │   │ C 业务推荐区  │   │
│   │ <bi-orders>  │   │ <bi-payment> │   │ <bi-recommd> │   │
│   │  A 团队维护   │   │  B 团队维护   │   │  C 团队维护   │   │
│   └──────────────┘   └──────────────┘   └──────────────┘   │
│          ▲                  ▲                  ▲            │
└──────────┼──────────────────┼──────────────────┼────────────┘
           │                  │                  │
      按需加载 + 版本校验 + 错误隔离 + 统一 UI 组件 / 主题
           │                  │                  │
           └──────────────────┼──────────────────┘
                              ▼
                   ┌────────────────────┐
                   │   Host（基座）       │
                   │  整合渲染 / 物料注册表 │
                   │  公共运行时 + UI 库   │
                   └────────────────────┘
```

---

## 核心设计原则

| 原则 | 说明 | 对应实现 |
| ------ | ------ | ------ |
| **业务解耦** | 交叉页面的各业务区域独立开发、独立部署，不再纠结归属权。 | 物料以独立 Custom Element 形式存在，基座按注册表组合渲染，各团队独立仓库 / 独立 CI / 独立发布。 |
| **技术包容** | 不强制统一技术栈（Vue2 / Vue3 / 原生），各部门继续用现有技术。 | `widget-wrapper-plugin` 提供 Vue CLI / Vite / H5 三套打包插件，运行时通过 `window.Vue2` / `window.Vue3` 多版本共存。 |
| **最小改造** | 业务组件零改造，只改打包配置。 | 包装层采用扁平化 props 协议：保留组件原有 `props` 不变即可接入，宿主通过独立 kebab-case HTML attribute 传入每个 prop，包装层按声明类型自动解析注入。 |
| **UI 一致** | 基座统一提供 UI 组件库与主题，物料复用基座组件，保证视觉和交互一致。 | 基座按需加载 ElementUI / ElementPlus 并暴露为全局变量，物料构建时 `external`，运行时直接用 `<el-card>` 等标签。 |
| **按需加载** | 页面用到哪个物料才加载，不影响首屏性能。 | `widget-loader` 动态注入 `<script>` / `<link>`，URL 级去重缓存，支持 `requestIdleCallback` 空闲预加载与并发控制。 |
| **支持嵌套** | 物料可组合嵌套，基座组件也可被物料引用。 | `widget-scope` 暴露 `scope.loader` API，物料内部可加载子物料；内置祖先链循环依赖检测，支持多级嵌套。 |

---

## 核心概念

| 概念 | 说明 | 作用 |
| ------ | ------ | ------ |
| **Host（基座）** | 看板本身，负责维护物料注册表、提供公共依赖（Vue2 / Vue3 / ElementUI/ElementPlus）、渲染看板布局。 | 物料的"运行环境"。 |
| **Widget（物料）** | 被包装成 Custom Element 的业务组件，例如 `<bi-sales-panel>`、`<bi-finance-panel>`。 | 看板中的"板块内容"。 |
| **widget-loader** | 基座里的物料加载器，按需加载物料 JS/CSS、校验版本、捕获错误并降级。 | 负责"怎么把物料加载进来"。 |
| **widget-wrapper-plugin** | 自动包装插件，把 Vue2/Vue3 组件打包成 UMD Custom Element，并生成 `schema.json`。 | 负责"怎么把组件变成物料"。 |

它们之间的关系：

```text
┌──────────────────────────────────────────────┐
│                 Host（基座）                  │
│  ┌─────────────┐      ┌─────────────────┐   │
│  │ widget-loader│  ←── │  物料注册表      │   │
│  │ 加载/校验/渲染│      │  (JSON)         │   │
│  └──────┬──────┘      └─────────────────┘   │
└─────────┼────────────────────────────────────┘
          │
          │ 按需加载 JS / CSS
          ▼
┌─────────────────┐     ┌─────────────────┐
│  Vue2 Widget    │     │  Vue3 Widget    │
│ bi-sales-panel  │     │ bi-finance-panel│
│ (由 widget-     │     │ (由 widget-     │
│  wrapper-plugin │     │  wrapper-plugin │
│  自动打包)      │     │  自动打包)      │
└─────────────────┘     └─────────────────┘
```

- **widget-wrapper-plugin** 把业务组件变成可在浏览器中直接使用的 Custom Element。
- **widget-loader** 在基座里读取注册表，按需加载这些物料，并在容器里创建对应的 HTML 标签。
- **Host** 提供 Vue2/Vue3/ElementUI/ElementPlus 等公共运行时，确保不同版本的物料都能正确渲染。

---

## 目录结构

```text
/workspace
├── wc/                              # 核心方案实现（Web Components 层）
│   ├── widget-loader/               # 基座物料加载器（按需加载、版本契约、错误边界）
│   ├── widget-wrapper-plugin/       # 自动包装插件（Vue CLI / Vite）
│   ├── widget-bus/                  # 跨技术栈消息总线（基于 CustomEvent）
│   ├── schema-generator/            # 扫描组件 props 自动生成 schema.json
│   ├── vue2-widget-template/        # Vue2 物料打包模板与示例
│   ├── vue3-widget-template/        # Vue3 物料打包模板与示例
│   ├── i18n/                        # 跨技术栈轻量国际化运行时
│   ├── ai-assistant/                # AI 辅助迁移 / schema 补充 / 文档生成 CLI
│   ├── css-namespace-checker/       # CSS 命名空间检查工具
│   ├── js-risk-scanner/             # JS 危险 API 扫描工具
│   ├── dependency-analyzer/         # 公共依赖冲突分析工具
│   └── migration-skill/             # 旧组件迁移辅助
├── demo/                            # 可运行的示例
│   ├── vue2-host/                   # Vue2 看板基座示例
│   ├── vue3-host/                   # Vue3 看板基座示例
│   ├── vue2-widget-lib/             # Vue2 物料库示例（销售看板）
│   ├── vue3-widget-lib/             # Vue3 物料库示例（财务看板）
│   └── ai-migration-demo/           # AI 一次性迁移演示（老 Vue2/Vue3 项目→物料）
├── scripts/                         # 部署脚本
├── .trae/specs/                     # Spec 驱动开发规范目录
├── README.md                        # 本文件
└── package.json                     # 根目录依赖（部署相关）
```

### `wc/` 下主要模块职责

| 模块 | 职责 |
| ------ | ------ |
| `widget-loader` | 基座中加载物料 JS/CSS，做版本校验，提供错误边界和重试能力。 |
| `widget-wrapper-plugin` | 在构建时把 Vue 组件包装为 Custom Element，输出 UMD 产物和 `schema.json`。 |
| `widget-bus` | 基于 `CustomEvent` 的全局消息总线，支持 Vue2/Vue3/原生 JS 互相通信。 |
| `schema-generator` | 读取 `.vue` 文件的 `props`，自动生成看板配置表单协议。 |
| `vue2-widget-template` / `vue3-widget-template` | 最小化物料打包模板，不方便引入插件时可直接复制使用。 |
| `i18n` | 跨技术栈共享的轻量国际化运行时，基座和物料共用。 |
| `ai-assistant` | 提供迁移、schema 补充、README 生成的 AI Prompt 模板和 CLI 入口。 |

### `demo/` 下主要模块职责

| 模块 | 职责 |
| ------ | ------ |
| `vue2-host` | Vue2 基座示例，展示如何加载 Vue2/Vue3 物料、切换语言、刷新数据。 |
| `vue3-host` | Vue3 基座示例，同时提供 Vue2/Vue3 运行时，可加载双版本物料。 |
| `vue2-widget-lib` | Vue2 物料仓库示例，输出 `bi-sales-panel.js`。 |
| `vue3-widget-lib` | Vue3 物料仓库示例，输出 `bi-finance-panel.js`。 |
| `ai-migration-demo` | AI 一次性迁移演示：老 Vue2/Vue3 业务项目（未接入 wc）经迁移工具一次性改造为物料，保留原有 props，无需新增 config。 |

---

## 快速开始

以下步骤带你从零跑通整个项目。

### 1. 安装根目录依赖

```bash
cd /workspace
npm install
```

### 2. 安装并构建 Vue2 物料

```bash
cd demo/vue2-widget-lib
npm install
npm run build
```

产物位于 `demo/vue2-widget-lib/dist/`：

```text
dist/
├── bi-sales-panel.js
└── bi-sales-panel.js.map
```

### 3. 安装并构建 Vue3 物料

```bash
cd demo/vue3-widget-lib
npm install
npm run build
```

产物位于 `demo/vue3-widget-lib/dist/`：

```text
dist/
├── bi-finance-panel.js
├── bi-finance-panel.js.map
└── bi-finance-panel.schema.json
```

### 4. 把产物复制到基座

为了让基座在本地能直接加载物料，把构建产物复制到基座的 `public/widgets` 目录：

```bash
cp demo/vue2-widget-lib/dist/bi-sales-panel.js demo/vue2-host/public/widgets/
cp demo/vue3-widget-lib/dist/bi-finance-panel.js demo/vue2-host/public/widgets/
```

> 若 `public/widgets` 目录不存在，请先创建：`mkdir -p demo/vue2-host/public/widgets`

### 5. 启动基座预览

```bash
cd demo/vue2-host
npm install
npm run serve
```

浏览器打开默认地址（通常是 `http://localhost:8080`），即可看到：

- Vue2 销售看板正常渲染。
- Vue3 财务看板因当前基座仅提供 Vue2 运行时，被版本契约明确拒绝加载。
- 故意崩溃的物料被降级隔离，点击"重试"可恢复。

也可以启动 Vue3 基座：

```bash
cd demo/vue3-host
npm install
npm run serve
```

Vue3 基座同时提供 Vue2/Vue3 运行时，双版本物料均可正常加载。

### 6. 本地热调试（推荐开发模式）

修改物料源码后，手动 `build + cp + 刷新` 效率太低。推荐同时启动以下服务：

```bash
# 终端 1：Vue2 物料热构建
cd demo/vue2-widget-lib
npm run serve:widget

# 终端 2：Vue2 物料静态服务（端口 8081，带 CORS）
cd demo/vue2-widget-lib
npm run serve:dist

# 终端 3：Vue3 物料热构建
cd demo/vue3-widget-lib
npm run serve:widget

# 终端 4：Vue3 物料静态服务（端口 8082，带 CORS）
cd demo/vue3-widget-lib
npm run serve:dist

# 终端 5：启动基座
cd demo/vue2-host
npm run serve
```

此时基座会从 `http://localhost:8081` 和 `http://localhost:8082` 加载物料，修改源码后刷新页面即可看到最新效果。

在浏览器 Console 执行以下命令可开启加载器调试日志：

```js
localStorage.setItem('widget-loader-debug', 'true');
```

---

## 物料迁移与打包流程

### 场景

你手里有一个已有的 Vue2/Vue3 业务组件，希望把它接入看板基座，变成一个可被基座按需加载的物料。

### 方案 A：使用自动包装插件（推荐，业务代码零改造）

#### Vue2 + Vue CLI

修改物料仓库的 `vue.config.js`：

```js
const widgetPlugin = require('./wc/widget-wrapper-plugin/vue-cli-plugin');

module.exports = {
  css: { extract: false },
  chainWebpack: widgetPlugin({
    name: 'bi-sales-panel',
    component: './src/components/SalesPanel.vue',
    vueGlobal: 'Vue2'
  })
};
```

打包：

```bash
npm run build
```

输出 `bi-sales-panel.js` 和 `bi-sales-panel.schema.json`。

#### Vue3 + Vite

修改物料仓库的 `vite.config.js`：

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import widgetVitePlugin from './wc/widget-wrapper-plugin/vite-plugin';

export default defineConfig({
  plugins: [
    vue(),
    widgetVitePlugin({
      name: 'bi-finance-panel',
      component: './src/components/FinancePanel.vue'
    })
  ]
});
```

打包：

```bash
npm run build
```

### 方案 B：手动复制模板

如果项目不方便引入插件，可复制 `wc/vue2-widget-template` 或 `wc/vue3-widget-template` 中的：

- `widget-wrapper.js` 到自己的仓库。
- 对应的 `vue.config.js` / `vite.config.js`。

然后设置环境变量：

- Vue2：`WIDGET_NAME=bi-sales-panel WIDGET_COMPONENT=./src/components/SalesPanel.vue npm run build`
- Vue3：`VITE_WIDGET_NAME=bi-finance-panel VITE_WIDGET_COMPONENT=./src/components/FinancePanel.vue npm run build`

### 业务组件需要改什么？

**通常不需要改代码。** 包装层采用扁平化 props 协议：保留组件原有的 `props` 不变即可接入，宿主通过独立 HTML 属性（kebab-case）传入每个 prop，包装层按声明类型自动解析：

```vue
<script>
export default {
  props: {
    title: { type: String, default: '销售看板' },
    maxCount: { type: Number, default: 0 }
  }
};
</script>
```

宿主加载时通过 `props` 字段传入（每个 prop 按 kebab-case 拆为独立 attribute）：

```js
await mountWidget(container, {
  name: 'bi-xxx',
  js: '/widgets/bi-xxx.js',
  props: { title: 'Q3 概览', maxCount: 5 }
});
// 等价于：<bi-xxx title="Q3 概览" max-count="5">
```

详见 [`wc/README.md` § 1.3](wc/README.md)。

### schema.json 自动生成

打包时插件会自动扫描组件 props，生成 `dist/bi-xxx.schema.json`。如需单独生成：

```bash
node wc/schema-generator/index.js bi-sales-panel ./src/components/SalesPanel.vue
```

### 如何注册到基座

把产物上传到 CDN 后，在基座注册表里加一条记录即可：

```js
export const widgets = [
  {
    name: 'bi-sales-panel',
    vueVersion: '2',
    js: 'https://cdn.example.com/widgets/bi-sales-panel.js',
    css: 'https://cdn.example.com/widgets/bi-sales-panel.css',
    props: { title: '销售看板' }
  }
];
```

基座加载时，`widget-loader` 会根据 `vueVersion` 校验基座是否提供了兼容的 Vue 运行时。

### AI 辅助迁移

对于旧组件迁移、schema 语义补充、README 生成，可使用迁移工具与 AI 辅助 CLI：

```bash
# 规则化一次性迁移（推荐首选，始终 props 模式，保留原有 props）
node wc/migration-skill/index.js bi-sales-panel ./src/components/SalesPanel.vue 2
node wc/migration-skill/index.js bi-finance-panel ./src/components/FinancePanel.vue 3

# AI 辅助迁移（结合扁平化 props 协议提示词，保留原有 props）
node wc/ai-assistant/cli.js migrate bi-sales-panel ./src/components/SalesPanel.vue

# 生成更丰富的 schema
node wc/ai-assistant/cli.js schema bi-sales-panel ./src/components/SalesPanel.vue

# 生成组件文档
node wc/ai-assistant/cli.js readme bi-sales-panel ./src/components/SalesPanel.vue
```

完整的 AI 一次性迁移演示（老 Vue2/Vue3 项目 → 物料）见 [`demo/ai-migration-demo/README.md`](demo/ai-migration-demo/README.md)。

---

## Spec 驱动开发工作流

本项目采用 `.trae/specs/` 目录下的规范驱动开发（Spec-Driven Development）工作流，确保每项变更都有明确的需求定义、实施任务和验收标准。

### `.trae/specs/<change-id>/` 目录

每个变更对应一个独立的目录，路径为 `.trae/specs/<change-id>/`。该目录是某次完整变更的单一信息源，集中存放需求规范、实施任务和验收清单，便于跟踪、评审和回溯。

### 三份必要文档

每个 `<change-id>/` 目录下必须包含以下三份文档：

- **spec.md**：需求规范文档，描述变更背景、目标、范围、非功能性要求及验收标准，是用户审批和子代理实施的依据。
- **tasks.md**：实施任务文档，将 `spec.md` 中的需求拆分为可执行的子任务，通常由子代理在执行阶段参考和更新。
- **checklist.md**：验收清单文档，列出验证变更是否完成所需检查项，用于最终对照和确认交付质量。

### 完整工作流程

1. **编写规范**：由主代理或用户编写 `spec.md`，明确变更目标与验收标准。
2. **用户审批**：用户审阅并批准 `spec.md` 后，方可进入实施阶段。
3. **子代理实施**：子代理根据已批准的规范，参考 `tasks.md` 完成代码修改与实现。
4. **清单核验**：实施完成后，对照 `checklist.md` 逐项验证，确保变更符合预期。

### change-id 命名约定

`change-id` 应满足以下格式：

- 以动词开头，体现变更动作；
- 全部小写；
- 使用短横线连接（kebab-case）。

例如：`add-i18n-support`、`refactor-widget-loader`、`fix-memory-leak`。

---

## 延伸阅读

想深入学习实现原理，建议按以下顺序阅读：

1. `wc/widget-wrapper-plugin/` —— 看包装层怎么生成。
2. `wc/widget-loader/` —— 看基座怎么加载物料。
3. `wc/widget-bus/` —— 看跨栈通信怎么实现。
4. `wc/schema-generator/` —— 看 schema 怎么自动生成。
5. `wc/ARCHITECTURE_COMPARISON.md` —— 看本方案与微前端、模块联邦等主流方案的对比。
6. `demo/README.md` —— 看更详细的本地热调试和架构解读。
