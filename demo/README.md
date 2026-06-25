# 跨技术栈看板物料集成方案 —— 深入浅出

> 本文面向想深入学习本项目的同学，从问题背景、架构设计、核心难点到实现原理逐层展开。

---

## 一、项目要解决的问题

在一个大型组织里，BI 看板由多个业务板块组成，每个板块归属不同部门、不同代码仓，技术栈可能涵盖：

- Vue2 + ElementUI
- Vue3 + ElementPlus
- 原生 JavaScript / React / 其他框架

传统做法是：

1. **统一技术栈**：让所有部门重写一遍，成本高、周期长。
2. **微前端框架**（qiankun / micro-app）：应用级隔离太重，学习成本和改造成本高。

本方案走的是第三条路：

> **以 Web Components / Custom Elements 为统一封装层，把不同技术栈的板块物料变成标准 HTML 标签，基座按需加载、统一渲染。**

这样每个部门仍然用原来的技术栈开发，只需改造打包配置，业务代码基本零改动。

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                       看板基座 (Host)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 物料注册表    │  │ widget-loader │  │   widget-bus     │  │
│  │  (JSON)      │  │  加载 JS/CSS  │  │  跨栈事件通信    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Vue2 物料仓库  │    │ Vue3 物料仓库  │    │ 原生物料仓库   │
│  SalesPanel   │    │ FinancePanel  │    │  (未来扩展)    │
│  bi-sales-    │    │  bi-finance-  │    │               │
│    panel.js   │    │    panel.js   │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
```

核心模块：

| 模块 | 作用 |
|------|------|
| `widget-wrapper-plugin` | 自动把 Vue2/Vue3 组件包装成 Custom Element |
| `widget-loader` | 基座里按需加载 JS/CSS，注册 Custom Element |
| `widget-bus` | 基于原生 CustomEvent 的跨技术栈消息总线 |
| `schema-generator` | 扫描组件 props，自动生成 `schema.json` |
| `ai-assistant` | AI 辅助迁移旧组件、补充 schema 语义 |

---

## 三、核心难点与实现方案

### 3.1 难点一：不同 Vue 版本的组件如何变成同一个 HTML 标签？

#### 方案：Custom Element + 运行时包装

Web 标准提供了 `customElements.define('bi-sales-panel', Class)`，浏览器会把 `<bi-sales-panel>` 这个标签和我们定义的类关联起来。

问题：Vue2 组件和 Vue3 组件的生命周期、渲染 API 完全不同，不能直接注册。

解决：给每个组件写一个**薄包装层**。

**Vue2 包装层**

```js
import Vue from 'vue';
import wrap from '@vue/web-component-wrapper';
import Component from '__WIDGET_COMPONENT__';

// 把 Custom Element 接收到的 String 属性解析成 Object
function parseConfig(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

// 桥接组件：只负责类型转换
const BridgeComponent = {
  props: ['config'],
  render(h) {
    return h(Component, {
      props: { config: parseConfig(this.config) }
    });
  }
};

class WidgetElement extends wrap(Vue, BridgeComponent) {}
customElements.define('bi-sales-panel', WidgetElement);
```

`@vue/web-component-wrapper` 是 Vue 官方提供的工具，它会帮你处理：

- 组件生命周期映射到 Custom Element 生命周期
- 属性变化时通知 Vue 组件更新
- 组件销毁时自动卸载 Vue 实例

**Vue3 包装层**

Vue3 没有官方 wrapper，手动实现也很简单：

```js
import { createApp, h } from 'vue';
import Component from '__WIDGET_COMPONENT__';

class WidgetElement extends HTMLElement {
  connectedCallback() {
    const config = this.getAttribute('config');
    this.app = createApp({
      render: () => h(Component, { config: parseConfig(config) })
    });
    this.app.mount(this);
  }

  disconnectedCallback() {
    this.app?.unmount();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'config' && this.app) {
      this.app._instance.props.config = parseConfig(newValue);
    }
  }
}
```

#### 为什么不在业务组件里直接处理 Custom Element？

因为业务组件只需要关心它本来怎么写：

```vue
<script>
export default {
  props: {
    config: { type: Object, default: () => ({}) }
  }
};
</script>
```

包装层负责把外部世界的 `String` 转换成内部的 `Object`，业务组件完全无感知。

---

### 3.2 难点二：基座和物料的 Vue 版本不一致怎么办？

假设基座是 Vue2，物料是 Vue3。物料构建时 `import { createApp } from 'vue'`，运行时需要 Vue3 运行时；但基座只有 Vue2。

#### 方案：把 Vue 作为外部依赖，用独立全局变量名

在插件里把 `vue` 设为 `external`，并允许自定义全局名：

```js
// Vue2 物料
config.externals({ vue: 'Vue2', 'element-ui': 'ELEMENT' });

// Vue3 物料
rollupOptions: {
  external: ['vue', 'element-ui'],
  output: { globals: { vue: 'Vue3', 'element-ui': 'ELEMENT' } }
}
```

这样生成的 UMD 文件长这样：

```js
// bi-sales-panel.js (Vue2)
factory(root['Vue2'])

// bi-finance-panel.js (Vue3)
factory(root['Vue3'])
```

基座里同时暴露两个全局变量：

```js
// Vue2 基座
import Vue from 'vue';
window.Vue2 = Vue;
// 通过 CDN 加载 Vue3 并赋值给 window.Vue3
```

```js
// Vue3 基座
import * as Vue from 'vue';
window.Vue3 = Vue;
// 通过 CDN 加载 Vue2 并赋值给 window.Vue2
```

#### 关键点

- 物料不打包 Vue，只打包业务代码。
- 基座负责提供对应版本的 Vue 运行时。
- 不同物料使用不同全局名，互不干扰。

---

### 3.3 难点三：不同技术栈之间怎么通信？

Vue2 有自己的事件总线，Vue3 用 mitt / Pinia，原生 JS 用事件监听。混在一起怎么办？

#### 方案：基于原生 CustomEvent 的全局总线

```js
const GLOBAL_BUS_NAME = 'bi-widget-bus';

export function emit(type, payload) {
  window.dispatchEvent(new CustomEvent(`${GLOBAL_BUS_NAME}:${type}`, {
    detail: payload,
    bubbles: true,
    composed: true
  }));
}

export function on(type, handler) {
  const wrapped = e => handler(e.detail, e);
  window.addEventListener(`${GLOBAL_BUS_NAME}:${type}`, wrapped);
  return () => window.removeEventListener(`${GLOBAL_BUS_NAME}:${type}`, wrapped);
}
```

为什么用 `CustomEvent`？

1. **零依赖**：浏览器原生支持。
2. **跨框架**：Vue2/Vue3/原生 JS 都能监听和触发。
3. **可穿透 Shadow DOM**：`composed: true` 让事件能穿过 Shadow DOM 边界（虽然我们没开 Shadow DOM，但为将来预留）。

物料里这样监听：

```js
mounted() {
  if (window.widgetBus) {
    this._offBus = window.widgetBus.on('refresh-data', () => {
      // 刷新数据
    });
  }
}
```

基座里这样触发：

```js
emit('refresh-data', { source: 'vue2-host', timestamp: Date.now() });
```

---

### 3.4 难点四：物料如何按需加载和错误隔离？

基座不可能一开始就把所有部门的物料都打包进来，必须按看板配置按需加载。

#### 方案：`widget-loader`

```js
export async function loadWidget({ name, js, css }) {
  await Promise.all([loadScript(js), loadStyle(css)]);
  await waitForCustomElement(name);
}

export async function mountWidget(container, widget) {
  try {
    await loadWidget(widget);
    const el = document.createElement(widget.name);
    el.setAttribute('config', JSON.stringify(widget.config));
    container.appendChild(el);
  } catch (err) {
    container.innerHTML = `<div class="widget-error">物料加载失败: ${widget.name}</div>`;
    throw err;
  }
}
```

核心机制：

1. **URL 级缓存**：同一个 JS/CSS 只加载一次。
2. **等待注册**：通过轮询 `customElements.get(name)` 等待物料完成注册。
3. **错误占位**：加载失败时不阻断整个看板，显示友好错误提示。
4. **配置序列化**：把 Object 配置 JSON.stringify 后作为 `config` 属性传给 Custom Element。

---

### 3.5 难点五：配置表单怎么生成？

看板管理员需要拖拽物料、填写配置。每个物料有哪些配置项、类型、默认值，不能手写维护。

#### 方案：扫描组件 props 自动生成 schema.json

`schema-generator` 读取 `.vue` 文件，提取 `<script>` 里的 `props` 或 `defineProps`，生成：

```json
{
  "name": "bi-sales-panel",
  "title": "bi-sales-panel",
  "type": "object",
  "properties": {
    "config": {
      "type": "object",
      "default": {}
    }
  },
  "layout": {
    "defaultSize": { "w": 6, "h": 4 },
    "minSize": { "w": 3, "h": 2 }
  }
}
```

自动扫描能拿到：类型、默认值、是否必填。业务标题、描述、枚举值等语义信息需要 AI 或人工补充。

---

### 3.6 难点六：样式冲突怎么办？

如果两个物料都写了 `.title { color: red; }`，全局样式会互相覆盖。

#### 方案：CSS 命名空间 + scoped style

本方案**不开启 Shadow DOM**，因为 Shadow DOM 会把 ElementUI/ElementPlus 等全局样式也隔离掉，导致物料内部 UI 框架样式失效。

替代方案：

1. **强制根类名命名空间**：每个物料根节点用 `bi-xxx` 类名。
2. **scoped style**：Vue 的 `<style scoped>` 会自动给选择器加属性选择器，减少冲突。
3. **AI / 构建插件检查**：扫描 CSS，提示未加命名空间的选择器。

```vue
<style scoped>
.bi-sales-panel .title { /* 安全 */ }
.title { /* 可能冲突，会被警告 */ }
</style>
```

---

## 四、自动包装插件原理

### Vue CLI 插件

```js
module.exports = function widgetVueCliPlugin(options) {
  const { name, component, vueGlobal = 'Vue' } = options;

  return function chainWebpack(config) {
    // 1. 生成包装层临时文件
    const tmpFile = path.join(os.tmpdir(), `widget-wrapper-${name}.js`);
    fs.writeFileSync(tmpFile, generateVue2Wrapper(name, vueGlobal));

    // 2. 把入口替换成包装层
    config.entry('app').clear().add(tmpFile);

    // 3. 输出 UMD
    config.output
      .filename(`${name}.js`)
      .library(name)
      .libraryTarget('umd');

    // 4. 外部化 Vue
    config.externals({ vue: vueGlobal, 'element-ui': 'ELEMENT' });

    // 5. 把 __WIDGET_COMPONENT__ 指向真实组件
    config.resolve.alias.set('__WIDGET_COMPONENT__', componentPath);

    // 6. 生成 schema.json
    writeSchema(name, componentPath, path.join('dist', `${name}.schema.json`));
  };
};
```

### Vite 插件

思路相同，只是用 Vite 的 `config` hook 返回 `build.lib` 配置：

```js
export default function widgetVitePlugin(options) {
  return {
    name: 'widget-wrapper-plugin',
    config: () => ({
      build: {
        lib: {
          entry: tmpFile,
          name,
          fileName: () => `${name}.js`,
          formats: ['umd']
        },
        rollupOptions: {
          external: ['vue', 'element-ui'],
          output: { globals: { vue: vueGlobal, 'element-ui': 'ELEMENT' } }
        }
      },
      resolve: {
        alias: { __WIDGET_COMPONENT__: componentPath }
      }
    }),
    closeBundle() {
      writeSchema(name, componentPath, path.join('dist', `${name}.schema.json`));
    }
  };
}
```

---

## 五、demo 项目如何跑起来

### 5.1 独立开发物料

```bash
# Vue2 物料本地预览
 cd demo/vue2-widget-lib
 npm install
 npm run serve     # http://localhost:8080
 npm run build     # 产物在 dist/bi-sales-panel.js

# Vue3 物料本地预览
 cd demo/vue3-widget-lib
 npm install
 npm run serve     # http://localhost:5173
 npm run build     # 产物在 dist/bi-finance-panel.js + dist/bi-finance-panel.css
```

### 5.2 在基座里看效果

构建完物料后，把产物复制到基座的 `public/widgets`：

```bash
cp demo/vue2-widget-lib/dist/bi-sales-panel.js demo/vue2-host/public/widgets/
cp demo/vue3-widget-lib/dist/bi-finance-panel.js demo/vue2-host/public/widgets/
cp demo/vue3-widget-lib/dist/bi-finance-panel.css demo/vue2-host/public/widgets/
```

然后启动基座：

```bash
 cd demo/vue2-host
 npm install
 npm run serve     # http://localhost:8080
```

页面上会同时显示 Vue2 销售看板和 Vue3 财务看板，点击“刷新所有物料”能看到两个组件数据同步更新。

---

## 六、本地热调试方案（推荐开发模式）

手动 `build` + `cp` + 刷新页面的方式效率很低。我们已为插件、物料库和基座提供了一套本地热调试能力：修改物料源码后，watch 会自动重新构建，基座刷新页面即可看到最新效果，且浏览器 DevTools 能直接调试原始 `.vue` 文件。

### 6.1 已具备的调试能力

| 能力 | 实现位置 | 说明 |
|---|---|---|
| **Source Map** | `wc/widget-wrapper-plugin/vue-cli-plugin.js` / `vite-plugin.js` | Vue2 开启 `config.devtool('source-map')`，Vue3 开启 `build.sourcemap: true` |
| **物料热构建** | `demo/vue2-widget-lib/package.json` / `vue3-widget-lib/package.json` | `serve:widget` 以 watch 模式构建物料 |
| **本地静态服务** | `serve:dist` | 用 `npx serve` 在固定端口（8081 / 8082）提供 UMD 产物，并带 `--cors` |
| **环境感知注册表** | `demo/vue2-host/src/widgetRegistry.js` / `vue3-host/src/widgetRegistry.js` | 开发模式自动指向 `localhost:8081/8082`，生产环境回退到 `public/widgets` |
| **加载器调试日志** | `wc/widget-loader/index.js` | 通过 `localStorage.setItem('widget-loader-debug', 'true')` 开启详细日志 |

### 6.2 启动本地热调试

需要同时跑 4 个服务，建议开 4 个终端：

```bash
# 终端 1：Vue2 物料热构建（监听源码变化并写入 dist）
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

# 终端 5：启动基座（Vue2 或 Vue3 均可）
cd demo/vue2-host
npm run serve
```

打开基座地址（默认 `http://localhost:8080`），此时基座会从 `http://localhost:8081/bi-sales-panel.js` 和 `http://localhost:8082/bi-finance-panel.js` 加载物料。

### 6.3 开启加载器调试日志

在浏览器 DevTools Console 执行：

```js
localStorage.setItem('widget-loader-debug', 'true');
```

刷新页面后，Console 会输出 `[widget-loader]` 开头的详细日志，包括脚本/样式加载、Custom Element 注册等待、渲染过程等。调试结束后可关闭：

```js
localStorage.removeItem('widget-loader-debug');
```

### 6.4 在浏览器里调试物料源码

1. 打开 DevTools 的 **Sources** 面板。
2. 找到 `webpack://`（Vue2）或 `vite-project`（Vue3）下的原始 `.vue` 文件。
3. 在业务组件（如 `SalesPanel.vue` / `FinancePanel.vue`）里打断点，刷新页面即可命中。

因为物料构建时已生成 Source Map，断点会停在原始 Vue 单文件组件上，而不是压缩后的 UMD 代码。

### 6.5 修改源码后的刷新流程

1. 修改 `demo/vue2-widget-lib/src/components/SalesPanel.vue` 或 `demo/vue3-widget-lib/src/components/FinancePanel.vue`。
2. `serve:widget` 会自动重新构建，约 1~3 秒后 `dist/` 产物更新。
3. 在基座页面按 **Ctrl + F5**（或 DevTools Network 面板禁用缓存后刷新），即可看到最新效果。

> 注意：Custom Element 一旦注册不能重复注册，所以修改包装层代码后必须刷新整个页面，不能依赖热替换（HMR）。

### 6.6 常见问题

| 现象 | 可能原因 | 解决 |
|---|---|---|
| 基座报 `Failed to load script` | 物料静态服务未启动，或端口 8081/8082 被占用 | 检查 `serve:dist` 是否运行，必要时换端口 |
| 跨域错误 `CORS policy` | 静态服务没带 `--cors` | 使用 `npm run serve:dist`，它已经包含 `--cors` |
| 修改代码后页面没变化 | 浏览器缓存了旧 JS | 按 Ctrl + F5 或在 DevTools 中勾选 Disable cache |
| DevTools 看不到原始 `.vue` | Source Map 未生成 | 检查插件配置中 `sourcemap: true` / `devtool('source-map')` 是否生效 |
| 基座加载了 `public/widgets` 下的旧产物 | 注册表未识别为开发模式 | Vue2 基座检查 `process.env.NODE_ENV === 'development'`；Vue3 基座检查 `import.meta.env.DEV` |

---

## 七、扩展方向

1. **多入口打包**：一个仓库输出多个物料。
2. **TypeScript 组件支持**：在插件里解析 `.tsx` / `.vue` + `<script setup lang="ts">`。
3. **CSS 检查**：构建时扫描未加命名空间的选择器。
4. **性能优化**：预加载编辑态物料、分片公共业务逻辑。
5. **错误监控**：记录加载失败日志、支持重试。
6. **AI 深度集成**：自动迁移旧组件、自动补充 schema 业务语义。

---

## 八、总结

本方案的核心思想是：

> **用浏览器原生标准（Custom Elements）做统一接口，把框架差异关在包装层内部。**

相比微前端，它更轻量、改造成本更低；相比强制统一技术栈，它尊重了各部门的现有资产。主要代价是放弃了 Shadow DOM 的强样式隔离，需要通过 CSS 命名规范和构建时检查来弥补。

如果你想深入学习，建议按这个顺序阅读源码：

1. `wc/widget-wrapper-plugin/` —— 看包装层怎么生成
2. `wc/widget-loader/` —— 看基座怎么加载物料
3. `wc/widget-bus/` —— 看跨栈通信怎么实现
4. `wc/schema-generator/` —— 看 schema 怎么自动生成
5. `demo/*` —— 看完整跑通的例子
