# wc/vue3-esm

> **DEPRECATED** -- 本模块是早期实验性方案，与主 `widget-loader` 体系脱节（不走 checkDependencies 版本校验、
> widget-scope 软隔离、widget-context 上下文注入、i18n 国际化、错误边界/降级占位）。
> 新物料请使用主 `widget-loader` + `vue3-widget-template` 方案。本模块保留仅供历史参考，后续可能移除。

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
