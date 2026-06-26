# Agent 工作指南

> 本文件供 AI Agent（如 Trae）在本仓库工作时参考，包含项目概况与代码习惯约定。

---

## 一、项目概况

### 项目定位

**跨技术栈看板物料集成方案**（`wc/`）：基于 Web Components / Custom Elements 的轻量集成方案，将不同部门、不同技术栈（Vue2 / Vue3 / 原生 H5）的物料组件以统一方式接入到同一个 BI 看板基座中。

### 核心架构决策

1. **Custom Elements + light DOM**：所有物料包装为 Custom Element，**禁止 Shadow DOM**（会隔离 ElementUI/ElementPlus 全局样式）。包装层手写 `HTMLElement`，不用 Vue3 的 `defineCustomElement()`。
2. **UMD + external**：物料构建为 UMD 格式，Vue / ElementUI / ElementPlus / `wc-i18n` / `wc-widget-scope` 设为 external，由基座统一提供，避免重复打包。
3. **扁平化 props 协议**：基座通过独立 kebab-case HTML attribute 传入每个 prop（`<bi-xxx title="..." max-count="5" is-visible>`），包装层按声明类型解析后注入业务组件。`renderWidget(container, { name, props })` 仅写 props kebab attribute，**不写 config attribute**。序列化规则：true→空串、false→"false"、null/undefined→移除、string→原样、number/object/array→JSON.stringify。错误码 `WidgetError.PROPS_ERROR`，i18n key `loader.props_serialize_failed`。Vue2/Vue3 wrapper 的 `observedAttributes` 仅含 kebab props（不含 config/scope）；Vue2 用 `data.widgetProps`、Vue3 用 `_propsRef`。H5 wrapper 用 `render(props, scope)` / `getProps()` / `onPropsChange(element, newProps, oldProps, scope)`，物料需声明 `props: ['title','items']` 数组。
4. **软隔离（widgetScope）**：每个物料实例创建独立的 `widgetScope` 对象（context/bus/log/t/request/loader），物料通过 props/回调接收，而非直接访问 `window`。不用 Shadow DOM / iframe，通过受控 API 表面限制对全局环境的直接依赖。
5. **构建时静态分析**：`css-namespace-checker`、`scoped-style-checker`、`js-risk-scanner` 集成到构建插件的 `closeBundle`/`done` 钩子，高危项可拦截发布。

### 目录结构

```
wc/
├── vue2-widget-template/         # Vue2 物料模板（widget-wrapper.js + vue.config.js）
├── vue3-widget-template/         # Vue3 物料模板（widget-wrapper.js + vite.config.js）
├── h5-widget-template/           # 原生 H5 物料模板（widget-wrapper.js，无框架依赖）
├── widget-wrapper-plugin/        # 自动包装构建插件
│   ├── vue-cli-plugin.js         #   Vue2（webpack）插件
│   ├── vite-plugin.js            #   Vue3（Vite）插件
│   ├── h5-vite-plugin.js         #   H5（Vite）插件
│   └── postcss-namespace.js      #   PostCSS 自动命名空间前缀
├── widget-loader/                # 基座物料加载器（加载/挂载/错误隔离/版本契约）
├── widget-scope/                 # 软隔离 scope（context/bus/log/t/request/loader）
├── widget-context/               # 全局上下文（setContext/getContext/injectContext）
├── widget-bus/                   # 跨技术栈消息总线
├── widget-registry/              # 远程注册表（拉取+缓存+降级）
├── widget-declarative-plugin/    # 声明式语法（$widget 宏 / JSX <Widget>）
│   ├── babel-plugin.js           #   Babel AST 转换
│   ├── vite-plugin.js            #   Vite 包装器（支持 registryUrl 远程拉取）
│   └── runtime.js                #   运行时 helper
├── i18n/                         # 跨技术栈轻量国际化（locales/zh.js + en.js）
├── schema-generator/             # schema.json 自动生成
├── css-namespace-checker/        # CSS 命名空间检查（支持 .vue/.css/.scss）
├── scoped-style-checker/         # Vue scoped CSS 检查
├── js-risk-scanner/              # JS 危险 API 静态扫描
├── ai-assistant/                 # AI 辅助 CLI + 提示词
├── ai-schema-enricher/           # schema 智能补全
├── dependency-analyzer/          # 依赖分析
└── migration-skill/              # 迁移技能示例

demo/
├── vue2-host/                    # Vue2 基座示例（element-ui）
├── vue3-host/                    # Vue3 基座示例（element-plus）
├── vue2-widget-lib/              # Vue2 物料库示例
├── vue3-widget-lib/              # Vue3 物料库示例
└── h5-widget-lib/                # H5 物料库示例（h5-vite-plugin）

docs/                             # 架构文档与迁移策略
```

### 关键运行时全局变量

| 全局变量 | 提供者 | 用途 |
|---------|--------|------|
| `window.Vue2` | vue2-host 基座 | Vue2 物料运行时 |
| `window.Vue3` | vue3-host 基座 | Vue3 物料运行时 |
| `window.ELEMENT` | vue2-host（element-ui.js） | ElementUI 组件库 |
| `window.ElementPlus` | vue3-host（element-plus.js） | ElementPlus 组件库 |
| `window.__wcI18n__` | 基座 | i18n 运行时（物料共享 locale） |
| `window.__wcWidgetScope__` | 基座 | widgetScope 工厂（createWidgetScope） |

### Git 分支

- `dev-wc`：物料集成方案开发分支

---

## 二、代码习惯约定

### 通用规则

1. **语言**：注释与文档用中文，技术术语（PostCSS、AST、Vite、Babel 等）保留英文。代码标识符用英文。
2. **不使用 emoji**：代码、注释、文档中均不使用 emoji，除非用户明确要求。
3. **注释风格**：
   - 解释"为什么"而非"是什么"——代码本身能表达的逻辑不写注释，写设计决策、约束、坑点。
   - 用 `// ─── 标题 ───` 分隔符划分代码区块，提升可读性。
   - 函数用 JSDoc（`@param` / `@returns` / `@throws`），标注类型与含义。
4. **防御性编码**：
   - 系统边界（用户输入、外部 API、跨模块调用）做校验与 try/catch。
   - 内部代码信任框架保证，不过度校验。
   - 失败不阻断主流程时用 try/catch + `console.warn` 降级。
5. **不过度工程化**：
   - 只做被要求的事，不主动加功能、重构、补 docstring。
   - 一次性操作不抽 helper，三行相似代码好过过早抽象。
   - 不为假想的未来需求设计。

### 模块实现习惯

1. **ESM 优先**：`wc/` 下模块用 ESM（`import`/`export`）。需要引用 CJS 模块时用 `createRequire`：
   ```js
   import { createRequire } from 'module';
   const require = createRequire(import.meta.url);
   ```
2. **懒加载依赖**：运行时模块按需 `import()`，减小首屏体积（如 widget-scope 懒加载 context/bus/i18n/loader）。
3. **冻结隔离对象**：`widgetScope` 用 `Object.freeze()` 冻结，防止物料篡改。
4. **向后兼容**：重命名/重构时保留别名（如 `findVueFiles` → `findStyleFiles` 时保留旧名）。
5. **多 Host 状态隔离**：加载器等用 class 实例化，每个 Host 独立状态，模块级单例委托到实例。

### 构建插件习惯

1. **钩子集成**：静态检查器集成到 `closeBundle`（Vite）/ `done`（webpack）钩子，默认 `warn`，支持 `error`（拦截构建）/ `off`。
2. **临时入口**：包装插件生成临时 wrapper 文件到 `os.tmpdir()`，构建后清理。
3. **externals 配置**：Vue / ElementUI / `wc-i18n` / `wc-widget-scope` 设为 external + globals 映射。
4. **PostCSS 命名空间**：`postcss-namespace.js` 构建期自动为 CSS 选择器加 `.bi-xxx` 前缀。

### 测试习惯

1. **语法检查**：改完 `.js` 用 `node --check` 验证语法；ESM 用 `node --input-type=module -e "import(...)"`。
2. **内联测试**：用 `node -e` / `node --input-type=module -e` 写内联断言测试，不创建临时测试文件（除非必要）。
3. **测试后清理**：临时文件用完即删（`fs.unlinkSync` / `fs.rmSync`）。

### Git 提交习惯

1. **提交信息**：中文，`type(scope): 概述` 格式，正文列出要点。
2. **不主动提交**：只在用户明确要求时 commit。不主动 push。
3. **不提交敏感文件**：`.env`、`credentials` 等不加入暂存区。
4. **仓库身份**：若 git 未配置 user，用仓库级配置（不修改全局）：`git config user.email` / `git config user.name`。

---

## 三、常用操作速查

### 构建物料

```bash
# Vue3 物料
cd demo/vue3-widget-lib
WIDGET_NAME=bi-finance-panel npm run build

# H5 物料
cd demo/h5-widget-lib
npm run build:clock
```

### 静态检查（独立 CLI）

```bash
# CSS 命名空间检查
node wc/css-namespace-checker/index.js <file-or-dir> [widget-name]

# scoped CSS 检查
node wc/scoped-style-checker/index.js <dir> [--policy=error|auto-add|warn]

# JS 危险 API 扫描
node wc/js-risk-scanner/index.js <file-or-dir>
```

### 基座加载物料

```js
widgetLoader.mountWidget(container, {
  name: 'bi-finance-panel',
  js: 'https://cdn.example.com/widgets/bi-finance-panel.js',
  css: 'https://cdn.example.com/widgets/bi-finance-panel.css',
  vueVersion: '3',           // '2' | '3' | 'none'
  props: { title: '财务看板' }
});
```
