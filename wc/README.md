# @wc/core

轻量物料运行时核心：UMD 加载 + `mount()` + 依赖检查。

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
import { mountWidget, unmountWidget, loadScript, preloadWidgets } from '@wc/core/loader';

// 加载并挂载物料
const api = await mountWidget(container, widgetConfig);

// 卸载物料
unmountWidget(api);

// 预加载物料脚本（不挂载）
preloadWidgets(['/widgets/finance-panel.js']);
```

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
