# @wc/core

轻量物料运行时核心：UMD 加载 + `mount()` + 依赖检查 + 运行时按需加载。

## 安装

`@wc/core` 是 workspace 包，在 demo 子项目中直接依赖：

```json
{
  "devDependencies": {
    "@wc/core": "workspace:*"
  }
}
```

## 基座使用

```vue
<template>
  <WidgetHost
    name="sales-panel"
    js="/widgets/sales-panel.js"
    css="/widgets/sales-panel.css"
    vue-version="2"
    :widget-props="{ title: '销售' }"
    :context="baseContext"
  />
</template>

<script setup>
import WidgetHost from '@wc/core/WidgetHost.vue';

// 基座上下文，会被注入到所有物料的 props.context 中
const baseContext = { user: 'admin', theme: 'dark' };
</script>
```

或直接使用 JS API：

```js
import { mountWidget, unmountWidget } from '@wc/core/loader';

const api = await mountWidget(container, {
  name: 'sales-panel',
  js: '/widgets/sales-panel.js',
  css: '/widgets/sales-panel.css',
  vueVersion: '2',
  runtimeDeps: ['element-ui'],   // 声明后 loader 按需加载 element-ui 运行时
  context: { user: 'admin', theme: 'dark' },
  integrity: 'sha256-abc...',
  cssIntegrity: 'sha256-def...',
  props: { title: '销售' }
});

unmountWidget(api);
```

## WidgetHost 组件

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | String | 必填 | 物料全局变量名（如 `finance-panel`） |
| `js` | String | 必填 | UMD JS 文件路径 |
| `css` | String | `''` | CSS 文件路径（可选） |
| `vueVersion` | String | `'3'` | Vue 版本：`'2'` / `'3'` / `'none'` |
| `runtimeDeps` | Array | `[]` | 运行时依赖，如 `['element-ui']` / `['element-plus']`；loader 会按需加载对应运行时 |
| `widgetProps` | Object | `{}` | 传递给物料的 props |
| `context` | Object | `{}` | 基座上下文（用户、权限、主题等） |
| `integrity` | String | `''` | JS 文件 SRI hash |
| `cssIntegrity` | String | `''` | CSS 文件 SRI hash |
| `onBeforeMount` | Function | `null` | 挂载前回调 |
| `onMounted` | Function | `null` | 挂载后回调 |
| `onUnmounted` | Function | `null` | 卸载后回调 |

| 事件 | 说明 |
|------|------|
| `widget-event` | 物料触发的事件，携带 `{ widget, event, payload }` |

## 运行时按需加载

基座不再在 `index.html` 首屏全量注入 Vue2 / Vue3 / element-ui / element-plus。
`mountWidget` 在加载物料 UMD 之前，先调用 `ensureRuntimes` 按物料声明（`vueVersion` + `runtimeDeps`）补齐缺失的全局变量。

### 加载策略

| 物料声明 | loader 行为 |
|---------|------------|
| `vueVersion: '2'` | 检查 `window.Vue2`，缺失则加载 `/runtime/vue2.js` |
| `vueVersion: '3'` | 检查 `window.Vue3`，缺失则加载 `/runtime/vue3.js` |
| `vueVersion: 'none'` | 不加载任何 Vue 运行时（H5 物料） |
| `runtimeDeps: ['element-ui']` | 加载 element-ui（前置依赖 vue2 自动先加载） |
| `runtimeDeps: ['element-plus']` | 加载 element-plus（前置依赖 vue3 自动先加载） |

### URL 覆盖

默认运行时 URL 走 `/runtime/{name}.js`。基座可通过 `window.__WIDGET_RUNTIME_URLS__` 覆盖为自有 CDN：

```js
// 必须在 mountWidget 调用前设置
window.__WIDGET_RUNTIME_URLS__ = {
  vue3: { js: 'https://cdn.example.com/vue@3.4.21.js', globalVar: 'Vue3' },
  'element-plus': {
    js: 'https://cdn.example.com/element-plus@2.7.0.js',
    css: 'https://cdn.example.com/element-plus@2.7.0.css',
    globalVar: 'ElementPlus',
    requires: 'vue3'
  }
};
```

### 同栈物料的 ESM 直引

当物料与基座同属一个技术栈时（如 vue2-host 中的 Vue2 物料），无需走 UMD + loader，直接 ESM import 由 Vite 编译挂载，更轻量：

```js
// vue2-host/src/App.vue：同栈 Vue2 物料走 ESM，跨栈物料走 loader
import SalesPanel from '../../vue2-widgets/src/widgets/sales-panel/SalesPanel.vue';

// 同栈：ESM 直引
const app = new Vue({ render: (h) => h(SalesPanel, { props }) });
app.$mount(container);

// 跨栈：走 loader（loader 自动按需加载 Vue3 / element-plus 运行时）
await mountWidget(container, {
  name: 'biFinancePanel',
  js: '/widgets/finance-panel.js',
  vueVersion: '3',
  runtimeDeps: ['element-plus']
});
```

## 物料接入

### Vue3 物料

```js
// src/widgets/finance-panel/index.js
import FinancePanel from './FinancePanel.vue';
import { createVue3Widget } from '@wc/core/templates/vue3';

export default createVue3Widget(FinancePanel, {
  plugins: window.ElementPlus ? [window.ElementPlus] : [],
  deps: ['element-plus']
});
```

### Vue2 物料

```js
// src/widgets/sales-panel/index.js
import SalesPanel from './SalesPanel.vue';
import { createVue2Widget } from '@wc/core/templates/vue2';

export default createVue2Widget(SalesPanel, {
  deps: ['element-ui']
});
```

### H5 物料

```js
// src/widgets/clock-widget/index.js
import { renderClock } from './ClockWidget.js';
import { createH5Widget } from '@wc/core/templates/h5';

export default createH5Widget(renderClock);
```

## 分包构建

每个物料独立一个 UMD 文件，按需加载：

```
dist/
├── finance-panel.js    # 3.7 KB
├── finance-panel.css   # 0.5 KB
├── user-panel.js       # 3.3 KB
└── user-panel.css      # 0.4 KB
```

构建脚本 `build.mjs` 自动扫描 `src/widgets/` 目录，无需手动配置入口。

## Loader API

```js
import { mountWidget, unmountWidget, ensureRuntimes, loadScript, preloadWidgets } from '@wc/core/loader';

// 加载并挂载物料（mountWidget 内部已调用 ensureRuntimes，通常无需手动调用）
const api = await mountWidget(container, widgetConfig);

// 卸载物料
unmountWidget(api);

// 预加载物料脚本（不挂载）
preloadWidgets(['/widgets/finance-panel.js']);

// 手动预加载运行时（如首屏前预热 Vue3 + element-plus）
await ensureRuntimes({ vue3: true, elementPlus: true });
```

### `ensureRuntimes(needs)`

按需加载 Vue2 / Vue3 / element-ui / element-plus 运行时到 `window`。已存在的全局变量会被跳过，前置依赖自动解析（element-ui → vue2，element-plus → vue3）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `needs.vue2` | boolean | 加载 `window.Vue2`（若缺失） |
| `needs.vue3` | boolean | 加载 `window.Vue3`（若缺失） |
| `needs.elementUi` | boolean | 加载 `window.ELEMENT`（自动先加载 vue2） |
| `needs.elementPlus` | boolean | 加载 `window.ElementPlus`（自动先加载 vue3） |

`mountWidget` 已内置调用，业务侧仅在需要预热时手动调用。

## 跨物料通信（pub/sub）

每个物料通过 `props.emit` / `props.on` 进行跨物料通信，基于 `window.dispatchEvent`，无需额外依赖：

```js
// 物料 A（筛选器）
// 筛选条件改变时广播事件
props.emit('filterChanged', { region: 'CN', date: '2025-01' });

// 物料 B（图表）
// 监听筛选条件变化并刷新数据
const off = props.on('filterChanged', (data) => {
  fetchChartData(data);
});

// 组件卸载时取消监听
off();
```

## 基座上下文共享

基座通过 `context` 将用户、权限、主题等信息注入所有物料：

```js
// 基座
mountWidget(container, {
  name: 'sales-panel',
  context: { user: 'admin', role: 'editor', theme: 'dark' }
});

// 物料内读取
const { user, theme } = props.context;
```

## SRI 校验

通过 `integrity` / `cssIntegrity` 为 JS / CSS 文件开启 Subresource Integrity 校验：

```js
mountWidget(container, {
  name: 'sales-panel',
  js: '/widgets/sales-panel.js',
  css: '/widgets/sales-panel.css',
  integrity: 'sha256-abc...',
  cssIntegrity: 'sha256-def...'
});
```
