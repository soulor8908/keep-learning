---
name: wc-migration
description: >
  用于将现有 Vue2/Vue3 组件迁移为 wc 看板物料组件（Web Components / Custom Elements）。
  当用户提到以下任一需求时触发：迁移组件为看板物料、把组件打包成物料、生成看板物料、
  生成 schema.json、接入 wc、改造为 Custom Element、看板组件迁移、物料库改造。
---

# wc 看板物料迁移 Skill

本 Skill 指导 AI 将现有 Vue2/Vue3 业务组件快速改造成可独立发布的看板物料组件。

## 一、方案核心原则

- **不修改业务逻辑**：只在组件外层包一层 Custom Element。
- **config 与 props 双模兼容（推荐 props 模式）**：包装层同时支持两种通讯方式，业务组件改造时无需额外添加 config 属性：
  - **props 模式（推荐）**：保留组件原有 props 不变。宿主通过独立的 HTML 属性（kebab-case）传入每个 prop，包装层按声明类型解析并注入。例如组件声明 `props: { title: String, maxCount: Number }`，宿主写 `<bi-xxx title="hello" max-count="5">`，无需新增 config prop。
  - **config 模式（向后兼容）**：宿主通过 `config='{"title":"a"}'` 传入聚合配置对象，包装层解析为 Object 传给 `props.config`（组件需声明 `config: Object`）。
  - 两种模式可混用：组件可同时声明 config（聚合配置）和其它独立 props，宿主可同时传 config attribute 和独立 prop 属性。
- **公共依赖 external**：Vue、ElementUI/ElementPlus 由基座统一提供，物料包只打包业务代码。
- **schema 自动生成**：通过 `wc/schema-generator/index.js` 扫描组件 props 生成 `bi-xxx.schema.json`。
- **无 Shadow DOM**：保持 ElementUI/ElementPlus 全局样式可用，业务组件只需加 `bi-xxx` 命名空间。
  - **禁止使用 Vue3 的 `defineCustomElement()`**：它默认调用 `attachShadow()`，会隔离物料样式，导致 ElementUI/ElementPlus 全局样式 / 主题变量 / 字体图标无法穿透。
  - Vue2/Vue3 包装层都手写 `HTMLElement` + `createApp().mount(this)`（Vue3）/ `new Vue().$mount()`（Vue2），挂载到 light DOM。
  - 包装层已加运行时守卫：`connectedCallback` 中检测到 `this.shadowRoot` 立即 `console.error` 告警。

## 二、快速迁移（自动化 CLI）

对于规则明确的改造，可以直接使用迁移辅助 CLI：

```bash
# Vue2 组件（默认 props 模式，保留原有 props 不新增 config）
node wc/migration-skill/index.js bi-sales-panel ./src/components/SalesPanel.vue 2

# Vue3 组件（props 模式）
node wc/migration-skill/index.js bi-finance-panel ./src/components/FinancePanel.vue 3

# 显式指定 config 模式（需要聚合通讯配置时）
node wc/migration-skill/index.js bi-finance-panel ./src/components/FinancePanel.vue 3 --mode config
```

CLI 会自动完成：
1. 按通讯模式处理 config prop：
   - `--mode props`（默认）：保留原有 props，不强行新增 config prop。
   - `--mode config`：若无 config prop 则补充 `config: { type: Object, default: () => ({}) }`。
2. 给根元素添加 `bi-xxx` 命名空间类名。
3. 调用 `css-namespace-checker` 检查样式冲突。
4. 调用 `js-risk-scanner` 检查全局状态 / body 挂载等风险。
5. 输出推荐的 `vue.config.js` / `vite.config.js` 配置。

生成的新文件为 `*.migrated.vue`，请人工确认后再覆盖原文件。

## 三、迁移前必做检查

在执行迁移前，先确认以下信息：

1. **组件路径**：用户要迁移的 `.vue` 文件路径。
2. **物料名称**：统一以 `bi-` 开头，例如 `bi-sales-panel`。
3. **技术栈**：Vue2 还是 Vue3，使用 Vue CLI 还是 Vite。
4. **是否有 ElementUI/ElementPlus 以外的全局依赖**：如有，需要评估是否 external。
5. **组件内部是否使用全局状态**：如 Vuex/Pinia/事件总线，需要改为组件自治或从 config 读取。

## 四、迁移执行步骤

### 步骤 1：确认并改造组件代码（如需）

#### 通讯模式选择

- **props 模式（推荐）**：如果组件已有独立 props（如 `title`、`maxCount`），**保留原有 props 不变**，无需新增 config prop。宿主会通过独立属性（kebab-case）传入。
- **config 模式**：仅当组件需要接收一个聚合的通讯配置对象（含多个字段、嵌套结构、宿主上下文）时，才添加 config prop。

#### props 模式（推荐，无需改组件 props）

如果组件已有 props，直接保留即可。只需给根元素加类名：

```html
<div class="bi-xxx">
  ...
</div>
```

宿主传入方式（每个 prop 作为独立 HTML 属性，kebab-case）：

```html
<bi-xxx title="hello" max-count="5" is-visible></bi-xxx>
```

#### config 模式（需要聚合配置时）

检查业务组件是否已有 `config` prop：

- 如果已有 `config: Object`，**无需修改组件代码**。
- 如果没有，给组件添加：

```vue
<script>
export default {
  props: {
    config: { type: Object, default: () => ({}) }
  }
};
</script>
```

同时给根元素加类名：

```html
<div class="bi-xxx">
  ...
</div>
```

#### 混用模式

组件可同时声明 config 和独立 props，宿主可同时传 config attribute 和独立 prop 属性：

```html
<bi-xxx config='{"host":"demo"}' title="hello" max-count="5"></bi-xxx>
```

### 步骤 2：添加打包配置

#### Vue2 + Vue CLI

安装依赖：

```bash
npm install @vue/web-component-wrapper
```

在项目根目录创建/修改 `vue.config.js`：

```js
const widgetPlugin = require('./wc/widget-wrapper-plugin/vue-cli-plugin');

module.exports = {
  chainWebpack: widgetPlugin({
    name: '<WIDGET_NAME>',
    component: '<COMPONENT_PATH>',
    vueGlobal: 'Vue2' // 如需与 Vue3 物料共存，使用独立全局名
  })
};
```

#### Vue3 + Vite

在项目根目录创建/修改 `vite.config.js`：

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import widgetVitePlugin from './wc/widget-wrapper-plugin/vite-plugin.js';

export default defineConfig({
  plugins: [
    vue(),
    widgetVitePlugin({
      name: '<WIDGET_NAME>',
      component: '<COMPONENT_PATH>',
      vueGlobal: 'Vue3' // 如需与 Vue2 物料共存，使用独立全局名
    })
  ]
});
```

### 步骤 3：生成 schema.json

运行自动生成器：

```bash
node wc/schema-generator/index.js <WIDGET_NAME> <COMPONENT_PATH> dist/<WIDGET_NAME>.schema.json
```

如果已配置打包插件，执行 `npm run build` 时会自动生成。

### 步骤 4：验证打包产物

执行构建：

```bash
npm run build
```

检查 `dist/` 目录下是否有：

- `<WIDGET_NAME>.js`
- `<WIDGET_NAME>.schema.json`
- `<WIDGET_NAME>.css`（如有样式）

### 步骤 5：生成迁移说明文档（可选）

使用 AI 辅助工具生成文档：

```bash
node wc/ai-assistant/cli.js readme <WIDGET_NAME> <COMPONENT_PATH>
```

## 五、基座接入说明

基座侧使用物料加载器加载并渲染，支持 config 和 props 两种传参方式：

```js
import { mountWidget } from './wc/widget-loader';

// 方式 1：props 模式（推荐）—— 每个属性按 kebab-case 拆为独立 attribute
await mountWidget(containerElement, {
  name: '<WIDGET_NAME>',
  js: 'https://cdn.xxx/<WIDGET_NAME>.js',
  css: 'https://cdn.xxx/<WIDGET_NAME>.css',
  props: {
    title: '示例标题',
    maxCount: 5,
    isVisible: true,
    panelData: { x: 1 }
  }
});

// 方式 2：config 模式（向后兼容）—— 整包配置对象序列化为 config attribute
await mountWidget(containerElement, {
  name: '<WIDGET_NAME>',
  js: 'https://cdn.xxx/<WIDGET_NAME>.js',
  css: 'https://cdn.xxx/<WIDGET_NAME>.css',
  config: { title: '示例标题', host: 'demo' }
});

// 方式 3：混用 —— config 提供聚合配置，props 提供独立属性（同名时 props 覆盖）
await mountWidget(containerElement, {
  name: '<WIDGET_NAME>',
  js: 'https://cdn.xxx/<WIDGET_NAME>.js',
  css: 'https://cdn.xxx/<WIDGET_NAME>.css',
  config: { host: 'demo', lang: 'zh' },
  props: { title: '示例标题', maxCount: 5 }
});
```

## 六、关键文件位置

| 文件 | 用途 |
|---|---|
| `wc/widget-wrapper-plugin/vue-cli-plugin.js` | Vue2 自动包装插件 |
| `wc/widget-wrapper-plugin/vite-plugin.js` | Vue3 自动包装插件 |
| `wc/schema-generator/index.js` | schema.json 自动生成 |
| `wc/widget-loader/index.js` | 基座物料加载器 |
| `wc/widget-bus/index.js` | 跨技术栈消息总线 |
| `wc/ai-assistant/cli.js` | AI 辅助 CLI |
| `wc/css-namespace-checker/index.js` | CSS 命名空间检查 |
| `wc/js-risk-scanner/index.js` | JS 风险扫描 |
| `wc/dependency-analyzer/index.js` | 依赖冲突分析 |
| `wc/ai-schema-enricher/index.js` | Schema 语义增强 |
| `wc/migration-skill/index.js` | 自动化迁移 CLI |
| `wc/README.md` | 完整方案文档 |

## 七、常见风险与处理

| 风险 | 处理建议 |
|---|---|
| 组件使用 Vuex/Pinia | 改为从 `config` 读取数据，或组件内部自治 |
| 弹窗挂载到 document.body | 检查是否影响基座样式，必要时调整 z-index/定位 |
| 样式冲突 | 确保根类名为 `bi-xxx`，所有选择器加该前缀 |
| 依赖版本不一致 | 约束 ElementUI/ElementPlus 等大版本一致 |

## 八、输出规范

完成迁移后，向用户输出：

1. 修改了哪些文件。
2. 如何构建和发布。
3. 基座如何加载。
4. 还需要人工检查哪些点（全局状态、样式、弹窗等）。
