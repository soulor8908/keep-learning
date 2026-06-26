# 本架构与主流 Web Components 微前端方案对比

> 本文档从实现方式、改造成本、隔离性、性能、生态等维度，把当前方案与几种主流路线做对比，并针对劣势给出自动化 / AI 优化思路。

---

## 一、对比对象

| 方案 | 核心机制 | 典型代表 |
|------|----------|----------|
| **本方案（原生 Custom Elements）** | 把 Vue2/Vue3 组件打包成 UMD Custom Element，基座按需加载 JS/CSS | `wc/` 目录下的实现 |
| **Web Components 原生组件库** | 用 Lit / Stencil 写标准 Web Component，跨框架使用 | Lit, Stencil, OpenWC |
| **Web Component 容器型微前端** | 用自定义标签 `<micro-app>` / `<wujie-app>` 包裹子应用，内部用 iframe / proxy 做隔离 | micro-app, 无界 (wujie) |
| **JS 沙箱型微前端** | 基于 single-spa 做应用生命周期管理，配合 JS 沙箱和样式隔离 | qiankun, single-spa |
| **模块联邦** | 运行时共享模块，构建时声明依赖关系 | Webpack Module Federation, Native Federation |

---

## 二、本方案的优势

### 2.1 改造成本极低

- **业务组件零改造**：物料仓库只需改打包配置，组件代码保持原样。
- **不引入新框架**：不需要学习 qiankun / single-spa / micro-app 的 API 和生命周期。
- **基座改造轻**：只需要一个加载器 + 注册表即可接入。

对比：

| 方案 | 物料侧改造 | 基座侧改造 | 学习成本 |
|------|-----------|-----------|---------|
| 本方案 | 改构建配置 | 加载器 + 注册表 | 低 |
| qiankun | 导出生命周期函数 | 注册应用、路由协调 | 中 |
| micro-app | 通常无需改造 | 引入 SDK、配置路由 | 中 |
| Module Federation | 改构建配置、声明 shared | 改构建配置 | 中高 |

### 2.2 无框架锁定，完全基于浏览器标准

Custom Elements、Shadow DOM、CustomEvent 都是浏览器原生标准。即使未来不用 Vue，改用 React / Svelte / 原生，接口不变。

### 2.3 按需加载，无运行时框架开销

没有微前端框架的运行时代码，基座只加载用到的物料 JS/CSS。首屏不会被打包所有子应用。

### 2.4 部门自治度高

每个部门独立仓库、独立构建、独立发布 CI/CD。新增部门物料只需往基座注册表里加一条记录。

### 2.5 配置协议自动生成

通过 `schema-generator` 扫描组件 props，自动生成 `schema.json`，基座可据此渲染配置表单。

---

## 三、本方案的劣势

### 3.1 样式隔离弱

**问题**：没有开启 Shadow DOM，所有物料样式都在全局作用域。如果两个物料都写了 `.title`，会互相覆盖。

**为什么不开 Shadow DOM**：因为内部 UI 框架（如 ElementUI/ElementPlus）的全局样式、主题变量、字体图标等会被隔离掉，导致物料内部样式异常。

### 3.2 JS 隔离弱

**问题**：所有物料共享同一个 `window` 和 `document`。如果物料里用了：

- `Vue.component()` 全局注册组件
- `document.body.appendChild(dialog)`
- 全局事件总线、Vuex/Pinia 全局 store
- 污染 `window` 上的变量

都会造成互相干扰。

### 3.3 Vue 多版本共存需要手动管理

基座如果要同时加载 Vue2 和 Vue3 物料，需要同时加载两个 Vue 运行时，并分别暴露为 `window.Vue2` / `window.Vue3`。版本升级、依赖对齐需要人工维护。

### 3.4 Custom Element 属性只能是字符串

Custom Element 的 attribute 必须是字符串，复杂对象需要 `JSON.stringify` / `JSON.parse`。虽然包装层已经自动处理，但这限制了：

- 大配置对象的序列化性能
- 函数、Symbol、循环引用等无法传递
- 属性变化监听粒度较粗

### 3.5 没有子应用级生命周期管理

每个物料是独立 Custom Element，基座无法像 qiankun 那样统一：

- 按路由激活 / 卸载子应用
- 统一处理加载、挂载、错误、卸载钩子
- 全局 loading / 错误边界

### 3.6 公共依赖去重能力有限

目前只是把 `vue` / `ElementUI` 设为 external，由基座提供。但如果两个物料依赖了不同版本的 ElementUI，或者依赖了相同的第三方库但版本不同，基座无法自动去重，容易冲突。

### 3.7 调试和排障更分散

每个物料是独立构建产物，Source Map 可能缺失或指向不同仓库。线上出问题需要定位到具体物料版本，排查链路长。

### 3.8 配置 schema 语义缺失

`schema-generator` 只能拿到类型、默认值、是否必填。中文标题、业务描述、枚举值、联动规则等需要人工或 AI 补充。

### 3.9 无障碍、SEO 支持弱

Custom Element 标签对搜索引擎不够友好；多个独立 Vue 实例也不利于无障碍工具统一遍历。

---

## 四、劣势的自动化 / AI 优化方案

### 4.1 样式冲突 → CSS 命名空间检查 + AI 自动加前缀

**自动化工具**：

- 在 `widget-wrapper-plugin` 里集成 `postcss` 扫描，检查所有选择器是否以 `bi-xxx` 根类名开头。
- 发现未加命名空间的选择器时，构建报错或警告。

```js
// 伪代码
function checkCssNamespace(css, widgetName) {
  const rootClass = `.${widgetName}`;
  // 要求每个选择器都包含根类名或以 :host 开头
}
```

**AI 优化**：

- 用 AI 扫描 `.vue` 文件中的 `<style>`，自动给未加前缀的选择器补上前缀。
- 示例：`wc-migration` skill 增加 `fix-css-namespace` 指令。

### 4.2 JS 隔离弱 → 静态扫描 + 沙箱包装

**自动化工具**：

- 用 ESLint / AST 扫描物料源码，检测危险 API：
  - `document.body.appendChild`
  - `window.xxx = `
  - `Vue.component(`
  - `new Vuex.Store`
  - `document.querySelector` 选择全局元素
- 构建时输出风险报告。

**AI 优化**：

- AI 把危险用法改成组件自治方式：
  - 全局弹窗改为 `position: fixed` 的内部节点
  - 全局事件总线改为 `widget-bus`
  - 全局 store 改为组件内部 data / 接收 props

**必要时引入轻量沙箱**：

- 对高风险物料，可以用 `with (proxyWindow)` 或 `iframe` 做 JS 沙箱，再透过 `postMessage` 或 `widget-bus` 通信。但这会增加复杂度，建议只对必要物料使用。

### 4.3 Vue 多版本共存 → 版本扫描脚本 + 基座自动注入

**自动化工具**：

- CI 阶段扫描所有物料的 `package.json`，生成 `vue-version-manifest.json`：

```json
{
  "bi-sales-panel": { "vue": "2.6.14" },
  "bi-finance-panel": { "vue": "3.4.21" }
}
```

- 基座启动前，根据 manifest 自动从 CDN 加载缺失的 Vue 版本，并正确赋值到 `window.Vue2` / `window.Vue3`。

**AI 优化**：

- AI 检测物料 Vue 版本，推荐合适的 `vueGlobal` 配置。
- 当发现多个物料使用同一 Vue 大版本但小版本不一致时，提示统一升级。

### 4.4 属性字符串化 → 自动桥接 + schema 约束

**自动化工具**：

- 包装层已经按 prop 声明类型自动把 attribute 字符串解析为对应值（Boolean/Number/Object/Array/String）。
- 进一步可以用 `MutationObserver` 监听 attribute 变化，触发组件细粒度更新。

**AI 优化**：

- AI 根据组件实际使用的 props，设计合理的 props 结构。
- 自动生成 props 的校验规则，防止基座传入不兼容的数据。

### 4.5 缺乏生命周期管理 → 增强 loader + 钩子生成

**自动化工具**：

- 扩展 `widget-loader`，支持统一的 `onLoading`、`onLoaded`、`onError`、`onUnmount` 钩子。
- 给每个物料包装层注入标准生命周期，基座可统一监听。

```js
class WidgetElement extends HTMLElement {
  connectedCallback() {
    this.dispatchEvent(new CustomEvent('widget:mount'));
  }
  disconnectedCallback() {
    this.dispatchEvent(new CustomEvent('widget:unmount'));
  }
}
```

**AI 优化**：

- AI 为旧组件自动生成 `widget:mount` / `widget:unmount` 事件触发逻辑。
- 自动生成基座错误边界组件和 loading 占位。

### 4.6 公共依赖去重有限 → 依赖图谱分析

**自动化工具**：

- 构建时提取每个物料的依赖树，生成依赖冲突报告。
- 对高频公共依赖，推荐设为 external 并由基座统一提供。

```bash
node wc/dependency-analyzer/index.js
# 输出：bi-sales-panel 和 bi-finance-panel 都依赖 lodash@4.17.21，建议基座统一提供
```

**AI 优化**：

- AI 读取冲突报告，给出 externals 调整建议。
- 辅助把组件内部 import 改写成外部依赖接收方式。

### 4.7 调试排障分散 → Source Map 聚合 + 版本注册表

**自动化工具**：

- 发布物料时同时上传 Source Map 到统一存储。
- 基座注册表增加 `sourcemap` 字段，报错时自动加载对应 Source Map。

**AI 优化**：

- AI 根据错误堆栈和注册表信息，自动定位到具体物料仓库和版本。
- 生成错误报告模板，方便提交给对应部门。

### 4.8 Schema 语义缺失 → AI 语义补充

**自动化工具**：

- 在 `schema-generator` 基础上，接入 AI 补全 `title`、`description`、`enum`、`layout`。

```bash
node wc/ai-assistant/cli.js schema bi-sales-panel ./src/components/SalesPanel.vue
```

**AI 优化**：

- 根据组件名、props 名、默认值推断中文标题和业务含义。
- 对 `period` 这类枚举字段，自动补全 `day/week/month/year` 的可选项。

### 4.9 无障碍 / SEO 弱 → 静态 HTML 兜底 + AI 生成描述

**自动化工具**：

- 构建时在 Custom Element 内部生成静态 `<slot>` 占位内容，或无 JS 时的降级 HTML。

**AI 优化**：

- AI 根据组件功能生成 `aria-label`、role、降级文案。
- 为每个物料生成语义化的 JSON-LD 结构数据，提升 SEO。

---

## 五、各方案适用场景总结

| 场景 | 推荐方案 |
|------|---------|
| 多部门、多 Vue 版本、只需板块级集成 | **本方案** |
| 需要强样式 / JS 隔离，且能接受改造成本 | wujie / micro-app |
| 需要路由级子应用完整生命周期管理 | qiankun / single-spa |
| 需要跨仓库共享组件代码，构建时优化 | Module Federation |
| 从零构建跨框架组件库 | Lit / Stencil |

---

## 六、结论

本方案的优势是**轻量、低改造成本、高部门自治度**，劣势是**隔离性弱、依赖管理需要人工介入、schema 语义不足**。

大部分劣势可以通过自动化脚本和 AI 辅助来缓解：

- **CSS / JS 风险**：用静态扫描 + AI 自动修复
- **Vue 版本管理**：用依赖分析 + 基座自动注入
- **生命周期 / 错误边界**：用增强 loader + 钩子生成
- **Schema 语义**：用 AI 自动补充
- **调试排障**：用 Source Map 聚合 + AI 定位

下一步可以优先落地的工具：

1. `wc/css-namespace-checker`：CSS 命名空间构建检查
2. `wc/js-risk-scanner`：JS 危险 API 扫描
3. `wc/dependency-analyzer`：公共依赖冲突分析
4. `wc/ai-schema-enricher`：AI 补充 schema 语义
5. `wc/migration-skill`：把旧 Vue 组件一键迁移为物料组件
