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
    name="biSalesPanel"
    js="/widgets/sales-panel.js"
    css="/widgets/sales-panel.css"
    vue-version="2"
    :widget-props="{ title: '销售' }"
  />
</template>

<script setup>
import WidgetHost from '@wc/core/WidgetHost.vue';
</script>
```

或直接使用 JS API：

```js
import { mountWidget, unmountWidget } from '@wc/core/loader';

const api = await mountWidget(container, {
  name: 'biSalesPanel',
  js: '/widgets/sales-panel.js',
  css: '/widgets/sales-panel.css',
  vueVersion: '2',
  props: { title: '销售' }
});

unmountWidget(api);
```

## WidgetHost 组件

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | String | 必填 | 物料全局变量名（如 `biFinancePanel`） |
| `js` | String | 必填 | UMD JS 文件路径 |
| `css` | String | `''` | CSS 文件路径（可选） |
| `vueVersion` | String | `'3'` | Vue 版本：`'2'` / `'3'` / `'none'` |
| `widgetProps` | Object | `{}` | 传递给物料的 props |
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
  plugins: window.ELEMENT ? [window.ELEMENT] : [],
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
