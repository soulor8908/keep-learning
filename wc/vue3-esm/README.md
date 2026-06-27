# wc/vue3-esm

> **轻量方案** -- 基于 ES Module import() 的 Vue3 物料加载方案，无 Custom Elements、无版本契约、无 scope 软隔离。
> 适用于纯 Vue3 场景，追求极致轻量和性能。如需支持 Vue2 或需要 CE 样式隔离，请使用 `widget-loader` 方案。

## 方案对比

| 特性 | vue3-esm (本方案) | widget-loader |
|------|-------------------|---------------|
| 代码量 | ~57 行 | ~792 行 |
| Vue2 支持 | 不支持 | 支持 |
| Vue3 支持 | 支持 | 支持 |
| H5 支持 | 支持 | 支持 |
| 加载方式 | ES Module import() | Custom Elements |
| 物料自带 Vue | 是（通过 import map） | 否（基座提供） |
| scope 软隔离 | 无 | 有 |
| i18n 集成 | 通过 props | 内置 |
| 样式隔离 | Vue scoped style | postcss-namespace |
| 学习成本 | 低 | 中 |

## 核心文件

- `loader.js` —— `import()` + URL 缓存 + 错误降级，同时支持 Vue 组件和 `{ mount }` 对象
- `WidgetHost.vue` —— 基座渲染组件
- `h5-wrapper.js` —— 原生 H5 物料转 `{ mount }` 对象的 helper

## 物料开发

### Vue3 物料

```js
// src/index.js
export { default } from './Widget.vue';
```

```vue
<!-- src/Widget.vue -->
<script setup>
const props = defineProps({ title: String });
</script>
<template>
  <div class="my-widget">{{ title }}</div>
</template>
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: { entry: './src/index.js', formats: ['es'], fileName: () => 'widget.js' },
    rollupOptions: { external: ['vue'] }
  }
});
```

### H5 物料

```js
// src/index.js
import { createH5Widget } from 'wc/vue3-esm/h5-wrapper.js';

export default createH5Widget((container, props) => {
  container.innerHTML = `<div class="h5-widget">${props.title || ''}</div>`;
});
```

## 基座接入

```vue
<script setup>
import WidgetHost from 'wc/vue3-esm/WidgetHost.js';
</script>
<template>
  <WidgetHost url="https://cdn.example.com/widget.js" :widgetProps="{ title: 'Hello' }" />
</template>
```

HTML 中需要配置 import map 共享 `vue`：

```html
<script type="importmap">
{
  "imports": {
    "vue": "https://cdn.example.com/vue@3.5.esm-browser.js"
  }
}
</script>
```

## 通信 / i18n

基座通过 `widgetProps` 直接传入 `bus`（mitt 实例）、`t`（vue-i18n 函数）等，物料像普通 Vue 组件一样使用 props。
