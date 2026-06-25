# vue3-widget-template

Vue3 物料组件自动包装层模板。`widget-wrapper.js` 负责把一个普通 Vue3 单文件组件包装成可被
`widget-loader` 跨技术栈加载的 Custom Element（light DOM，**不**使用 Shadow DOM）。

## 构建环境要求（重要）

`widget-wrapper.js` 在模块顶层使用了 `await import()`：

```js
// widget-wrapper.js（顶层 await）
const module = await import(/* @vite-ignore */ componentPath);
const Component = module.default;
customElements.define(widgetName, WidgetElement);
```

顶层 `await` 是 ES2022 的语法特性，要求构建工具支持将入口模块编译为支持顶层 await 的产物。
**这意味着：**

- ✅ **Vite**：开箱即用，build.lib 模式下顶层 await 会被正确处理（本目录 `vite.config.js` 即为参考配置）。
- ✅ **支持顶层 await 的打包器**（Rollup ≥ 3、esbuild、webpack 5 且 `experiments.topLevelAwait: true`、esbuild 等）。
- ⚠️ **Vue CLI（基于 webpack 4）默认不支持顶层 await**。若必须在 Vue CLI 环境下使用本模板，需要：
  - 升级到 webpack 5 并在 `vue.config.js` 中开启：
    ```js
    module.exports = {
      configureWebpack: {
        experiments: { topLevelAwait: true }
      }
    };
    ```
  - 或将 `build.target` 调整为 `'es2022'`（使打包器不降级顶层 await 语法）。
  - 或改写 `widget-wrapper.js`，把 `await import()` 移到 `connectedCallback` 内异步执行（不在此模板默认实现范围内，避免破坏与 Vite 的兼容性）。

> 注：本模板**不**修改 `widget-wrapper.js` 的顶层 await 实现以保持与 Vite 的最佳兼容。
> 若你的宿主环境不支持顶层 await，请按上述方案调整构建配置或自行改造包装层。

## 用法

1. 设置环境变量指定物料名与业务组件入口：

   ```bash
   VITE_WIDGET_NAME=bi-finance-panel \
   VITE_WIDGET_COMPONENT=./example/FinancePanel.vue \
   npx vite build
   ```

2. 构建产物为 UMD 格式的单文件 JS（外部化 `vue` 与 `element-plus`，由宿主提供）。

3. 宿主通过 `widget-loader` 的 `mountWidget(container, { name, js, css })` 加载并挂载。

## 架构约束

- **禁止 Shadow DOM**：不要改用 `defineCustomElement()` 或 `attachShadow()`，否则 ElementPlus
  全局样式 / 主题变量 / 字体图标无法穿透。`connectedCallback` 内有运行时守卫会在检测到
  `shadowRoot` 时 `console.error` 告警。
- `widget-wrapper.js` 通过构建工具 `define` 注入的全局变量 `__WIDGET_NAME__` /
  `__WIDGET_COMPONENT__` 定位业务组件，不依赖 `import.meta.env`，便于被 webpack 等工具处理。
