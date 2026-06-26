# wc 物料架构图集

本文档用 Mermaid 图系统性可视化整个 wc 物料架构，作为 `architecture.md` 的图解补充。所有图均基于源码真实结构，节点名、方法名、事件名、错误码、全局变量名与源码一致。

源码索引：

- `wc/widget-loader/index.js`：`WidgetLoader` 类、`SUPPORTED_DEPS`、`checkDependencies`、`loadScript`/`loadStyle`、`waitForCustomElement`、`renderWidget`、`mountWidget`/`unmountWidget`、`attemptMount`/`mountWithFallback`、`emitLifecycle`、`preloadUiDependencies`、错误边界
- `wc/widget-wrapper-plugin/vite-plugin.js`：`generateVue3Wrapper`、`externals`、`customElements.define`、PostCSS 命名空间、`closeBundle` 静态检查
- `wc/widget-bus/index.js`：`widgetBus.emit/on/once/off`、`createBus`、`window.widgetBus`
- `wc/widget-scope/index.js`：`createWidgetScope`、软隔离 scope、嵌套循环检测
- `wc/widget-context/index.js`：`injectContext`、`setContext`/`getContext`/`onContextChange`
- `wc/i18n/index.js`：`t()`、`setLocale`、`window.__wcI18n__`
- `agent.md`：5 条核心架构决策

---

## 图1：系统总览架构图

本图展示基座（host）↔ 物料（widget）↔ 公共运行时的整体分层关系。基座层提供 Vue2/Vue3 运行时与 `__wcI18n__`/`widgetBus`/`__wcWidgetScope__` 全局变量；加载器层负责依赖校验、资源加载、Custom Element 等待与渲染；物料层是三种技术栈的 `bi-*` Custom Elements（light DOM）；构建层把业务组件包装为 UMD 产物；公共依赖 `SUPPORTED_DEPS` 通过 `window[globalVar]` 注入。

```mermaid
flowchart TD
    subgraph Host["基座层 Host"]
        H2["vue2-host<br/>window.Vue2 / window.ELEMENT"]
        H3["vue3-host<br/>window.Vue3 + window.Vue2 / window.ElementPlus"]
        GI18N["window.__wcI18n__"]
        GBUS["window.widgetBus"]
        GSCOPE["window.__wcWidgetScope__"]
    end
    subgraph Loader["加载器层 widget-loader"]
        CD["checkDependencies"]
        LS["loadScript / loadStyle"]
        WCE["waitForCustomElement"]
        RW["renderWidget"]
        MW["mountWidget / unmountWidget"]
        EL["emitLifecycle"]
    end
    subgraph Widget["物料层 Custom Elements (light DOM, 禁用 Shadow DOM)"]
        W2["bi-xxx Vue2 物料"]
        W3["bi-xxx Vue3 物料"]
        WH5["bi-xxx H5 物料 (vueVersion=none)"]
    end
    subgraph Build["构建层 widget-wrapper-plugin"]
        VP["vite-plugin (Vue3)"]
        CP["vue-cli-plugin (Vue2)"]
        HP["h5-vite-plugin (H5)"]
        EXT["externals + UMD + PostCSS 命名空间"]
    end
    subgraph Deps["公共依赖 SUPPORTED_DEPS"]
        D1["vue2 ^2.6.0 / globalVar=Vue2"]
        D2["vue3 ^3.0.0 / globalVar=Vue3"]
        D3["lodash ^4.17.0 / globalVar=_"]
        D4["axios ^1.0.0 / globalVar=axios"]
    end
    Host -->|"提供运行时与全局变量"| Loader
    Loader -->|"mountWidget 加载挂载"| Widget
    Build -->|"产出 UMD 产物"| Widget
    Deps -->|"window[globalVar] 注入"| Host
    Widget -.->|"scope.bus / scope.t / scope.context"| Host
```

---

## 图2：物料加载管线时序图

本图展示基座调用 `mountWidget` 到物料渲染完成的完整时序，以及失败降级分支。`mountWidget` 内部委托 `attemptMount`：先 `emitLifecycle('loading')`，再 `loadWidget`（内含 `checkDependencies` → `loadScript`/`loadStyle` → `waitForCustomElement`），然后 `renderWidget` 写入 kebab-case attribute 并 `appendChild` 触发 `connectedCallback`。`preloadUiDependencies` 是基座可选的预加载步骤（按 lib 分组、base CSS 去重、注册到 Vue 运行时）。失败时 `emitLifecycle('error')` + `renderFallback` 降级占位，版本不兼容（`DEP_VERSION_MISMATCH`）不渲染重试按钮。

```mermaid
sequenceDiagram
    participant Host as 基座
    participant Loader as WidgetLoader
    participant CD as checkDependencies
    participant LS as loadScript / loadStyle
    participant WCE as waitForCustomElement
    participant RW as renderWidget
    participant El as Custom Element

    Host->>Loader: (可选) preloadUiDependencies(widgets, {cdnBase})
    Note over Loader: 收集 schema.uiDependencies<br/>按 lib 分组 + base CSS 去重<br/>registerUiComponent 注册到 Vue2/Vue3
    Host->>Loader: mountWidget(container, widget)
    Loader->>Loader: emitLifecycle('loading', {name, container})
    Loader->>CD: checkDependencies(widget)
    alt 版本不兼容
        CD-->>Loader: throw code=DEP_VERSION_MISMATCH
        Loader->>Loader: emitLifecycle('error')
        Loader->>Host: renderFallback 降级占位 (无重试按钮)
    else 校验通过
        CD-->>Loader: ok
        Loader->>LS: loadScript(js) 15s 超时 + 指数退避重试 3 次
        Loader->>LS: loadStyle(css)
        LS-->>Loader: script / link onload
        Loader->>WCE: waitForCustomElement(name, 5000ms)
        WCE->>WCE: customElements.whenDefined 优先, 降级轮询
        WCE-->>Loader: defined
        Loader->>RW: renderWidget(container, widget)
        RW->>RW: setAttribute kebab-case props + injectContext
        RW->>El: container.appendChild(element)
        El->>El: connectedCallback -> createApp().mount(this)
        El-->>RW: 渲染完成
        RW-->>Loader: element
        Loader->>Loader: mountedWidgets.set + ensureGlobalErrorListener
        Loader->>Loader: emitLifecycle('loaded', {name, element, container})
        Loader-->>Host: element
    end
    Note over Loader,El: 失败分支: emitLifecycle('error') + renderFallback 降级占位 (含重试按钮, 版本错误除外)
```

---

## 图3：跨物料通信架构图

本图展示 `widget-bus` 事件总线机制。全局总线 `window.widgetBus`（默认 `busName=bi-widget-bus`）通过 `window.dispatchEvent(CustomEvent)` 派发，事件名为 `bi-widget-bus:type`；`createBus(namespace)` 创建命名空间隔离总线，事件名为 `bi-widget-bus:ns:type`，`scope.bus` 用物料名作 ns，不同物料事件互不碰撞。`handlers` Map 按 `eventType -> Set{handler, wrapped}` 管理，`wrapped` 内 try/catch 隔离避免单个 handler 抛异常阻断同类型监听器。DevTools 桥接 `window.__wcDevtoolsBridge.onLifecycle` 捕获 loader 侧 `emitLifecycle` 的生命周期事件流（与 bus 业务事件相互独立）。

```mermaid
flowchart LR
    WA["物料A<br/>window.widgetBus.emit(type, payload)"]
    WB["物料B<br/>window.widgetBus.on(type, cb)"]
    Emit["widget-bus emit<br/>new CustomEvent<br/>事件名: bi-widget-bus:type"]
    Handler["handlers Map<br/>eventType -> Set{handler, wrapped}<br/>on/once 注册, off 按原 handler 反查移除<br/>wrapped 内 try/catch 隔离"]
    NS["createBus(namespace) 命名空间隔离<br/>scope.bus 用物料名作 ns<br/>事件名: bi-widget-bus:物料名:type<br/>不同物料事件互不碰撞"]
    LC["loader emitLifecycle<br/>loading / loaded / error / unmount"]
    Dev["DevTools 桥接<br/>window.__wcDevtoolsBridge.onLifecycle<br/>捕获生命周期事件流 (enriched + hostId)"]

    WA -->|"emit"| Emit
    Emit -->|"window.dispatchEvent"| Handler
    Handler -->|"回调 cb(detail, event)"| WB
    WB -.->|"on/once 注册"| Handler
    NS -.->|"scope.bus 隔离通道"| Emit
    LC -.->|"转发 enriched"| Dev
```

---

## 图4：物料生命周期状态图

本图展示物料的完整生命周期状态。`pending`（配置就绪）→ `loading`（`mountWidget` 调用）→ `loaded`（`connectedCallback` + mount 成功）或 `error`（加载失败/版本不兼容/挂载崩溃）；`loaded` → `unmount`（`disconnectedCallback` 或 `unmountWidget`）；`error` → `loading`（用户点击重试按钮走 `mountWithFallback`）。各状态转换对应 `emitLifecycle` 事件。

```mermaid
stateDiagram-v2
    [*] --> pending: 物料配置就绪
    pending --> loading: mountWidget 调用
    loading --> loaded: connectedCallback + mount 成功
    loading --> error: 加载失败 / 版本不兼容 / 挂载崩溃
    loaded --> unmount: disconnectedCallback / unmountWidget
    error --> loading: 用户点击重试按钮 (mountWithFallback)
    unmount --> [*]: 资源回收完成
    note right of loading: emitLifecycle('loading')
    note right of loaded: emitLifecycle('loaded')
    note right of error: emitLifecycle('error') + renderFallback
    note right of unmount: emitLifecycle('unmount')
```

---

## 图5：软隔离 Scope 结构图

本图展示 `widgetScope` 软隔离对象的注入机制。基座/wrapper 调用 `createWidgetScope({name, version, host})` 生成 `Object.freeze` 的 scope 对象，含 `meta`/`context`/`bus`/`log`/`t`/`request`/`loader` 成员；wrapper 把 scope 通过 `props.scope` 注入物料业务组件，物料通过 `scope.*` 访问基座能力而非直接访问 `window`。`loader` 成员支持嵌套加载子物料并带循环检测（`checkCycle`/`propagateAncestors`，多 Host 按 `pendingAncestorsByHost` 分桶）。与 Shadow DOM 硬隔离对比：本方案用 light DOM + 软隔离，保证 ElementUI/ElementPlus 全局样式穿透。

```mermaid
flowchart TD
    Base["基座 / wrapper 调用<br/>createWidgetScope({name, version, host})"]
    Scope["widgetScope 对象 (Object.freeze)<br/>meta.__isWidgetScope = true"]
    subgraph Members["scope 成员"]
        Meta["meta (只读)<br/>name / version / host"]
        Ctx["context (懒加载 widget-context)<br/>get / onChange<br/>只读快照, set 走基座"]
        Bus["bus (同步, createBus(name))<br/>emit / on / once<br/>命名空间 = 物料名"]
        Log["log<br/>info / warn / error / debug<br/>自动加物料名前缀"]
        T["t (懒加载 wc/i18n)<br/>共享基座 locale"]
        Req["request<br/>fetch 封装 + addInterceptor 注入鉴权"]
        Ldr["loader<br/>loadWidget / mountWidget / unmountWidget<br/>嵌套循环检测"]
    end
    Wrapper["wrapper 包装层<br/>createApp + h(Component, {scope, ...props})<br/>props.scope 注入"]
    Comp["物料业务组件<br/>通过 props.scope 访问基座能力<br/>不直接读写 window/document"]
    Cycle["嵌套循环检测<br/>checkCycle: child===self 或 child 在祖先链 -> 抛错<br/>propagateAncestors: 写入待继承桶<br/>pendingAncestorsByHost 按 host 分桶"]
    Shadow["对比: Shadow DOM 硬隔离<br/>会隔离 ElementUI/ElementPlus 全局样式<br/>本方案: light DOM + 软隔离, 样式可穿透"]

    Base --> Scope
    Scope --> Members
    Wrapper --> Scope
    Scope --> Comp
    Ldr --> Cycle
    Scope -.->|"架构决策对照"| Shadow
```

---

## 图6：构建流程图

本图展示物料构建流程。业务 `.vue` 组件经 `widget-wrapper-plugin`（vite/vue-cli/h5 三种）生成 wrapper（`customElements.define` + `createApp`/`new Vue`/`render`），通过 `externals` 排除 vue/element-plus/lodash/axios/wc-i18n/wc-widget-scope，PostCSS `createNamespacePlugin(name)` 自动加 `.bi-xxx` 选择器前缀，最终 UMD 单文件输出（`bi-xxx.js` + `bi-xxx.css`，globals 映射全局变量）。`closeBundle` 钩子自动生成 `schema.json` 并执行三项静态检查：scoped CSS、CSS 命名空间、JS 危险 API。

```mermaid
flowchart LR
    Src["业务 .vue 组件"]
    Plugin["widget-wrapper-plugin<br/>(vite-plugin / vue-cli-plugin / h5-vite-plugin)"]
    Wrap["生成 wrapper 临时入口<br/>generateVue3Wrapper 等<br/>customElements.define + createApp"]
    Ext["externals 排除<br/>vue / element-plus / lodash / axios<br/>wc-i18n / wc-widget-scope"]
    Post["PostCSS 命名空间前缀<br/>createNamespacePlugin(name)<br/>.bi-xxx 选择器前缀"]
    UMD["UMD 单文件输出<br/>bi-xxx.js + bi-xxx.css<br/>globals: Vue / ElementPlus / __wcI18n__ 等"]
    Schema["schema.json 自动生成<br/>closeBundle: writeSchema"]
    Check["静态检查 (closeBundle)<br/>scoped-style-checker (默认 error)<br/>css-namespace-checker (默认 warn)<br/>js-risk-scanner (failOnHighRisk)"]

    Src --> Plugin
    Plugin --> Wrap
    Wrap --> Ext
    Ext --> Post
    Post --> UMD
    UMD --> Schema
    Schema --> Check
```

---

## 图7：多 Host 状态隔离图

本图展示 `createWidgetLoader` 多实例隔离机制。每个 Host 通过 `createWidgetLoader({hostId})` 创建独立的 `WidgetLoader` 实例，持有独立的 `loadedResources`/`definedElements`/`widgetResources`/`mountedWidgets`/`lifecycleHooks`/`globalErrorListenerInstalled`，避免微前端/iframe 嵌套场景下 A Host 的加载记录干扰 B Host。`emitLifecycle` 在 payload 上附加 `hostId`，基座订阅 `onWidgetLifecycle` 时可据此区分事件来源。模块级 `defaultLoader` 单例委托保持向后兼容。

```mermaid
flowchart TD
    Factory["createWidgetLoader(opts)<br/>new WidgetLoader({hostId})"]
    Single["defaultLoader 单例<br/>模块级导出委托 (向后兼容)"]

    subgraph HostA["Host A (hostId=dashboard-vue2)"]
        LA["WidgetLoader 实例 A"]
        LA_State["独立状态<br/>loadedResources / definedElements<br/>widgetResources / mountedWidgets<br/>lifecycleHooks / globalErrorListenerInstalled"]
    end
    subgraph HostB["Host B (hostId=dashboard-vue3)"]
        LB["WidgetLoader 实例 B"]
        LB_State["独立状态 (与 Host A 互不干扰)"]
    end

    Sub["基座订阅 onWidgetLifecycle(event, cb)<br/>payload.hostId 区分事件来源"]
    Dev["window.__wcDevtoolsBridge<br/>enriched.hostId 透传 DevTools"]

    Factory --> HostA
    Factory --> HostB
    Single -.->|"loadWidget/mountWidget 等导出委托"| LA
    LA --> LA_State
    LB --> LB_State
    HostA --> Sub
    HostB --> Sub
    Sub --> Dev
```

---

## 图8：错误边界与降级流程图

本图展示错误归因与降级机制。`ensureGlobalErrorListener` 在首次挂载物料时安装捕获阶段 `error` 监听与 `unhandledrejection` 监听；`attributeErrorToWidget` 归因：资源错误看 `event.target` 是否落在已挂载物料内，JS 错误按 `filename`/`message`/`stack` 匹配物料 JS URL 或物料名。命中后 `markWidgetFailed` 置 `entry.failed=true`、移除崩溃元素、`emitLifecycle('error')`、`renderFallback` 渲染降级占位（含重试按钮）。`renderFallback` 用 `querySelectorAll('.widget-error-placeholder')` 移除已有占位防堆叠。`unhandledrejection` 命中后 `preventDefault` 抑制控制台告警。

```mermaid
flowchart TD
    Err["window error 事件 (捕获阶段, addEventListener true)"]
    Rej["window unhandledrejection 事件"]
    Attr["attributeErrorToWidget 归因<br/>1. 资源错误: event.target 落在已挂载物料内<br/>2. JS 错误: filename/message/stack 匹配 JS URL 或物料名<br/>3. rejection: reason.stack 匹配"]
    Hit{命中物料?}
    NoHit["未命中: 不处理"]
    Mark["markWidgetFailed<br/>entry.failed = true (防重复处理)<br/>移除崩溃元素避免残留破坏布局"]
    Emit["emitLifecycle('error', {name, error, container})"]
    Fb["renderFallback 降级占位<br/>注入 .widget-error-placeholder 样式<br/>含 .widget-error-retry 重试按钮"]
    Dedup["querySelectorAll('.widget-error-placeholder')<br/>移除已有占位防堆叠 (多次失败场景)"]
    Retry["用户点击重试<br/>mountedWidgets.delete 清除 failed 标记<br/>mountWithFallback 重新挂载"]
    Prevent["event.preventDefault()<br/>抑制浏览器默认报错 / 控制台告警"]
    Version{"错误码 = DEP_VERSION_MISMATCH?"}
    NoRetry["版本不兼容: 不渲染重试按钮<br/>(确定性错误, 重试无意义)"]

    Err --> Attr
    Rej --> Attr
    Attr --> Hit
    Hit -->|否| NoHit
    Hit -->|是| Mark
    Mark --> Emit
    Emit --> Version
    Version -->|是| NoRetry
    Version -->|否| Fb
    Fb --> Dedup
    Dedup --> Retry
    Mark --> Prevent
```

---

## 附：架构决策与图对照

| 决策（agent.md） | 对应图 |
| --- | --- |
| 1. Custom Elements + light DOM，禁用 Shadow DOM | 图1、图5、图6 |
| 2. UMD + external，基座统一提供运行时 | 图1、图6 |
| 3. 扁平化 props 协议（kebab-case attribute） | 图2 |
| 4. 软隔离 widgetScope | 图5 |
| 5. 构建时静态分析 | 图6 |
