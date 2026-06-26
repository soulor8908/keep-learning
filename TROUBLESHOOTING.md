# 故障排查指南（Troubleshooting）

> 本文档面向使用「跨技术栈看板物料集成方案」的开发者，按"现象 → 原因 → 解决"的结构梳理物料加载、渲染、通信、构建、本地调试等环节的常见问题。
>
> 阅读前建议先了解整体架构，见 [docs/architecture.md](docs/architecture.md) 与 [README.md](README.md)。

## 目录

- [一、快速定位](#一快速定位)
- [二、本地调试与环境](#二本地调试与环境)
- [三、物料加载失败](#三物料加载失败)
- [四、版本契约（DEP_VERSION_MISMATCH）](#四版本契约dep_version_mismatch)
- [五、物料渲染异常](#五物料渲染异常)
- [六、样式与 UI 组件库](#六样式与-ui-组件库)
- [七、Props 传值问题](#七props-传值问题)
- [八、跨物料通信（widget-bus）](#八跨物料通信widget-bus)
- [九、国际化（i18n）](#九国际化i18n)
- [十、构建与打包](#十构建与打包)
- [十一、错误码速查表](#十一错误码速查表)

---

## 一、快速定位

遇到问题时，先按以下步骤快速定位：

1. **开启加载器调试日志**（最重要）：

   ```js
   // 浏览器 DevTools Console 执行
   localStorage.setItem('widget-loader-debug', 'true');
   // 刷新页面，Console 会输出 [widget-loader] 开头的详细日志
   ```

   调试结束后关闭：`localStorage.removeItem('widget-loader-debug')`。

2. **查看降级占位**：物料崩溃或加载失败时，对应区域会渲染 `.widget-error-placeholder` 占位节点，上面写明原因（版本不兼容 / 加载失败 / 运行时崩溃）。版本不兼容的占位**没有**重试按钮，其他失败带「点击重试」。

3. **核对全局变量**：在 Console 检查基座是否注入了对应运行时：

   ```js
   window.Vue2 && window.Vue2.version; // Vue2 基座必备
   window.Vue3 && window.Vue3.version; // Vue3 物料需要
   window.ELEMENT;                     // ElementUI（Vue2 基座）
   window.ElementPlus;                 // ElementPlus（Vue3 基座）
   window.__wcI18n__;                  // 跨技术栈国际化运行时
   window.widgetBus;                   // 跨物料消息总线
   ```

4. **检查 Network 面板**：看物料 JS/CSS 是否 404、是否被 CORS 拦截、是否长时间 pending（超时默认 15 秒）。

---

## 二、本地调试与环境

### 2.1 现象：基座报 `Failed to load script` / 物料 404

**原因**：

- 本地热调试模式下，基座从 `http://localhost:8081` / `http://localhost:8082` 加载物料，但物料静态服务（`serve:dist`）未启动。
- 或端口 8081 / 8082 被其他进程占用。
- 或产物未构建 / 未复制到 `public/widgets/`。

**解决**：

- 热调试模式：确保 `serve:widget`（热构建）与 `serve:dist`（静态服务）都在运行：

  ```bash
  # Vue2 物料：热构建 + 静态服务（8081）
  cd demo/vue2-widget-lib && npm run serve:widget    # 终端 1
  cd demo/vue2-widget-lib && npm run serve:dist      # 终端 2

  # Vue3 物料：热构建 + 静态服务（8082）
  cd demo/vue3-widget-lib && npm run serve:widget    # 终端 3
  cd demo/vue3-widget-lib && npm run serve:dist      # 终端 4
  ```

- 非热调试模式：先 `npm run build` 物料，再把产物复制到基座 `public/widgets/`：

  ```bash
  cp demo/vue2-widget-lib/dist/bi-sales-panel.js demo/vue2-host/public/widgets/
  ```

- 端口被占用时，`npx serve` 会自动顺延端口，需同步修改注册表里的 URL。

### 2.2 现象：跨域错误 `CORS policy: No 'Access-Control-Allow-Origin'`

**原因**：物料静态服务未带 `--cors`，而 `widget-loader` 的 `loadScript` 设置了 `crossOrigin = 'anonymous'` 以获取跨域资源的详细错误信息，CDN / 静态服务必须返回 CORS 头。

**解决**：

- 使用 `npm run serve:dist`，其脚本已包含 `--cors`（`npx serve dist -l 8081 --cors`）。
- 自建静态服务时务必开启 CORS。
- 生产环境 CDN 需配置 `Access-Control-Allow-Origin`。

### 2.3 现象：修改物料源码后页面没变化

**原因**：

- 浏览器缓存了旧的物料 JS（URL 未变，浏览器命中磁盘缓存）。
- `serve:widget` 的 watch 未触发重新构建，或构建失败未察觉。

**解决**：

- 按 `Ctrl + F5` 强制刷新，或在 DevTools Network 面板勾选 `Disable cache`。
- 检查 `serve:widget` 终端是否有构建错误输出。
- 注意：**Custom Element 一旦注册不能重复注册**，修改包装层代码后必须刷新整个页面，不能依赖 HMR。

### 2.4 现象：DevTools Sources 看不到原始 `.vue` 文件

**原因**：Source Map 未生成或被关闭。

**解决**：

- Vue2 物料：确认 `wc/widget-wrapper-plugin/vue-cli-plugin.js` 中 `config.devtool('source-map')` 生效。
- Vue3 物料：确认 `wc/widget-wrapper-plugin/vite-plugin.js` 中 `build.sourcemap: true` 生效。
- 重新执行 `npm run build` / `serve:widget`。

### 2.5 现象：基座加载了 `public/widgets` 下的旧产物而非本地热服务

**原因**：注册表未识别为开发模式，未指向 `localhost:8081/8082`。

**解决**：

- Vue2 基座：检查 `process.env.NODE_ENV === 'development'` 判断是否生效。
- Vue3 基座：检查 `import.meta.env.DEV` 判断是否生效。
- 确认 `widgetRegistry.js` 的开发/生产分支 URL 配置正确。

### 2.6 现象：`npm install` 报 peer 依赖冲突或脚本失败

**原因**：各子项目（`demo/*`、`wc/*`）独立维护依赖，需在对应目录单独安装。

**解决**：

- 根目录 `npm install` 只装部署/测试相关依赖；demo 与 widget-lib 各自 `cd` 进去单独 `npm install`。
- Vue2 物料依赖 `vue@^2.6.14` + `@vue/cli-service` + `@vue/web-component-wrapper`；Vue3 物料依赖 `vue@3.x` + `vite` + `@vitejs/plugin-vue`，不要混装。

---

## 三、物料加载失败

### 3.1 现象：物料区域显示降级占位「物料 "xxx" 加载失败，已降级」

**对应文案**：`loader.load_failed`（`物料 "{name}" 加载失败，已降级：`）

**原因**：`loadScript` / `loadStyle` 失败，可能是 404、网络中断、CDN 抖动、CORS 拦截。

**排查**：

1. 看 Network 面板对应 JS/CSS 的状态码与响应头。
2. 看占位上的具体错误信息（`Failed to load script: <url>` / `Timeout loading script: <url>`）。
3. 打开调试日志看 `[widget-loader] loading script:` 是否打印。

**解决**：

- 占位带「点击重试」按钮：点击后 loader 会**清除该 URL 的缓存**重新拉取（应对 CDN 网络抖动）。
- `loadScript` / `loadStyle` 内置自动重试（默认 3 次，指数退避 1s → 2s → 4s），仅对 `SCRIPT_ERROR` / `CSS_ERROR` 重试，**超时不重试**（避免加剧拥塞）。
- 404 属于确定性错误，需修复注册表 URL 或补传产物。

### 3.2 现象：物料 JS 加载成功但长时间不渲染，最终超时

**对应错误**：`Timeout waiting for custom element: <name>`（`ELEMENT_TIMEOUT`）

**原因**：物料 JS 加载完成后应在内部调用 `customElements.define(name, ...)`，但：

- 物料 JS 执行报错（语法错误 / 运行时错误），未走到 `define`。
- 物料依赖的全局变量（`Vue2` / `Vue3` / `ELEMENT`）不存在，导致 UMD factory 抛错。
- 物料名拼写不一致：注册表里的 `name` 与物料内部 `customElements.define(name)` 的名字不匹配。

**排查**：

- 在 Console 看是否有红色报错（UMD factory 抛错会直接打印）。
- 执行 `customElements.get('bi-xxx')` 看是否已定义。
- 检查注册表 `name` 与物料构建配置 `name` 是否完全一致（含大小写、连字符）。

**解决**：

- 修复物料 JS 执行错误。
- 确保基座已注入物料所需的全局变量（见 [四、版本契约](#四版本契约dep_version_mismatch)）。
- 默认超时 5 秒，可在 `waitForCustomElement` 调用时传更大的 timeout（但通常 5 秒足够，超时多半是物料本身有问题）。

### 3.3 现象：物料挂载后立即崩溃，显示「物料 "xxx" 挂载失败，已降级」

**对应文案**：`loader.mount_failed`（`物料 "{name}" 挂载失败，已降级：`）

**原因**：物料的 `connectedCallback` 内同步抛错（如渲染时访问 undefined、模板编译错误）。

**解决**：

- `renderWidget` 会用 try/catch 包裹 `appendChild`，移除半挂载元素并降级。
- 点击重试可重新挂载；若仍崩溃，需修复物料组件代码。
- 用调试日志 + Source Map 在 `connectedCallback` 处打断点定位。

### 3.4 现象：物料首次正常，N 秒后突然降级（运行时崩溃）

**对应文案**：`loader.runtime_crash`（`物料 "{name}" 运行时崩溃，已降级隔离：`）

**原因**：物料在 `setTimeout` / Promise / 事件回调里抛出未捕获异常，被 `widget-loader` 的全局 `error` / `unhandledrejection` 监听器捕获并归因。

**排查**：

- Console 会同步输出崩溃堆栈，按堆栈定位。
- 归因逻辑按 `event.filename` / `error.stack` / 物料 JS URL 匹配。**注意**：压缩后无 source map 的物料可能无法归因，需开启 source map。

**解决**：

- 修复物料内的运行时错误。
- 占位带「点击重试」：重试时脚本已缓存，只重新创建元素实例挂载。
- demo 中的 `bi-crash-tester` 就是故意在 `setTimeout` 里抛错的演示，可参考其行为。

### 3.5 现象：看板整体白屏 / 其他物料被拖垮

**预期行为**：单个物料崩溃**不应**拖垮整个看板。若出现整体白屏，说明错误边界未生效。

**排查**：

- 确认使用的是 `mountWidget`（带错误边界）而非直接 `loadWidget` + `document.createElement`。
- 确认错误发生在物料物料挂载之后（错误边界覆盖加载失败、挂载同步抛错、运行时崩溃三类）。
- 若错误发生在基座自身代码（非物料内），错误边界不负责兜底，需检查基座代码。

---

## 四、版本契约（DEP_VERSION_MISMATCH）

### 4.1 现象：Vue3 物料在 Vue2 基座上显示版本不兼容占位

**对应文案**：

```
[widget-loader] 版本校验失败，已拒绝加载物料 "bi-finance-panel"：
  - 物料 "bi-finance-panel" 依赖 Vue3（^3.0.0），但基座未提供 Vue3 运行时
```

**原因**：`widget-loader` 加载物料前按 `widget.vueVersion` 校验基座全局变量。Vue2 基座只挂载 `window.Vue2`，没有 `window.Vue3`，Vue3 物料被直接拒绝。

**这是预期行为**：避免 Vue3 物料在 Vue2 运行时上跑出晦涩错误。版本不兼容占位**没有**重试按钮（确定性错误，重试无意义）。

**解决**：

- 使用 Vue3 基座（`demo/vue3-host`），它同时提供 `window.Vue3` 与 `window.Vue2`，双版本物料均可加载。
- 或在 Vue2 基座额外引入 Vue3 运行时并挂到 `window.Vue3`（参考 Vue3 基座 `index.html` 加载 Vue2 的做法）。

### 4.2 现象：版本校验报「基座提供 {actual}」不满足范围

**对应文案**：`物料 "{name}" 要求 {dep} {range}，但基座提供 {actual}`

**原因**：基座注入的 Vue / lodash / axios 版本不在物料声明的 `compatibleRange` 内。

**解决**：

- `SUPPORTED_DEPS` 定义了基座承诺的版本与兼容范围：

  | 依赖 | 基座版本 | 兼容范围 | 全局变量 |
  | --- | --- | --- | --- |
  | vue2 | 2.6.14 | `^2.6.0` | `Vue2` |
  | vue3 | 3.4.21 | `^3.0.0` | `Vue3` |
  | lodash | 4.17.21 | `^4.17.0` | `_` |
  | axios | 1.7.7 | `^1.0.0` | `axios` |

- 升级基座运行时到兼容范围内（注意 `^` 语义：同 major 版本）。
- 物料若需要更宽的范围，未来可在注册表声明自定义 `compatibleRange`（待增强）。

### 4.3 现象：物料依赖 lodash / axios 但基座未挂载

**对应文案**：`物料 "{name}" 依赖 lodash（^4.17.0），但基座未提供 _ 运行时`

**原因**：物料在注册表声明了 `runtimeDeps: ['lodash', 'axios']`，但基座未加载这些库到 `window._` / `window.axios`。

**解决**：基座在入口加载对应库并挂全局：

```js
import _ from 'lodash';
window._ = _;
import axios from 'axios';
window.axios = axios;
```

注意：lodash 挂到 `window._` 时无 `.version` 属性，loader 只校验存在性不校验版本；axios 有 `VERSION` 字段可校验版本。

---

## 五、物料渲染异常

### 5.1 现象：物料 DOM 出现但内容空白

**原因**：

- 物料组件的 `props` 未正确传入（见 [七、Props 传值问题](#七props-传值问题)）。
- 物料依赖的 ElementUI/ElementPlus 组件未注册（见 [六、样式与 UI 组件库](#六样式与-ui-组件库)）。
- 物料内部数据请求失败 / 异步未返回。

**排查**：

- 在 DevTools Elements 面板找到物料 Custom Element（如 `<bi-sales-panel>`），检查其 attribute 是否正确。
- 在物料组件内打断点（依赖 Source Map），看 `props` 是否注入。
- Console 看是否有 `Unknown custom element: <el-xxx>` 之类的 Vue 警告。

### 5.2 现象：物料内容渲染了但样式错乱 / 没样式

见 [六、样式与 UI 组件库](#六样式与-ui-组件库)。

### 5.3 现象：同一物料多实例，其中一个崩溃后其他实例也异常

**预期行为**：不应互相影响。`mountedWidgets` 以 DOM 元素实例为 key（Map，可迭代用于错误归因），同物料多实例互不覆盖。

**排查**：

- 确认使用的是最新的 `widget-loader`（早期版本曾用 `widget.name` 作 key 导致覆盖，已修复为以元素实例为 key）。
- 检查是否有多 Host 共享状态问题（见 [5.4](#54-现象同页多-hostiframe-嵌套时状态互相干扰)）。

### 5.4 现象：同页多 Host（iframe 嵌套）时状态互相干扰

**原因**：默认导出的 `widget-loader` 是单例，多 Host 共享 `loadedResources` / `definedElements` / `mountedWidgets`，A Host 的加载记录可能干扰 B Host。

**解决**：每个 Host 创建独立实例：

```js
import { createWidgetLoader } from './wc/widget-loader';

const loader = createWidgetLoader({ hostId: 'vue3-host-1' });
loader.onWidgetLifecycle('error', ({ name, error, hostId }) => {
  // 通过 hostId 区分事件来源
});
```

每个实例持有独立的资源缓存、已注册元素、挂载追踪、生命周期钩子。

---

## 六、样式与 UI 组件库

### 6.1 现象：物料内 ElementUI / ElementPlus 组件无样式（白板）

**原因**：

- 基座未加载 ElementUI/ElementPlus 的 CSS。
- 物料误用了 Shadow DOM（见 [6.2](#62-现象控制台报错-shadow-dom-detected)）。
- 物料构建时未把 `element-ui` / `element-plus` 设为 external，导致重复打包且样式路径错误。

**解决**：

- Vue2 基座：`import 'element-ui/lib/theme-chalk/xxx.css'` 并 `window.ELEMENT = ELEMENT`（见 `demo/vue2-host/src/element-ui.js`）。
- Vue3 基座：`setupElementPlus(app)` 注册组件并挂 `window.ElementPlus`。
- 物料按需使用 `el-xxx` 组件，构建时 external，**不要**在物料内 import ElementUI CSS。

### 6.2 现象：控制台报错 `Shadow DOM detected`

**原因**：包装层明确**禁止** Shadow DOM。Vue3 官方 `defineCustomElement()` 默认调用 `attachShadow()`，会隔离 ElementUI/ElementPlus 全局样式、主题变量、字体图标。包装层在 `connectedCallback` 加了运行时守卫，检测到 `shadowRoot` 立即报错。

**解决**：

- 不要改用 `defineCustomElement()`。使用项目提供的 `wc/vue3-widget-template/widget-wrapper.js` 或 `vite-plugin` 生成的包装层（手写 `HTMLElement` + `createApp().mount(this)` 挂载到 light DOM）。
- 若自定义包装层，确保不调用 `attachShadow`。

### 6.3 现象：多个物料样式互相覆盖（如 `.title` 冲突）

**原因**：项目**不启用 Shadow DOM**（为保证全局 UI 库样式穿透），依赖 CSS 命名空间避免冲突。若物料写了无命名空间的全局选择器，会互相污染。

**解决**：

- 物料根节点强制使用 `bi-xxx` 命名空间类名，如 `.bi-sales-panel .title`。
- 使用 Vue `<style scoped>` 自动加属性选择器。
- 用 `wc/css-namespace-checker` 扫描未加命名空间的选择器：

  ```bash
  node wc/css-namespace-checker/index.js ./src/components/SalesPanel.vue bi-sales-panel
  ```

---

## 七、Props 传值问题

### 7.1 现象：Boolean prop 传 `false` 后变成 `true`（默认值）

**原因**：宿主传 `false` 时若用 `removeAttribute`，包装层 `_collectProps` 会跳过该 prop，Vue 回退到默认值（尤其默认值为 `true` 时，显式 `false` 丢失）。

**正确行为**：`renderWidget` 序列化时，`false` → 字符串 `"false"`（**不**移除 attribute），包装层 `parseAttrValue(Boolean)` 把 `"false"` 解析回 `false`。

**排查**：

- 检查 DevTools Elements 中物料元素的 attribute：`is-visible` 应为 `"false"`，而不是缺失。
- 确认使用的是 `mountWidget`（内置正确序列化），而非手动 `setAttribute`。

**序列化规则速查**：

| prop 值 | attribute 写法 | 说明 |
| --- | --- | --- |
| `true` | `attr=""`（空串） | presence 语义 |
| `false` | `attr="false"` | 显式 false，**不能用 removeAttribute** |
| `null` / `undefined` | 不写 attribute | 由 Vue 应用默认值 |
| `string` | 原样写入 | |
| `number` / `object` / `array` | `JSON.stringify` | |

### 7.2 现象：Object / Array prop 传不进去或解析为字符串

**原因**：包装层按声明类型解析。若组件未声明 `type: Object` / `type: Array`，包装层按 String 处理，JSON 字符串不会被反序列化。

**解决**：组件 `props` 必须声明类型：

```js
props: {
  filters: { type: Array, default: () => [] },
  config: { type: Object, default: () => ({}) }
}
```

### 7.3 现象：props 序列化失败占位「props 序列化失败（可能含循环引用）」

**对应文案**：`loader.props_serialize_failed`（`物料 "{name}" props 序列化失败（可能含循环引用）`）

**原因**：`renderWidget` 用 `JSON.stringify` 序列化 object/array props，遇到循环引用会抛错。

**解决**：移除 props 中的循环引用，或改为通过 `widget-bus` / `widget-scope` 传递复杂对象。

### 7.4 现象：camelCase prop 名传不进去

**原因**：宿主通过 `widget.props` 传 camelCase（如 `maxCount`），`renderWidget` 内部用 `camelToKebab` 转为 `max-count` attribute，包装层再转回 camelCase。若物料组件 prop 名与注册表 `props` 键名不一致，会失配。

**解决**：确保注册表 `props` 的键名与组件 `props` 声明完全一致（均为 camelCase），转换由 loader 与包装层自动完成。

---

## 八、跨物料通信（widget-bus）

### 8.1 现象：物料监听不到 `emit` 的事件

**原因**：

- 监听时机晚于 `emit`（事件是瞬时的，错过不补发）。
- 事件名不一致：`widget-bus` 会自动加前缀 `bi-widget-bus:`，调用方传 `refresh-data`，实际事件名为 `bi-widget-bus:refresh-data`。**不要**手动加前缀。
- `window.widgetBus` 未挂载（基座未引入 `wc/widget-bus`）。

**排查**：

```js
window.widgetBus; // 应为 { emit, on, once }
```

**解决**：

- 基座入口引入：`import './wc/widget-bus'`（会自动挂 `window.widgetBus`）。
- 物料在 `mounted` 里订阅，`beforeDestroy` / `unmounted` 里取消订阅，避免内存泄漏。

### 8.2 现象：Vue2 / Vue3 物料收不到对方发的消息

**原因**：`widget-bus` 基于原生 `CustomEvent` + `window.dispatchEvent`，与框架无关，Vue2/Vue3/原生 JS 均可收发。收不到通常是订阅未生效。

**解决**：

- Vue2 用 `Vue2BusPlugin`：`Vue.use(Vue2BusPlugin)` → `this.$widgetBus.on(...)`。
- Vue3 用 `Vue3BusPlugin`：`app.use(Vue3BusPlugin)` → `this.$widgetBus.on(...)`。
- 原生物料直接 `window.widgetBus.on(...)`。
- 三者底层都是同一个 `window` 事件，互通无障碍。

### 8.3 现象：物料卸载后仍收到事件（内存泄漏）

**原因**：`on` 返回的取消函数未在组件销毁时调用。

**解决**：

```js
mounted() {
  this._off = on('refresh-data', this.handleRefresh);
},
beforeDestroy() { // Vue3 用 beforeUnmount
  if (this._off) this._off();
}
```

---

## 九、国际化（i18n）

### 9.1 现象：切换语言后，物料业务文案不变

**原因**：物料未订阅 `locale-change` 事件触发重渲染。

**解决**：物料组件需引用 `localeTick` 并订阅切换：

```js
import { t, onLocaleChange } from 'wc-i18n';

export default {
  data: () => ({ localeTick: 0 }),
  computed: {
    t() { void this.localeTick; return t; } // 引用 tick 使其成为依赖
  },
  mounted() {
    this._off = onLocaleChange(() => { this.localeTick++; });
  },
  beforeDestroy() { if (this._off) this._off(); }
};
```

### 9.2 现象：物料报 `t is not a function` / `wc-i18n` 找不到

**原因**：物料构建时未把 `wc-i18n` 设为 external，或基座未挂 `window.__wcI18n__`。

**解决**：

- 物料 `vite.config.js` / `vue.config.js` external `wc-i18n` → global `__wcI18n__`。
- 基座入口引入 `wc/i18n`（会自动挂 `window.__wcI18n__`）。

### 9.3 现象：基座 vue-i18n 切换了但 widget-loader 错误提示语言不变

**原因**：基座切换语言时未同步 `wc/i18n.setLocale()`。`widget-loader` 的错误文案走 `wc/i18n`，与基座的 vue-i18n 是两套。

**解决**：基座切换语言时同时更新两者：

```js
export function changeLocale(locale) {
  i18n.locale = locale;          // vue-i18n（基座 UI）
  setLocale(locale);             // wc/i18n（loader / 物料）
}
```

参考 `demo/vue2-host/src/i18n.js`。

### 9.4 现象：自定义 locale（如 `zh-CN`）不生效

**原因**：`wc/i18n` 的 `t()` 按回退链查找：`zh-CN` → `zh` → `en`。若回退链中无任何已知 locale（`zh` / `en`），`setLocale` 会忽略本次切换。

**解决**：

- 用 `addMessages` 注入自定义语言包：`addMessages('zh-CN', { ... })`。
- 注入后用 `setLocale('zh-CN', true)` 强制广播（`force=true` 用于热更新语言包后刷新物料）。

---

## 十、构建与打包

### 10.1 现象：物料产物里打包进了 Vue（体积过大）

**原因**：构建配置未正确设置 externals。

**解决**：

- Vue2（Vue CLI）：`config.externals({ vue: 'Vue2', 'element-ui': 'ELEMENT', 'wc-i18n': '__wcI18n__' })`。
- Vue3（Vite）：`rollupOptions.external: ['vue', 'element-ui', 'wc-i18n']`，`output.globals: { vue: 'Vue3', 'element-ui': 'ELEMENT', 'wc-i18n': '__wcI18n__' }`。
- Vue2 物料 global 名用 `Vue2`，Vue3 物料用 `Vue3`，不要混用。

### 10.2 现象：`schema.json` 未生成或 props 缺失

**原因**：

- 插件 `closeBundle` / 构建后钩子未执行。
- 组件用了 `<script setup>` + `defineProps<{}>()` 泛型语法，旧版 `schema-generator` 不支持。

**解决**：

- 单独生成：`node wc/schema-generator/index.js bi-xxx ./src/components/Xxx.vue`。
- 确保 `schema-generator` 为支持 TS 泛型语法的版本（已修复 P1-5 / P1-6）。
- 检查组件 `props` 声明完整性。

### 10.3 现象：Vue2 物料 CSS 未打进 JS（单独成文件）

**原因**：`vue.config.js` 未设置 `css: { extract: false }`，导致 CSS 独立成文件，需额外加载。

**解决**：

```js
module.exports = {
  css: { extract: false }, // scoped style 注入 JS，避免单独加载 CSS
  // ...
};
```

并在注册表里声明 `css` 字段，或确认物料无需独立 CSS。

### 10.4 现象：迁移后的组件 `*.migrated.vue` 缺少命名空间类名

**原因**：`migration-skill` 会自动给根元素加 `bi-xxx` 类名，若组件根元素结构特殊可能未命中。

**解决**：

- 手动在根元素加 `class="bi-xxx"`。
- 用 `css-namespace-checker` 扫描：`node wc/css-namespace-checker/index.js ./Xxx.migrated.vue bi-xxx`。
- 用 `js-risk-scanner` 扫描危险 API：`node wc/js-risk-scanner/index.js ./Xxx.migrated.vue`。

### 10.5 现象：构建报 `__WIDGET_COMPONENT__` 无法解析

**原因**：包装插件通过 alias `__WIDGET_COMPONENT__` 指向真实组件路径，配置未生效。

**解决**：

- Vue CLI：`config.resolve.alias.set('__WIDGET_COMPONENT__', componentPath)`。
- Vite：`resolve.alias: { __WIDGET_COMPONENT__: componentPath }`。
- 确认 `component` 选项指向的路径存在（相对物料仓库根目录）。

---

## 十一、错误码速查表

`widget-loader` 抛出的错误带 `err.code` 字段，基座可据此做差异化处理：

| 错误码 | 含义 | 是否可重试 | 对应文案 key |
| --- | --- | --- | --- |
| `LOAD_TIMEOUT` | 资源加载超时（默认 15s） | 否（重试会加剧拥塞） | `loader.load_failed` |
| `SCRIPT_ERROR` | JS 脚本加载/执行失败 | 是（自动重试 3 次 + 指数退避） | `loader.load_failed` |
| `CSS_ERROR` | CSS 样式加载失败 | 是（自动重试 3 次 + 指数退避） | `loader.load_failed` |
| `DEP_VERSION_MISMATCH` | 公共依赖版本不兼容 | 否（确定性错误，占位无重试按钮） | `loader.version_mismatch` |
| `NOT_FOUND` | 物料 `name` / `js` 缺失 | 否（配置错误） | — |
| `ELEMENT_TIMEOUT` | Custom Element 注册超时（默认 5s） | 是 | `loader.mount_failed` |
| `PROPS_ERROR` | props 序列化失败（循环引用等） | 否（需修复数据） | `loader.props_serialize_failed` |

### 生命周期事件

基座可通过 `onWidgetLifecycle` 订阅以下事件做监控 / 埋点：

| 事件 | 触发时机 | payload |
| --- | --- | --- |
| `loading` | 开始加载物料 | `{ name, container, hostId }` |
| `loaded` | 物料挂载成功 | `{ name, element, container, hostId }` |
| `error` | 加载或运行时失败 | `{ name, error, container, hostId }` |
| `unmount` | 物料被卸载 | `{ name, element, container, hostId }` |

---

## 附：仍无法解决时

1. 开启调试日志复现问题：`localStorage.setItem('widget-loader-debug', 'true')`。
2. 收集以下信息：
   - 浏览器 Console 全部 `[widget-loader]` 日志与红色报错。
   - Network 面板中物料 JS/CSS 的请求状态与响应头。
   - `window.Vue2` / `window.Vue3` / `window.ELEMENT` / `window.__wcI18n__` 的存在性与版本。
   - 降级占位上的完整文案。
3. 对照本文档对应章节排查；若怀疑是 loader 本身 bug，可参考 [docs/code-review-fixes.md](docs/code-review-fixes.md) 了解已知问题与修复历史。
