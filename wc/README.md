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
    js="/widgets/vue2-sales-panel.js"
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
  js: '/widgets/vue2-sales-panel.js',
  vueVersion: '2',
  props: { title: '销售' }
});

unmountWidget(api);
```

## 物料接入

### Vue3 物料

```js
import FinancePanel from './FinancePanel.vue';
import { createVue3Widget } from '@wc/core/templates/vue3';

export default createVue3Widget(FinancePanel);
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: './src/index.js',
      name: 'biFinancePanel',
      formats: ['umd'],
      fileName: () => 'widget.js'
    },
    rollupOptions: {
      external: ['vue', 'element-plus'],
      output: {
        globals: {
          vue: 'Vue3',
          'element-plus': 'ElementPlus'
        }
      }
    }
  }
});
```

### Vue2 物料

```js
import SalesPanel from './SalesPanel.vue';
import { createVue2Widget } from '@wc/core/templates/vue2';

export default createVue2Widget(SalesPanel);
```

### H5 物料

```js
import { createH5Widget } from '@wc/core/templates/h5';

function renderClock(container, props) {
  container.innerHTML = `<div>${props.title}</div>`;
}

export default createH5Widget(renderClock);
```
