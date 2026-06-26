# 跨技术栈看板物料集成方案 需求规格说明书

> 本文档基于实际代码实现与既有文档逆向梳理，作为系统的需求规格基线（Requirements Baseline）。

---

## 目录

1. [引言](#1-引言)
2. [项目背景与目标](#2-项目背景与目标)
3. [术语与全局约定](#3-术语与全局约定)
4. [系统范围](#4-系统范围)
5. [用户角色与使用场景](#5-用户角色与使用场景)
6. [功能需求](#6-功能需求)
7. [非功能需求](#7-非功能需求)
8. [约束条件](#8-约束条件)
9. [验收标准](#9-验收标准)
10. [附录：需求追溯矩阵](#10-附录需求追溯矩阵)

---

## 1. 引言

### 1.1 文档目的

本文档定义「跨技术栈看板物料集成方案」（以下简称 wc 物料方案）的功能与非功能需求，作为开发、评审、验收与后续演进的依据。文档基于 `/workspace` 仓库的实际代码实现逆向输出，并与以下既有文档保持一致：

- `README.md` —— 项目总览与快速开始
- `wc/README.md` —— 方案使用手册
- `docs/architecture.md` —— 技术架构说明
- `docs/architecture-diagrams.md` —— 架构图集
- `agent.md` —— Agent 工作指南与核心架构决策
- `PERFORMANCE.md` —— 性能优化指南
- `TROUBLESHOOTING.md` —— 故障排查指南

### 1.2 文档约定

- 主体语言为中文，技术术语（Custom Elements、UMD、PostCSS、AST、Vite 等）保留英文。
- 代码标识符（函数名、变量名、文件路径、错误码、i18n key）一律英文原样。
- 需求条目采用 EARS（Easy Approach to Requirements Syntax）变体：

  ```
  ### Requirement: <名词短语>
  The system SHALL <行为描述>...

  #### Scenario: <场景名>
  - **WHEN** <前置条件>
  - **THEN** <预期结果>
  - **AND THEN** <后续断言>（可选）
  ```

- 需求编号约定：`FR-<模块缩写>-<序号>`（功能需求）、`NFR-<类别>-<序号>`（非功能需求）。

---

## 2. 项目背景与目标

### 2.1 业务背景

在大型 2C 应用中，随着业务规模增长，单体应用按业务模块拆分为多个子项目，由不同团队独立维护，再通过微前端整合为完整应用。然而真实业务场景中，不少页面天然包含多个业务域的需求——同一页面上可能同时存在 A 业务订单区、B 业务支付区、C 业务推荐区。这些「交叉页面」的归属权成为团队协作的核心痛点。

### 2.2 现有方案的问题

| 方案 | 痛点 |
| ------ | ------ |
| 强制统一技术栈 | 改造成本高、周期长，历史资产难以复用 |
| 微前端框架（qiankun / micro-app） | 太重，引入运行时框架开销，需完整应用级隔离 |
| 模块联邦 | 跨仓库构建时耦合，运行时版本治理复杂 |

### 2.3 项目目标

本方案借鉴 **BI 看板模式**：每个项目组维护好自己的物料（Widget），基座负责整合渲染。核心目标：

1. **不强制统一技术栈**：各部门继续用 Vue2 / Vue3 / 原生 H5 开发业务组件。
2. **最小化改造成本**：业务组件零改造，只改打包配置即可接入。
3. **按需加载**：看板用到哪个物料才加载对应 JS / CSS，不影响首屏性能。
4. **公共依赖复用**：Vue、ElementUI / ElementPlus 等公共库由基座统一提供，物料包只打包业务代码。
5. **UI 一致**：基座统一提供 UI 组件库与主题，物料复用基座组件。
6. **支持嵌套**：物料可组合嵌套，一个物料内部可引用另一个物料。

### 2.4 设计原则

| 原则 | 说明 |
| ------ | ------ |
| 业务解耦 | 交叉页面各业务区域独立开发、独立部署，不再纠结归属权 |
| 技术包容 | 不强制统一技术栈，运行时通过 `window.Vue2` / `window.Vue3` 多版本共存 |
| 最小改造 | 包装层采用扁平化 props 协议，保留组件原有 `props` 不变即可接入 |
| light DOM | 禁用 Shadow DOM，保证基座 UI 组件库全局样式穿透 |
| 软隔离 | 通过受控 API 表面（widgetScope）限制物料对 window 的直接依赖，不用 Shadow DOM / iframe 硬隔离 |

---

## 3. 术语与全局约定

### 3.1 核心术语

| 术语 | 说明 |
| ------ | ------ |
| Host（基座） | 看板本身，负责维护物料注册表、提供公共依赖、渲染看板布局 |
| Widget（物料） | 被包装成 Custom Element 的业务组件，如 `<bi-sales-panel>` |
| widget-loader | 基座里的物料加载器，按需加载物料 JS/CSS、校验版本、捕获错误并降级 |
| widget-wrapper-plugin | 自动包装插件，把 Vue2/Vue3/H5 组件打包成 UMD Custom Element，并生成 `schema.json` |
| widget-bus | 基于 CustomEvent 的全局消息总线，支持 Vue2/Vue3/原生 JS 互相通信 |
| widget-scope | 物料软隔离运行时，通过受控 API 表面限制物料对 window 的直接访问 |
| widget-context | 全局上下文注入机制，物料可只读订阅基座上下文 |
| 扁平化 props 协议 | 宿主通过独立 kebab-case HTML attribute 把每个 prop 传入，包装层按声明类型自动解析注入 |

### 3.2 全局变量约定

基座在 `window` 上挂载一组全局变量供物料 external 引用：

| 全局变量 | 含义 | 注入位置 |
| ------ | ------ | ------ |
| `window.Vue2` | Vue 2 运行时 | `demo/vue2-host/src/main.js` / `demo/vue3-host/index.html` |
| `window.Vue3` | Vue 3 运行时 | `demo/vue3-host/src/main.js` |
| `window.ELEMENT` | ElementUI（Vue2） | `demo/vue2-host/src/element-ui.js` |
| `window.ElementPlus` | ElementPlus（Vue3） | `demo/vue3-host/src/element-plus.js` |
| `window.__wcI18n__` | 跨技术栈国际化运行时 | `wc/i18n/index.js`（幂等单例） |
| `window.__wcWidgetScope__` | scope 运行时工厂 | `wc/widget-scope/index.js`（幂等单例） |
| `window.__wcContext__` | 上下文存储 | `wc/widget-context/index.js` |
| `window.widgetBus` | 跨物料消息总线 | `wc/widget-bus/index.js` |
| `window.__UI_ELEMENT_UI__` | element-ui 按需组件 IIFE 注册表 | `widget-loader` 按需加载时挂载 |
| `window.__UI_ELEMENT_PLUS__` | element-plus 按需组件 IIFE 注册表 | `widget-loader` 按需加载时挂载 |

### 3.3 版本契约（SUPPORTED_DEPS）

基座承诺提供的运行时版本与兼容范围，定义在 `wc/widget-loader/index.js`：

| 依赖 | 基座版本 | 兼容范围 | 全局变量 |
| ------ | ------ | ------ | ------ |
| vue2 | 2.6.14 | `^2.6.0` | `Vue2` |
| vue3 | 3.4.21 | `^3.0.0` | `Vue3` |
| lodash | 4.17.21 | `^4.17.0` | `_` |
| axios | 1.7.7 | `^1.0.0` | `axios` |
| element-ui | 2.15.14 | `^2.15.0` | `ELEMENT` |
| element-plus | 2.7.0 | `^2.7.0` | `ElementPlus` |

### 3.4 关键超时常量

| 常量 | 值 | 说明 |
| ------ | ------ | ------ |
| `DEFAULT_LOAD_TIMEOUT` | 15000ms | `loadScript` / `loadStyle` 默认超时 |
| `waitForCustomElement` 默认超时 | 5000ms | 等待物料 `customElements.define` 完成 |
| registry fetch 超时 | 8000ms（demo）/ 10000ms（默认） | 注册表远程拉取超时 |

---

## 4. 系统范围

### 4.1 In Scope

- 跨技术栈（Vue2 / Vue3 / 原生 H5）业务组件到 Custom Element 物料的自动包装。
- 基座侧物料按需加载、版本契约校验、错误边界与降级、生命周期管理。
- 跨技术栈物料间通信（widget-bus）与全局上下文注入（widget-context）。
- 物料软隔离运行时（widget-scope），支持嵌套加载与循环检测。
- 注册表驱动的 UI 组件库（ElementUI / ElementPlus）按需加载。
- `schema.json` 配置协议自动生成（含 UI 依赖扫描）。
- 迁移与质量工具链（migration-skill / ai-assistant / 4 个 checker）。
- 声明式物料使用（`$widget` 宏 / JSX `<Widget>` 标签）。
- 页面编排层（widget-page）支持多页面状态机与物料归属权跟踪。
- DevTools 浏览器扩展（物料列表 / 事件流 / 性能时间线）。

### 4.2 Non-Goals

- 不提供完整应用级隔离（不做 Shadow DOM / iframe 硬隔离）。
- 不提供子应用级路由生命周期管理（区别于 qiankun / single-spa）。
- 不强制业务组件改造（迁移工具仅做浅改造，深层重构留给 AI 或人工）。
- 不替换 vue-i18n（基座 Vue UI 层仍用 vue-i18n，物料业务文案用 `wc/i18n`）。
- 不内置监控平台上报（仅暴露生命周期钩子，接入 Sentry 等留给后续）。
- 不提供拖拽 / 布局编辑器（仅提供配置协议，布局由基座业务实现）。
- 不支持 React / Angular 物料（当前仅 Vue2 / Vue3 / 原生 H5）。

---

## 5. 用户角色与使用场景

### 5.1 角色

| 角色 | 职责 |
| ------ | ------ |
| 物料开发者 | 在 Vue2 / Vue3 / H5 仓库中开发业务组件，引入包装插件打包为 UMD 物料 |
| 基座开发者 | 维护看板基座，集成 widget-loader / widget-bus / i18n，设计注册表 |
| 看板运营者 | 在基座注册表中登记物料 CDN 地址，配置页面布局 |
| 终端用户 | 浏览看板页面，与物料交互 |

### 5.2 核心使用场景

#### 场景 1：新增部门物料

物料开发者完成业务组件开发 → 引入 `widget-wrapper-plugin` 修改打包配置 → `npm run build` 输出 UMD + schema.json → 上传 CDN → 在基座注册表加一条记录。基座无需修改代码。

#### 场景 2：交叉页面多业务域共存

一个页面同时渲染 A 团队 Vue2 订单物料、B 团队 Vue3 支付物料、C 团队 H5 推荐物料。基座按注册表分别按需加载，三技术栈物料同页共存，互不干扰。

#### 场景 3：物料运行时崩溃不影响整体

某物料在 `setTimeout` 内抛错 → 全局错误监听器归因到该物料 → 移除崩溃元素、渲染降级占位（含「点击重试」）→ 旁边其他物料继续正常渲染 → 用户点击重试，仅重新加载该物料。

#### 场景 4：Vue3 物料在 Vue2 基座被拒绝

Vue3 物料 `bi-finance-panel` 在仅提供 `window.Vue2` 的基座上被加载 → `checkDependencies` 校验失败 → 抛 `DEP_VERSION_MISMATCH` 错误 → 渲染降级占位（不提供重试按钮，因为版本不兼容是确定性错误）。

#### 场景 5：语言切换全链路同步

基座点击语言按钮 → 同时更新 vue-i18n.locale 与 `wc/i18n.setLocale()` → `setLocale` 通知所有 `onLocaleChange` 订阅者 + 通过 widget-bus 广播 `locale-change` → 物料监听后重渲染。基座 UI、物料业务文案、loader 错误提示同步切换。

---

## 6. 功能需求

### 6.1 物料自动包装（widget-wrapper-plugin）

#### Requirement: FR-WP-1 三技术栈自动包装
The system SHALL provide build plugins that automatically wrap Vue2 / Vue3 / H5 business components into UMD Custom Elements without requiring business code changes.

#### Scenario: Vue2 + Vue CLI 打包
- **WHEN** 物料仓库在 `vue.config.js` 中配置 `widgetPlugin({ name, component, vueGlobal })` 并执行 `npm run build`
- **THEN** 输出 `bi-xxx.js`（UMD）与 `bi-xxx.schema.json`
- **AND THEN** 产物中 Vue / element-ui / wc-i18n / wc-widget-scope / lodash / axios 均被 external，运行时使用基座全局变量

#### Scenario: Vue3 + Vite 打包
- **WHEN** 物料仓库在 `vite.config.js` 中配置 `widgetVitePlugin({ name, component })` 并执行 `npm run build`
- **THEN** 输出 `bi-xxx.js`（UMD，开启 sourcemap）与 `bi-xxx.schema.json`
- **AND THEN** 产物使用 `createApp().mount(this)` 挂载到 light DOM，不使用 `defineCustomElement()`（避免 Shadow DOM）

#### Scenario: H5 + Vite 打包
- **WHEN** H5 物料仓库配置 `h5WidgetVitePlugin({ name, component })` 并执行 `npm run build`
- **THEN** 输出无框架依赖的 UMD Custom Element
- **AND THEN** 当 `wc-widget-scope` 不可用时，回退到内建最小 scope（`createMinimalScope`）

#### Requirement: FR-WP-2 light DOM 强制（禁用 Shadow DOM）
The system SHALL mount all widgets to light DOM and SHALL reject Shadow DOM usage to ensure host global UI library styles (ElementUI / ElementPlus) penetrate into widgets.

#### Scenario: 误用 Shadow DOM 检测
- **WHEN** 包装层 `connectedCallback` 检测到 `this.shadowRoot` 非空
- **THEN** 立即在控制台 `console.error` 报错，提示禁用 Shadow DOM
- **AND THEN** Vue3 包装层不得使用官方 `defineCustomElement()`（其默认 `attachShadow()`）

#### Requirement: FR-WP-3 构建期静态检查
The system SHALL run static checks during build (`closeBundle` / `done` hook) covering scoped CSS, CSS namespace, and JS risky API.

#### Scenario: scoped CSS 检测
- **WHEN** 业务组件 `<style>` 缺少 `scoped` 属性且 `enforceScoped` policy 为 `error`（默认）
- **THEN** 构建失败，错误写入 `stats.compilation.errors`（Vue CLI）或抛错（Vite）
- **AND THEN** policy 为 `auto-add` 时自动补 `scoped` 回写文件；`warn` 时仅告警；`off` 时跳过

#### Scenario: CSS 命名空间检查
- **WHEN** CSS 选择器不以物料命名空间类（`.bi-xxx`）开头且非全局白名单选择器
- **AND THEN** policy 为 `warn`（默认）时告警；`error` 时构建失败

#### Scenario: JS 危险 API 扫描
- **WHEN** 业务代码扫描到 `document.body` 挂载、`window` 全局赋值、`Vue.component` / `Vue.use` / `Vue.prototype`、Vuex / Pinia、mitt / EventBus 等高危 API
- **THEN** `failOnHighRisk` 为 true 时构建失败；否则告警（🔴高危 / 🟡中危）

#### Requirement: FR-WP-4 PostCSS 命名空间自动前缀
The system SHALL automatically prefix all CSS selectors in widget output with the widget namespace class (`.bi-xxx`) via PostCSS, except global whitelist selectors.

#### Scenario: 后代选择器加前缀
- **WHEN** 物料 CSS 含 `.title` 选择器
- **THEN** 输出为 `.bi-sales-panel .title`
- **AND THEN** 已含命名空间前缀的选择器不重复添加

#### Scenario: 全局选择器白名单
- **WHEN** 选择器为 `:host` / `:root` / `html` / `body` / `*` / `::before` / `::after` / `::v-deep` / `/deep/` / `>>>` / `:deep(` / `@media` / `@keyframes` / `@font-face` 等
- **THEN** 原样保留不加前缀

### 6.2 物料加载器（widget-loader）

#### Requirement: FR-WL-1 按需加载与去重缓存
The system SHALL load widget JS / CSS on demand and SHALL deduplicate by URL to avoid repeated loading of the same resource.

#### Scenario: URL 级去重
- **WHEN** 同一 URL 的 JS/CSS 被多次请求加载
- **THEN** 仅创建一次 `<script>` / `<link>` 标签，复用同一个加载 Promise
- **AND THEN** 真实加载结果（非超时结果）缓存到 `loadedResources` Map，超时后真实加载成功仍可复用

#### Scenario: 超时与重试
- **WHEN** JS / CSS 加载超过 15000ms
- **THEN** reject 给调用方，但不移除节点、不删除缓存（避免重复创建标签加剧拥塞）
- **AND THEN** 仅 `SCRIPT_ERROR` / `CSS_ERROR` 重试，默认 3 次 + 指数退避（1s→2s→4s）；`LOAD_TIMEOUT` 不重试

#### Requirement: FR-WL-2 版本契约校验
The system SHALL validate host-provided runtime versions against the widget's declared `vueVersion` before loading, and SHALL reject incompatible widgets with a structured error.

#### Scenario: Vue3 物料在 Vue2 基座被拒绝
- **WHEN** 物料声明 `vueVersion: '3'` 但基座未提供 `window.Vue3`
- **THEN** 抛出 `code === 'DEP_VERSION_MISMATCH'` 的结构化错误
- **AND THEN** 渲染降级占位，不提供重试按钮（版本不兼容为确定性错误）
- **AND THEN** 错误信息经 `wc/i18n` 翻译

#### Scenario: 版本范围校验
- **WHEN** 物料依赖 vue2 `^2.6.0`，基座 `window.Vue2.version` 为 `2.7.0`
- **THEN** 校验通过，正常加载
- **AND THEN** 轻量 semver 支持 `^` / `~` / `>=` / `>` / `<=` / `<` / `=` / 精确版本 / `*` / `||` 或范围 / 空格 AND 复合范围；`^` 对 0.x 收紧到同 minor，0.0.x 收紧到同 patch

#### Requirement: FR-WL-3 错误边界与降级
The system SHALL isolate single-widget failures from crashing the whole dashboard via global error listeners, attribute errors to widgets, and render fallback placeholders.

#### Scenario: 挂载同步抛错
- **WHEN** 物料 `connectedCallback` 内同步 throw
- **THEN** `renderWidget` 包裹 `appendChild` 捕获异常，移除半挂载元素，渲染降级占位（含「点击重试」）
- **AND THEN** 重试可反复点击，仅重新加载该物料

#### Scenario: 运行时崩溃归因
- **WHEN** 物料在 `setTimeout` / Promise / 事件回调内抛出未捕获异常
- **THEN** 全局 `error` 与 `unhandledrejection` 监听器（捕获阶段）触发 `attributeErrorToWidget`
- **AND THEN** 资源错误按 `element.contains(target)` 归因；JS 错误按 `filename` / `message` / `stack` 匹配物料 JS URL 或物料名
- **AND THEN** `markWidgetFailed` 移除崩溃元素、派发 `error` 生命周期事件、渲染降级占位
- **AND THEN** `unhandledrejection` 命中后 `preventDefault` 抑制控制台告警

#### Scenario: 降级占位防堆叠
- **WHEN** 容器内已存在 `.widget-error-placeholder` 占位
- **THEN** `renderFallback` 渲染新占位前先移除已有占位，避免堆叠

#### Requirement: FR-WL-4 生命周期钩子
The system SHALL emit lifecycle events (loading / loaded / error / unmount) that the host can subscribe to for monitoring, tracking, and logging.

#### Scenario: 订阅生命周期
- **WHEN** 基座调用 `onWidgetLifecycle('loaded', cb)` 后物料挂载成功
- **THEN** cb 被调用，payload 含 `{ name, element, container, hostId }`
- **AND THEN** 返回取消订阅函数，调用后移除回调

#### Requirement: FR-WL-5 多 Host 状态隔离
The system SHALL support multiple WidgetLoader instances with isolated state (loadedResources / definedElements / mountedWidgets / lifecycleHooks) to avoid cross-host interference in micro-frontend / iframe scenarios.

#### Scenario: 多 Host 独立实例
- **WHEN** 调用 `createWidgetLoader({ hostId })`
- **THEN** 返回持有独立状态的新实例，模块级 `defaultLoader` 单例委托保持向后兼容
- **AND THEN** `emitLifecycle` 附加 `hostId` 到 payload

### 6.3 扁平化 props 协议

#### Requirement: FR-PP-1 扁平化 props 序列化
The system SHALL serialize each prop as an independent kebab-case HTML attribute (no aggregated `config` attribute) and SHALL parse values by declared type in the wrapper layer.

#### Scenario: 序列化规则
- **WHEN** 基座调用 `mountWidget(container, { name, props })`
- **THEN** `renderWidget` 对每个 prop 按 camelToKebab 转为 attribute 并按类型序列化：
  - `true` → `setAttribute(attr, '')`（presence 语义）
  - `false` → `setAttribute(attr, 'false')`（**不可 removeAttribute**，否则包装层 `_collectProps` 跳过该 prop，Vue 回退默认值，宿主显式 false 丢失）
  - `null` / `undefined` → `removeAttribute`（由 Vue 应用默认值）
  - `string` → 原样写入
  - `number` / `object` / `array` → `JSON.stringify`
- **AND THEN** `scope` prop 被显式跳过（框架内部维护）

#### Scenario: 包装层反序列化
- **WHEN** Vue2 / Vue3 包装层 `attributeChangedCallback` 触发
- **THEN** `parseAttrValue(raw, type)` 按声明类型解析：
  - Boolean：存在即 true，`"false"` 为 false
  - Number：`Number(raw)`
  - Object / Array：`JSON.parse`（失败回退原始字符串，H5 无类型系统仅 JSON.parse）
  - String：原样
- **AND THEN** kebab-case attribute 转回 camelCase prop 注入业务组件原有 props

#### Scenario: 循环引用 props
- **WHEN** props 含循环引用对象
- **THEN** 序列化抛 `code === 'PROPS_ERROR'` 错误，渲染降级占位

### 6.4 跨物料通信（widget-bus）

#### Requirement: FR-BUS-1 跨技术栈消息总线
The system SHALL provide a global message bus based on native CustomEvent that supports Vue2 / Vue3 / native JS communication.

#### Scenario: emit / on / off
- **WHEN** 调用 `emit('refresh-data', payload)` 与 `on('refresh-data', cb)`
- **THEN** 事件名自动加前缀 `bi-widget-bus:`，实际派发 `bi-widget-bus:refresh-data`
- **AND THEN** `on` 返回取消函数；`off(type, handler)` 可按 handler 移除指定监听
- **AND THEN** 单个 handler 抛异常不阻断其他同类型监听器（try/catch 包裹）

#### Scenario: 命名空间隔离
- **WHEN** 调用 `createBus(namespace)` 创建隔离总线
- **THEN** 事件类型为 `bi-widget-bus:{namespace}:{type}`，避免跨基座事件串扰
- **AND THEN** `scope.bus` 用物料名作命名空间，不同物料的同名事件互不干扰

#### Scenario: Vue 插件形式
- **WHEN** Vue2 调用 `Vue.use(Vue2BusPlugin)` 或 Vue3 调用 `app.use(Vue3BusPlugin)`
- **THEN** 通过 `this.$widgetBus.emit / on / once` 访问总线

### 6.5 物料软隔离（widget-scope）

#### Requirement: FR-SCOPE-1 受控 API 表面
The system SHALL provide a frozen widgetScope object with controlled API surface (meta / context / bus / log / t / request / loader) to limit widgets' direct dependency on window.

#### Scenario: scope 冻结与身份判定
- **WHEN** 调用 `createWidgetScope({ name, version, host })`
- **THEN** 返回 `Object.freeze` 的 scope 对象，标记 `__noGlobalAccess: true` 与 `meta.__isWidgetScope: true`
- **AND THEN** `isWidgetScope(obj)` 仅校验 `meta.__isWidgetScope === true`（不校验顶层 `__noGlobalAccess`，因其会因解构丢失导致误判）

#### Scenario: 嵌套加载循环检测
- **WHEN** 父物料 A 通过 `scope.loader.loadWidget({ name: 'B' })` 加载子物料 B，B 再加载 A
- **THEN** 抛出含「循环加载检测」的错误，链路含 `A -> B -> A`
- **AND THEN** 多级嵌套（A→B→C→A）祖先链正确传播，链路含 `A -> B -> C -> A`
- **AND THEN** 多 Host 场景按 `pendingAncestorsByHost` 分桶，避免微前端 / iframe 嵌套误判

### 6.6 全局上下文（widget-context）

#### Requirement: FR-CTX-1 只读上下文注入
The system SHALL provide a global context store that widgets can only read (get / subscribe) and SHALL broadcast changes via widget-bus.

#### Scenario: setContext 与广播
- **WHEN** 基座调用 `setContext({ theme: 'dark' })`
- **THEN** 浅比较检测变化，`onContextChange('theme', cb)` 订阅者被通知
- **AND THEN** 通过 `window.widgetBus.emit('context-change', { keys, context })` 广播
- **AND THEN** `getContext()` 返回浅拷贝避免物料直接修改内部状态

#### Scenario: deep 选项
- **WHEN** `setContext(partial, { deep: true })`
- **THEN** 用 `isDeepEqual`（JSON.stringify 比较，循环引用回退浅比较）检测深变化
- **AND THEN** 默认浅比较，deep 为 opt-in

#### Scenario: 元素自动注入
- **WHEN** `renderWidget` 创建物料元素时调用 `injectContext(element)`
- **THEN** 序列化上下文写入 `data-context` attribute 与 `element._wcContext` 实例属性
- **AND THEN** 序列化失败不阻断挂载（优先 JSON.stringify，失败回退 safeStringify 再失败为 `'{}'`）

### 6.7 注册表（widget-registry）

#### Requirement: FR-REG-1 三级降级注册表
The system SHALL fetch widget registry with a three-tier fallback chain: memory cache → localStorage cache → fallback list.

#### Scenario: 远程失败降级
- **WHEN** 远程注册表 fetch 失败
- **THEN** 回退 localStorage 缓存，记录缓存年龄（`Date.now() - storageCache.timestamp`）
- **AND THEN** localStorage 也无缓存时回退 fallback 兜底列表
- **AND THEN** 三者均无时抛错

#### Scenario: 请求去重
- **WHEN** 同一时刻多次调用 `fetchRegistry()`
- **THEN** 复用同一个 `fetchPromise`，只发一个请求

#### Scenario: 环境感知 URL
- **WHEN** 注册表 `url` 为函数 `(env) => url`
- **THEN** 支持 dev / prod 切换

### 6.8 页面编排（widget-page）

#### Requirement: FR-PAGE-1 页面状态机
The system SHALL manage pages with a state machine: loading → active → inactive → destroyed (terminal).

#### Scenario: 单 active 模型
- **WHEN** 调用 `page.activate()` 时已有其他 active 页面
- **THEN** 先停用其他 active 页面（`_deactivateActiveExcept`）
- **AND THEN** `activate` 幂等（已 active 直接返回）；`destroy` 已 destroyed 抛错

#### Scenario: 物料归属权跟踪
- **WHEN** 页面切换或销毁
- **THEN** 按 `_elementOwner: Map<element, pageId>` 正确清理，避免误卸载他页物料
- **AND THEN** 卸载失败的 slot 仍清理归属权并置空 element

#### Scenario: slot 错误隔离
- **WHEN** 页面某 slot 挂载失败
- **THEN** 失败只记录到 `failedSlots`，不影响其他 slot
- **AND THEN** `_mountSlots` / `_unmountSlots` 用 `Promise.all` 并发，每个 slot 独立 try/catch

### 6.9 国际化（i18n）

#### Requirement: FR-I18N-1 跨技术栈国际化运行时
The system SHALL provide a Vue-version-agnostic i18n runtime shared by widget-loader and widgets, avoiding vue-i18n UMD global name conflicts across Vue2 / Vue3 coexistence.

#### Scenario: locale 回退链
- **WHEN** `setLocale('zh-CN')` 但未注册 `zh-CN` 语言包
- **THEN** 按回退链 `['zh-CN', 'zh', 'en', 'zh']` 查找，最终回退到 en 再到 zh
- **AND THEN** 回退链无任何已知 locale 时忽略设置

#### Scenario: 语言切换广播
- **WHEN** 基座调用 `setLocale('en')`
- **THEN** 通知所有 `onLocaleChange` 订阅者
- **AND THEN** 通过 `widgetBus.emit('locale-change', { locale })` 广播
- **AND THEN** `force=true` 时即使 locale 未变也重新派发（用于热更新语言包）

#### Scenario: 多 bundle 单例幂等
- **WHEN** 多个物料 bundle 各自引入 `wc/i18n`
- **THEN** `window.__wcI18n__` 已存在时，后续 bundle 函数代理到全局实例
- **AND THEN** 确保操作同一份 messages / listeners / currentLocale，避免状态分裂

#### Requirement: FR-I18N-2 物料语言包追加
The system SHALL allow widgets to inject locale messages at runtime via `addMessages(locale, msgs)` with deep merge.

#### Scenario: 深合并
- **WHEN** 物料调用 `addMessages('zh', { sales: { amount: '销售额' } })`
- **THEN** 递归合并嵌套对象，非对象值直接覆盖
- **AND THEN** 不覆盖基座其他 key

### 6.10 Schema 生成（schema-generator）

#### Requirement: FR-SCHEMA-1 props 自动扫描
The system SHALL scan component props from `.vue` files (Options API / `<script setup>` / TS `defineProps<{}>()`) and generate `schema.json` with type / default / required / layout.

#### Scenario: AST 优先解析
- **WHEN** `@vue/compiler-sfc` 可用
- **THEN** 用 AST 解析 props（支持 setup / 泛型 / withDefaults / 外部类型导入），不可用或失败回退正则解析
- **AND THEN** TS 类型映射（string / number / boolean / Array / Object / any），联合类型返回数组类型，`string[]` / `Array<T>` 返回 'array'

#### Scenario: 默认值解析
- **WHEN** prop 默认值为箭头函数 `() => ({})` / 字符串 / 布尔 / null / 数字 / 数组 / 对象
- **THEN** `parseDefault` 正确解析，单引号字符串用 `singleQuoteToJson` 感知转换

#### Requirement: FR-SCHEMA-2 UI 依赖自动扫描
The system SHALL scan `<template>` for `<el-*>` tags and write `uiDependencies` field into schema when UI components are used.

#### Scenario: 提取 UI 组件
- **WHEN** 模板含 `<el-card>` / `<el-button>` 等
- **THEN** `extractUiDependencies` 返回去 el- 前缀去重组件名数组
- **AND THEN** lib 按 vueVersion 推断（'2'→element-ui，其它→element-plus）
- **AND THEN** 无 `<el-*>` 时不写 uiDependencies，保持与旧版 schema 一致
- **AND THEN** 已知局限：动态组件 `<component :is>` / 字符串渲染 `h('el-button')` 不扫描

### 6.11 UI 组件库按需加载

#### Requirement: FR-UI-1 注册表驱动按需加载
The system SHALL preload UI components on demand based on `schema.json` `uiDependencies` field, grouping by lib and deduplicating components.

#### Scenario: 收集与去重
- **WHEN** `preloadUiDependencies(widgets, options)` 被调用
- **THEN** 收集所有物料的 uiDependencies，按 lib 分组合并 components 去重
- **AND THEN** base 样式始终纳入加载集合（基座统一加载一次，物料不再自带）
- **AND THEN** 校验 lib 与 vueVersion 匹配（element-ui↔'2'，element-plus↔'3'），不匹配抛 `UI_DEP_LIB_MISMATCH`

#### Scenario: per-component 并行加载与注册
- **WHEN** 非 full 模式
- **THEN** per-component 并行加载，注册到对应 Vue 运行时（加回 `el-` 前缀）
- **AND THEN** 单组件 JS 失败重试 1 次，CSS 失败只记录不阻断主流程
- **AND THEN** full 模式（`uiDependencies.full === true`）短路加载全量包

### 6.12 声明式物料使用（widget-declarative-plugin）

#### Requirement: FR-DECL-1 声明式 API
The system SHALL support declarative widget usage via `$widget(name, props)` macro and `<Widget name="..." />` JSX, transforming to `widgetMount(meta, container, props)` at build time.

#### Scenario: 宏转换
- **WHEN** 源码含 `$widget('bi-sales-panel', { title: 'Q3' })`
- **THEN** Babel 转换为 `widgetMount({ name, js, css, vueVersion }, undefined, { title: 'Q3' })`
- **AND THEN** registry 含该物料时内联 js/css/vueVersion，否则只放 name（运行时远程解析）

#### Scenario: JSX 转换
- **WHEN** 源码含 `<Widget name="bi-sales-panel" props={...} />`
- **THEN** 作为 JSX 子节点用 `jsxExpressionContainer` 包裹转换

#### Scenario: helper import 注入
- **WHEN** 转换后的代码需要 `widgetMount`
- **THEN** `ensureHelperImport` 向 Program 节点注入 `import { widgetMount } from '...'`，已存在则不重复

#### Scenario: 远程 registry 联动
- **WHEN** Vite 插件 `buildStart` 触发
- **THEN** `fetchRemoteRegistry` 拉取远程注册表，与静态 registry 合并（静态优先覆盖远程）
- **AND THEN** `transform` 等待 `registryFetchPromise` 确保内联正确

### 6.13 迁移与质量工具链

#### Requirement: FR-MIG-1 规则式迁移 CLI
The system SHALL provide a rule-based migration CLI that converts existing Vue2 / Vue3 components to widget components with minimal changes (output `.migrated.vue`).

#### Scenario: 迁移输出
- **WHEN** 执行 `node wc/migration-skill/index.js bi-sales-panel ./src/components/SalesPanel.vue 2`
- **THEN** 保留组件原有 props 不变（不做扁平化→聚合 config 改造）
- **AND THEN** 给根元素追加 `bi-xxx` 命名空间类名（已有则追加，没有则新增，已含则跳过）
- **AND THEN** 调用 css-namespace-checker / js-risk-scanner 扫描风险，风险只入 `report.warnings`，不退出非 0
- **AND THEN** 输出推荐打包配置（vue.config.js / vite.config.js）

#### Requirement: FR-MIG-2 AI 辅助 CLI
The system SHALL provide an AI assistant CLI with prompt templates for migration / schema / readme generation, callable via environment variables.

#### Scenario: AI 调用
- **WHEN** 设置 `AI_API_KEY` / `AI_API_URL` / `AI_MODEL` 并执行 `node wc/ai-assistant/cli.js migrate bi-xxx ./src/xxx.vue`
- **THEN** 调用 OpenAI 兼容接口（默认 gpt-4o-mini，温度 0.2，60s 超时 AbortController）
- **AND THEN** 未配置密钥时仅打印 Prompt（占位模式，便于人工复制）
- **AND THEN** `WIDGET_NAME_RE = /^[a-z0-9-]+$/` 防路径遍历

#### Requirement: FR-MIG-3 依赖冲突分析
The system SHALL analyze multi-widget project dependencies, detect version conflicts, and recommend externals.

#### Scenario: 冲突检测
- **WHEN** 同一依赖在不同项目中有不同已安装版本
- **THEN** `installedVersions.length > 1` 视为冲突
- **AND THEN** 只读 `dependencies`（不含 devDependencies）
- **AND THEN** 支持 `workspace:*` / `link:` / `file:` / `npm:alias` 协议解析
- **AND THEN** 输出 `generateVueManifest()` 供基座自动注入 Vue 运行时

### 6.14 DevTools 扩展

#### Requirement: FR-DEV-1 浏览器扩展面板
The system SHALL provide an MV3 DevTools extension with three tabs: widget list / event stream / performance timeline.

#### Scenario: 物料列表
- **WHEN** DevTools 打开 WC Widgets 面板
- **THEN** 通过 content-script 注入 injected.js 到页面 MAIN world
- **AND THEN** Hook `customElements.define` 追踪 `bi-*` 物料注册，遍历 DOM 收集 props / scopeMeta
- **AND THEN** 渲染物料表格（name / status / props / scopeMeta / registeredAt），2s 自动刷新

#### Scenario: 事件流
- **WHEN** Hook `window.widgetBus.emit` 捕获事件总线消息
- **THEN** 写入环形缓冲（500 条），倒序展示

#### Scenario: 性能时间线
- **WHEN** widget-loader 调用 `window.__wcDevtoolsBridge.onLifecycle`
- **THEN** 记录生命周期事件，渲染 loading / loaded / error / unmount 瀑布图

---

## 7. 非功能需求

### 7.1 性能

#### Requirement: NFR-PERF-1 首屏性能
The system SHALL ensure first-screen performance is not degraded by widget loading.

#### Scenario: 按需加载
- **WHEN** 看板首屏渲染
- **THEN** 仅加载首屏可见物料的 JS/CSS，不可见物料不加载
- **AND THEN** 公共依赖（Vue / ElementUI / ElementPlus / lodash / axios）由基座统一提供，物料不重复打包

#### Scenario: 预加载空闲调度
- **WHEN** 调用 `preloadWidgets(widgets, opts)` 预加载
- **THEN** 优先 `requestIdleCallback`，降级 `setTimeout(0)`
- **AND THEN** `deadline.timeRemaining() <= 0` 时让出主线程重新调度
- **AND THEN** 默认并发 3（避免抢占主流程带宽），超时 30000ms 标记 `preload_timeout` 跳过

#### Requirement: NFR-PERF-2 UI 组件按需加载体积优化
The system SHALL reduce first-screen UI volume from hundreds of kB to tens of kB via per-component loading.

#### Scenario: 体积对比
- **WHEN** 典型 BI 看板卡片只用 5~10 个 UI 组件
- **THEN** 按需加载首屏 UI 体积从「数百 kB」（全量 element-plus JS gzip ~353.5kB / CSS 320kB）压缩到「数十 kB」
- **AND THEN** 多物料共享同一份组件缓存（`loadedResources` Map 去重）

### 7.2 可靠性

#### Requirement: NFR-REL-1 单点失败不影响整体
The system SHALL ensure a single widget failure does not crash the whole dashboard.

#### Scenario: 物料崩溃隔离
- **WHEN** 任一物料加载失败 / 挂载抛错 / 运行时崩溃
- **THEN** 仅该物料降级为占位，其他物料继续正常渲染
- **AND THEN** 降级占位附「点击重试」，重试只影响当前物料

### 7.3 兼容性

#### Requirement: NFR-COMP-1 跨技术栈共存
The system SHALL support Vue2 / Vue3 / native H5 widgets coexisting on the same page.

#### Scenario: 双运行时共存
- **WHEN** Vue3 基座同时提供 `window.Vue2` 与 `window.Vue3`
- **THEN** Vue2 物料使用 `window.Vue2`，Vue3 物料使用 `window.Vue3`，互不干扰
- **AND THEN** 物料构建时 external Vue，不打包进产物

#### Requirement: NFR-COMP-2 向后兼容
The system SHALL maintain backward compatibility for module-level singleton APIs.

#### Scenario: 模块级单例委托
- **WHEN** 调用 `loadWidget` / `mountWidget` / `unmountWidget` 等模块级函数
- **THEN** 委托到模块级 `defaultLoader` 单例，保持向后兼容
- **AND THEN** `createWidgetLoader` 工厂创建独立实例供多 Host 场景使用

### 7.4 可维护性

#### Requirement: NFR-MAINT-1 文档与代码一致性
The system SHALL maintain documentation consistent with actual code implementation.

#### Scenario: 逆向输出基线
- **WHEN** 代码发生变更
- **THEN** 文档（README / architecture / spec）同步更新
- **AND THEN** `scripts/verify-md-links.js` 校验内部链接与锚点有效性
- **AND THEN** `scripts/verify-md-mermaid.js` 校验 Mermaid 代码块无破坏渲染的标签

#### Requirement: NFR-MAINT-2 测试覆盖
The system SHALL maintain unit tests for all core modules.

#### Scenario: 测试约定
- **WHEN** 修改 `wc/` 下源码
- **THEN** `npm run test:run` 全绿
- **AND THEN** 既有用例不回归
- **AND THEN** 测试目录约定为 `wc/<module>/__tests__/*.test.js`，与源码同目录
- **AND THEN** 使用 vitest + happy-dom

### 7.5 安全性

#### Requirement: NFR-SEC-1 跨域资源加载
The system SHALL load cross-origin resources with `crossOrigin='anonymous'` to obtain detailed error info.

#### Scenario: CDN CORS 配置
- **WHEN** 从 CDN 加载物料 JS/CSS
- **THEN** `<script>` / `<link>` 设置 `crossOrigin='anonymous'`
- **AND THEN** CDN 需配置 CORS 头

#### Requirement: NFR-SEC-2 路径遍历防护
The system SHALL validate widget names to prevent path traversal in AI assistant CLI.

#### Scenario: 名称校验
- **WHEN** AI assistant CLI 接收 widgetName 参数
- **THEN** `WIDGET_NAME_RE = /^[a-z0-9-]+$/` 校验，不匹配则拒绝

### 7.6 可观测性

#### Requirement: NFR-OBS-1 调试日志
The system SHALL provide debug logging controlled by localStorage.

#### Scenario: 开启调试
- **WHEN** `localStorage.getItem('widget-loader-debug') === 'true'`
- **THEN** widget-loader 输出详细加载日志
- **AND THEN** `localStorage.getItem('widget-scope-debug') === 'true'` 开启 scope 调试日志

#### Requirement: NFR-OBS-2 错误码体系
The system SHALL define structured error codes for all failure scenarios.

#### Scenario: 错误码速查
- **WHEN** 加载 / 挂载 / 运行时发生错误
- **THEN** 抛出含 `code` 字段的结构化错误：
  - `LOAD_TIMEOUT`：不可重试
  - `SCRIPT_ERROR` / `CSS_ERROR`：可重试 3 次 + 指数退避
  - `DEP_VERSION_MISMATCH`：不可重试（版本不兼容）
  - `ELEMENT_TIMEOUT`：可重试
  - `PROPS_ERROR`：需修复数据（循环引用）
  - `UI_DEP_LIB_MISMATCH`：UI 依赖与 vueVersion 不匹配
  - `NOT_FOUND`：配置错误

---

## 8. 约束条件

### 8.1 技术约束

- 浏览器需支持 Custom Elements v1、CustomEvent、Promise、Map / WeakMap / Set。
- `requestIdleCallback` 不支持时降级 `setTimeout(0)`。
- `AbortController` 不支持时降级 `setTimeout` 超时控制。
- 物料构建工具：Vue2 用 Vue CLI（webpack），Vue3 / H5 用 Vite。
- Node 18+ 使用 `globalThis.fetch`，低版本回退 `https` / `http` 模块。

### 8.2 架构约束

- **禁用 Shadow DOM**：所有包装层手写 HTMLElement 挂载到 light DOM，Vue3 不得用 `defineCustomElement()`。
- **禁用 config 聚合 prop**：包装层不再观察 `config` attribute，加载器不再写 `config` attribute，迁移工具不再支持 config 模式。
- **vue-i18n 不跨栈**：vue-i18n@8 与 @9 UMD 全局名都是 `VueI18n`，跨技术栈物料共存时无法同时 external，物料业务文案统一用 `wc/i18n`。
- **Custom Element 不可重复注册**：`customElements.define` 不可撤销，重新加载同名元素需刷新页面或换名。

### 8.3 全局变量依赖

物料运行时依赖以下全局变量，缺失则降级或报错：
- `window.Vue2` / `window.Vue3`：缺失且物料声明对应 vueVersion 时，`DEP_VERSION_MISMATCH`。
- `window.ElementPlus` / `window.ELEMENT`：Vue3 物料 app 隔离需重新注册组件到物料 app。
- `window.__wcI18n__`：物料 external `wc-i18n` 引用，缺失则 `t is not a function`。
- `window.widgetBus`：非 Vue 代码直接用，Vue 代码用插件。

---

## 9. 验收标准

### 9.1 功能验收

| 验收项 | 验证方式 |
| ------ | ------ |
| Vue2 物料打包 | `cd demo/vue2-widget-lib && npm run build` 输出 `dist/bi-sales-panel.js` + `.schema.json` |
| Vue3 物料打包 | `cd demo/vue3-widget-lib && npm run build` 输出 `dist/bi-finance-panel.js` + `.schema.json` |
| H5 物料打包 | `cd demo/h5-widget-lib && npm run build` 输出 UMD |
| Vue2 基座加载 | `cd demo/vue2-host && npm run serve`，销售看板正常渲染 |
| Vue3 基座加载 | `cd demo/vue3-host && npm run serve`，双版本物料均可加载 |
| 版本契约拒绝 | Vue3 物料在 Vue2 基座被拒绝，渲染降级占位（无重试按钮） |
| 错误边界 | `bi-crash-tester` 主动崩溃后降级为占位，点击重试恢复 |
| 跨物料通信 | 点击「刷新所有物料」，所有物料同步更新 |
| i18n 切换 | 切换语言，基座 UI / 物料文案 / loader 错误提示同步切换 |
| 嵌套加载 | 父物料加载子物料正常；循环依赖抛错含完整链路 |

### 9.2 非功能验收

| 验收项 | 验证方式 |
| ------ | ------ |
| 单元测试 | `npm run test:run` 全绿，覆盖核心模块 |
| E2E 测试 | `npm run e2e`，Vue2/Vue3 双运行时、props 注入、降级占位、bus 通信 |
| 文档链接 | `node scripts/verify-md-links.js` 无 broken link / anchor |
| Mermaid 校验 | `node scripts/verify-md-mermaid.js` 无破坏渲染的标签 |
| 性能基准 | `npx vitest bench`，缓存命中 vs 不同 URL 并发耗时差异显著 |

---

## 10. 附录：需求追溯矩阵

| 需求编号 | 模块 | 关键文件 |
| ------ | ------ | ------ |
| FR-WP-1~4 | widget-wrapper-plugin | `wc/widget-wrapper-plugin/{vite-plugin,vue-cli-plugin,h5-vite-plugin,postcss-namespace}.js` |
| FR-WL-1~5 | widget-loader | `wc/widget-loader/index.js` |
| FR-PP-1 | props 协议 | `wc/widget-loader/index.js` (renderWidget) + `wc/vue2-widget-template/widget-wrapper.js` |
| FR-BUS-1 | widget-bus | `wc/widget-bus/index.js` |
| FR-SCOPE-1 | widget-scope | `wc/widget-scope/index.js` |
| FR-CTX-1 | widget-context | `wc/widget-context/index.js` |
| FR-REG-1 | widget-registry | `wc/widget-registry/index.js` |
| FR-PAGE-1 | widget-page | `wc/widget-page/index.js` |
| FR-I18N-1~2 | i18n | `wc/i18n/index.js` |
| FR-SCHEMA-1~2 | schema-generator | `wc/schema-generator/index.js` |
| FR-UI-1 | UI 按需加载 | `wc/widget-loader/index.js` (preloadUiDependencies) |
| FR-DECL-1 | widget-declarative-plugin | `wc/widget-declarative-plugin/{index,runtime,babel-plugin,vite-plugin}.js` |
| FR-MIG-1~3 | 迁移工具链 | `wc/migration-skill/index.js` / `wc/ai-assistant/cli.js` / `wc/dependency-analyzer/index.js` |
| FR-DEV-1 | DevTools | `wc/devtools-extension/{manifest,panel,content-script,injected,devtools}.{json,js}` |
| NFR-PERF-1~2 | 性能 | `PERFORMANCE.md` / `wc/widget-loader/__tests__/performance.bench.js` |
| NFR-REL-1 | 可靠性 | `wc/widget-loader/index.js` (错误边界) |
| NFR-COMP-1~2 | 兼容性 | `wc/widget-loader/index.js` (createWidgetLoader) |
| NFR-MAINT-1~2 | 可维护性 | `scripts/verify-md-*.js` / `vitest.config.js` |
| NFR-SEC-1~2 | 安全性 | `wc/widget-loader/index.js` (crossOrigin) / `wc/ai-assistant/cli.js` |
| NFR-OBS-1~2 | 可观测性 | `wc/widget-loader/index.js` (WidgetError) / `TROUBLESHOOTING.md` |
