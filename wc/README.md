# wc 跨技术栈看板物料集成方案

一套基于 Web Components / Custom Elements 的轻量集成方案，用于将不同部门、不同技术栈（Vue2 / Vue3 / 原生）的物料组件以统一方式接入到同一个 BI 看板基座中。

核心目标：

- **不强制统一技术栈**：各部门继续用 Vue2 或 Vue3 开发。
- **最小化改造成本**：业务组件零改造，只改打包配置。
- **按需加载**：看板用到哪个物料才加载对应 JS/CSS。
- **公共依赖复用**：Vue、aui 等公共库由基座统一提供，物料包只打包业务代码。

---

## 目录结构

```
wc/
├── mock-aui/                      # 统一 UI 组件库（Web Components，跨 Vue2/Vue3）
│   └── index.js
├── vue2-widget-template/          # Vue2 物料零改造模板
│   ├── widget-wrapper.js          # Custom Element 包装入口
│   ├── vue.config.js              # UMD 打包配置示例
│   └── example/SalesPanel.vue     # 业务组件示例
├── vue3-widget-template/          # Vue3 物料零改造模板
│   ├── widget-wrapper.js          # Custom Element 包装入口
│   ├── vite.config.js             # UMD 打包配置示例
│   └── example/FinancePanel.vue   # 业务组件示例
├── widget-wrapper-plugin/         # 自动包装插件
│   ├── vue-cli-plugin.js          # Vue CLI 插件
│   └── vite-plugin.js             # Vite 插件
├── widget-loader/                 # 基座物料加载器
│   └── index.js
├── widget-bus/                    # 跨技术栈消息总线
│   └── index.js
├── schema-generator/              # schema.json 自动生成器
│   └── index.js
├── ai-assistant/                  # AI 辅助工具
│   ├── prompts/                   # AI 提示词模板
│   └── cli.js                     # CLI 入口
└── README.md                      # 本文档
```

---

## 一、物料库如何改造

### 1.1 方案 A：使用自动包装插件（推荐）

只需安装插件并修改打包配置，业务组件代码**完全不用改**。

#### Vue2 + Vue CLI

```bash
npm i @vue/web-component-wrapper
```

`vue.config.js`：

```js
const widgetPlugin = require('./wc/widget-wrapper-plugin/vue-cli-plugin');

module.exports = {
  pluginOptions: {
    widget: {
      name: 'bi-sales-panel',
      component: './src/components/SalesPanel.vue'
    }
  },
  configureWebpack: widgetPlugin()
};
```

打包：

```bash
npm run build
```

输出 `bi-sales-panel.js` 和 `bi-sales-panel.schema.json`，直接挂到 CDN 即可。

#### Vue3 + Vite

`vite.config.js`：

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

### 1.2 方案 B：手动复制模板

如果项目不方便引入插件，可直接复制 `vue2-widget-template` 或 `vue3-widget-template` 中的：

- `widget-wrapper.js` 到自己的仓库
- 对应的 `vue.config.js` / `vite.config.js`

然后修改环境变量 `WIDGET_NAME` / `WIDGET_COMPONENT`（Vue2）或 `VITE_WIDGET_NAME` / `VITE_WIDGET_COMPONENT`（Vue3）。

### 1.3 业务组件真正的零改造

包装插件会在 Custom Element 层把 `config` attribute 从 String 自动解析为 Object，再传给业务组件。因此业务组件可以像普通 Vue 组件一样接收 Object prop：

```vue
<script>
export default {
  props: {
    config: { type: Object, default: () => ({}) }
  }
};
</script>
```

> 如果旧组件本来就有 `config` Object prop，**完全不需要改代码**，只改打包配置即可。

### 1.4 schema.json 自动生成

打包时插件会自动扫描组件 props，生成 `dist/bi-xxx.schema.json`，无需手写。

如需单独生成：

```bash
node wc/schema-generator/index.js bi-sales-panel ./src/components/SalesPanel.vue
```

> 自动生成的 schema 包含类型、默认值、必填项和布局尺寸。业务标题、枚举值等语义信息可通过 AI 辅助补充。

### 1.5 物料发布

每个物料仓库发布时需提供：

| 产物 | 说明 | 生成方式 |
|---|---|---|
| `bi-xxx.js` | UMD 格式 Custom Element 注册文件 | 插件自动打包 |
| `bi-xxx.css` | 可选，组件自身样式 | 构建输出 |
| `bi-xxx.schema.json` | 看板配置表单生成协议 | 插件自动生成 |

把产物上传到 CDN 后，将地址登记到基座的注册表中。

---

## 二、基座如何改造

### 2.0 加载统一 UI 组件库（统一 UI 层）

基座负责加载统一 UI 组件库（如 `aui`），挂载到全局。物料构建时把 `aui` 设为 external，只打包业务逻辑，运行时直接使用基座提供的 UI 组件。

```js
// main.js
import './wc/mock-aui/index.js';  // 注册 aui-card / aui-statistic 等到全局，挂载 window.aui
```

物料组件里直接使用 aui 标签，无需 import：

```vue
<template>
  <aui-card title="销售看板">
    <aui-row>
      <aui-statistic label="销售额" prefix="¥" :value="amount" />
    </aui-row>
  </aui-card>
</template>
```

**为什么用 Web Components 实现 aui？**

Vue2 组件和 Vue3 组件互不兼容，无法共享。用 Web Components 实现的 aui 组件可以被任何框架使用，真正做到"基座加载一次，所有物料复用"。

> 注意：Vue2 物料的包装层需要禁用 Shadow DOM（`shadow: false`），否则 aui 的全局样式无法穿透到物料内部。

### 2.1 公共依赖版本契约（版本治理）

**问题**：团队 A 用 Vue 2.6.14、团队 B 用 Vue 2.7.0，基座只提供 2.6.14，运行时可能报晦涩的错误；又如 Vue3 物料被误加载到只有 Vue2 运行时的基座，报错信息难以定位。

**方案**：在 `widget-loader` 中内置公共依赖版本契约 `SUPPORTED_DEPS`，加载物料前先做版本校验，不兼容直接拒绝加载并抛出明确错误（`error.code === 'DEP_VERSION_MISMATCH'`），避免晦涩的 runtime error。

```js
// wc/widget-loader/index.js
const SUPPORTED_DEPS = {
  vue2: { version: '2.6.14', compatibleRange: '^2.6.0', globalVar: 'Vue2' },
  vue3: { version: '3.4.21', compatibleRange: '^3.0.0', globalVar: 'Vue3' },
  aui:  { version: '1.8.2',  compatibleRange: '^1.8.0', globalVar: 'aui'  }
};
```

物料在注册表中声明 `vueVersion`，加载器据此选择对应全局变量（`window.Vue2` / `window.Vue3`）并校验其版本是否落在 `compatibleRange` 内。内置轻量 semver（支持 `^` / `~` / `>=` / `>` / `<=` / `<` / 精确版本），无需引入外部依赖。

```js
// 注册表条目
{
  name: 'bi-finance-panel',
  vueVersion: '3',          // 声明依赖的 Vue 主版本
  js: '/widgets/bi-finance-panel.js',
  config: { title: '财务看板' }
}
```

校验失败时抛出结构化错误，`mountWidget` 还会把原因渲染到错误占位节点上，控制台与页面同时可见：

```
[widget-loader] 版本校验失败，已拒绝加载物料 "bi-finance-panel"：
  - 物料 "bi-finance-panel" 依赖 Vue3（^3.0.0），但基座未提供 Vue3 运行时
```

> demo 中 `vue2-host` 为纯 Vue2 基座（不提供 Vue3 运行时），其注册表里的 Vue3 物料 `bi-finance-panel` 会被版本契约明确拒绝；`vue3-host` 同时提供 Vue2/Vue3 运行时，两类物料均可正常加载。

### 2.2 错误边界（单点失败不影响整体）

**问题**：一个物料的 JS 报错（渲染崩溃、`setTimeout`/Promise 内未捕获异常）可能向上冒泡，导致整个看板白屏。

**方案**：`widget-loader` 内置错误边界，覆盖三类失败场景，命中后用降级占位替换崩溃物料，其余物料不受影响。

| 失败场景 | 捕获机制 | 处理 |
|---|---|---|
| 加载/版本校验失败 | `mountWidget` 的 `try/catch` | 渲染降级占位，抛出结构化错误 |
| 挂载同步抛错（`connectedCallback` 内 throw） | `renderWidget` 包裹 `appendChild` | 移除半挂载元素，渲染降级占位 |
| 运行时崩溃（`setTimeout`/Promise/事件回调） | 全局 `error` + `unhandledrejection` 监听，按 `filename`/堆栈/物料名归因 | 移除崩溃元素，渲染降级占位 |

```js
// widget-loader 内部维护已挂载物料表，全局监听器据此归因
const mountedWidgets = new Map(); // name -> { element, container, widget, failed }

window.addEventListener('error', (event) => {
  const name = attributeErrorToWidget(event); // 按 target 元素 / filename / 堆栈归因
  if (name) {
    markWidgetFailed(name, event.error || new Error(event.message));
    event.preventDefault(); // 已降级，抑制浏览器默认报错
  }
}, true);
```

降级占位会展示崩溃原因，控制台同步输出：

```
[widget-loader] 物料 "bi-broken-panel" 运行时崩溃，已降级隔离：
bi-broken-panel 业务逻辑崩溃：模拟未捕获的运行时错误（setTimeout 内抛出）
```

> demo 中 `vue2-host` 注册了一个故意在 `setTimeout` 里抛错的物料 `bi-broken-panel`：它先正常挂载，500ms 后崩溃，错误边界将其降级为占位，旁边的销售看板继续正常运行，看板不白屏。

### 2.3 引入物料加载器

```js
import { loadWidget, mountWidget } from './wc/widget-loader';

// 方式一：只加载不渲染
await loadWidget({
  name: 'bi-sales-panel',
  js: 'https://cdn.xxx/bi-sales-panel.js',
  css: 'https://cdn.xxx/bi-sales-panel.css'
});

// 方式二：加载并渲染到容器
await mountWidget(document.getElementById('container'), {
  name: 'bi-sales-panel',
  js: 'https://cdn.xxx/bi-sales-panel.js',
  css: 'https://cdn.xxx/bi-sales-panel.css',
  config: { title: '本月销售', period: 'month' }
});
```

### 2.4 注册表设计（极简版）

基座维护一个 JSON 注册表，记录可用物料：

```json
[
  {
    "name": "bi-sales-panel",
    "label": "销售总览",
    "category": "销售部",
    "js": "https://cdn.xxx/bi-sales-panel.js",
    "css": "https://cdn.xxx/bi-sales-panel.css"
  },
  {
    "name": "bi-finance-panel",
    "label": "财务看板",
    "category": "财务部",
    "js": "https://cdn.xxx/bi-finance-panel.js"
  }
]
```

新增部门物料时，只需往注册表里加一条记录，**不需要修改基座代码**。

### 2.5 跨组件通信

不同技术栈的物料需要通信时，使用 `widget-bus`：

```js
import { emit, on } from './wc/widget-bus';

// 发送消息
emit('refresh-data', { widget: 'bi-sales-panel' });

// 接收消息
const off = on('refresh-data', payload => {
  console.log('收到刷新指令', payload);
});

// 取消监听
off();
```

Vue2/Vue3 项目也可以安装对应的插件：

```js
// Vue2
import { Vue2BusPlugin } from './wc/widget-bus';
Vue.use(Vue2BusPlugin);
// this.$widgetBus.emit('xxx')

// Vue3
import { Vue3BusPlugin } from './wc/widget-bus';
app.use(Vue3BusPlugin);
// app.config.globalProperties.$widgetBus.emit('xxx')
```

---

## 三、AI 辅助工具

对于迁移旧组件、生成语义更丰富的 schema、编写文档这类无法完全规则化的事情，我们提供了 AI 提示词模板和 CLI 框架。

### 3.1 提供的提示词模板

| 模板 | 用途 |
|---|---|
| `prompts/migrate-component.txt` | 把旧 Vue 组件迁移为物料组件 |
| `prompts/generate-schema.txt` | 根据组件代码生成带业务语义的 schema |
| `prompts/generate-readme.txt` | 根据组件代码生成使用文档 |

### 3.2 CLI 用法

```bash
# 让 AI 辅助迁移旧组件
node wc/ai-assistant/cli.js migrate bi-sales-panel ./src/components/SalesPanel.vue

# 让 AI 生成更丰富的 schema
node wc/ai-assistant/cli.js schema bi-sales-panel ./src/components/SalesPanel.vue

# 让 AI 生成组件文档
node wc/ai-assistant/cli.js readme bi-sales-panel ./src/components/SalesPanel.vue
```

当前 CLI 只负责拼接 Prompt，接入大模型 API 后可直接写回文件。

### 3.3 哪些工作适合交给 AI

- **迁移旧组件**：保持业务逻辑，自动加命名空间、调整 config prop。
- **schema 语义补充**：自动填写中文标题、描述、枚举值、尺寸建议。
- **文档生成**：根据代码生成 README、config 说明表格。
- **样式冲突检查**：扫描组件 CSS，提示未加命名空间的选择器。

---

## 四、改造成本分析

### 4.1 物料库改造成本：很低

| 工作项 | 工作量 | 说明 |
|---|---|---|
| 安装/引入包装插件 | 0.5 天 | npm install + 改一行配置 |
| 调整打包脚本 | 0.5 天 | 输出 UMD，external vue/aui |
| 业务组件适配 config | **0 天** | 插件自动解析 Object，组件无需改代码 |
| 生成 schema.json | **0 天** | 插件自动生成 |
| 发布到 CDN | 1 天 | 接入现有 CI/CD |
| 联调测试 | 1 天 | 在基座里验证 |

**仍需要人工处理的风险点**：

- 组件内部使用了全局状态（Vuex/Pinia/事件总线），需要改为组件自治。
- 组件内部有 `document.body` 挂载的弹窗/浮层，可能与基座样式冲突。
- 组件依赖了部门项目的私有构建配置，抽取 widget 入口困难。
- 样式命名空间需要人工或 AI 检查。

> 上述风险点大部分可通过 **AI 辅助迁移** 降低人工成本。

### 4.2 基座改造成本：中

| 工作项 | 工作量 | 说明 |
|---|---|---|
| 接入物料加载器 | 1 天 | 按需加载 JS/CSS，错误处理 |
| 设计注册表 | 0.5 天 | JSON 格式，按部门分类 |
| 拖拽/布局适配 | 2~3 天 | 把 Custom Element 标签接入现有布局 |
| 配置表单生成 | 2~3 天 | 根据 schema 渲染配置面板 |
| 接入消息总线 | 0.5 天 | 全局事件通信 |

### 4.3 团队学习成本：低

- Vue 开发者对组件封装很熟悉，只是多了一层 Custom Element。
- 不需要学习微前端框架（qiankun/micro-app 等）。
- Web Components 生命周期只需理解 `connectedCallback` / `attributeChangedCallback`。

---

## 五、可优化的地方

### 5.1 公共依赖版本约束

✅ 已实现（见 [2.1 公共依赖版本契约](#21-公共依赖版本契约版本治理)）：`widget-loader` 内置 `SUPPORTED_DEPS` 版本契约，加载物料前按 `vueVersion` 校验 `window.Vue2` / `window.Vue3` 与 `window.aui` 的版本是否落在兼容范围内，不兼容直接拒绝加载并给出明确错误。

🔄 待增强：

- 支持物料在注册表中声明自定义 `compatibleRange`（覆盖基座默认范围），实现"物料级"版本诉求。
- 校验失败时支持降级策略（如加载兼容的旧版本物料）而非直接拒绝。

### 5.2 样式隔离

当前方案不开启 Shadow DOM，依赖各部门自觉加命名空间前缀（如 `.bi-sales-panel`）。后续可：

- 制定 CSS 命名规范，强制要求物料根类名为 `bi-xxx`。
- 在构建插件里加入 CSS 检查，自动提示未加命名空间的选择器。
- 或引入 CSS Modules / scoped style，但 Shadow DOM 仍不推荐（与 aui 全局样式冲突）。

### 5.3 配置协议 schema（已实现基础版）

✅ 已支持：

- 自动包装插件扫描组件 props 生成 `schema.json`。
- schema 中声明 `defaultSize`、`minSize` 等布局信息。

🔄 待增强：

- 业务标题、描述、枚举值等语义信息可通过 AI 自动补充。
- 基座根据 schema 自动生成配置表单。

### 5.4 加载性能优化

- **预加载**：看板进入编辑态时，提前加载所有可选物料。
- **缓存**：加载器已做了 URL 级缓存，避免重复加载。
- **分片**：如果单个物料包过大，可考虑把公共业务逻辑拆成 chunks。

### 5.5 错误监控

✅ 已实现（见 [2.2 错误边界](#22-错误边界单点失败不影响整体)）：加载失败、挂载同步抛错、运行时崩溃（`setTimeout`/Promise/事件回调）三类场景均被捕获并降级为占位，单点失败不影响整体看板。

🔄 待增强：

- 加载失败日志上报到监控平台（Sentry 等），支持重试。
- 降级占位支持自定义渲染（如"点击重试"按钮）。
- 运行时崩溃归因目前依赖 `filename`/堆栈匹配，对压缩后无 source map 的物料可能归因不到，可结合 source map 上报还原。

### 5.6 构建插件增强

- 支持多入口：一个仓库同时输出多个物料。
- 自动生成 `package.json` 发布配置。
- 支持 TypeScript 组件的自动包装。
- 接入 AI 后，自动完成迁移、文档、schema 语义补充。

---

## 六、快速开始

### 跑通一个 Vue2 物料

```bash
cd vue2-widget-template
npm install vue @vue/web-component-wrapper
WIDGET_NAME=bi-sales-panel WIDGET_COMPONENT=./example/SalesPanel.vue npm run build
```

构建产物：

```
dist/
  ├── bi-sales-panel.js
  └── bi-sales-panel.schema.json
```

### 跑通一个 Vue3 物料

```bash
cd vue3-widget-template
npm install vue vite @vitejs/plugin-vue
VITE_WIDGET_NAME=bi-finance-panel VITE_WIDGET_COMPONENT=./example/FinancePanel.vue npm run build
```

### 用 AI 辅助迁移旧组件

```bash
node wc/ai-assistant/cli.js migrate bi-sales-panel ./src/components/SalesPanel.vue
```

### 在基座里加载

```html
<div id="dashboard"></div>
<script type="module">
  import { mountWidget } from './wc/widget-loader/index.js';

  mountWidget(document.getElementById('dashboard'), {
    name: 'bi-sales-panel',
    js: './bi-sales-panel.js',
    config: { title: '销售看板' }
  });
</script>
```

### 本地热调试

demo 项目已配置完整的本地热调试流程：watch 构建 + 本地静态服务 + 环境感知注册表 + Source Map。详细步骤见 [demo/README.md](demo/README.md#六本地热调试方案推荐开发模式)。

---

## 七、总结

本方案通过 Web Components 把跨技术栈的物料组件封装成统一的 Custom Element，基座按需加载、统一渲染。相比微前端框架，它更轻量、改造成本更低，特别适合：

- 多部门独立维护不同模块。
- 技术栈不统一（Vue2 / Vue3 / 原生）。
- 只需要"板块级"集成，不需要完整应用级隔离。

主要代价是放弃了 Shadow DOM 的强样式隔离，需要依靠规范和 CSS 命名空间来避免冲突。
