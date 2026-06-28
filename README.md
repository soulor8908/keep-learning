# 跨技术栈 BI 看板物料集成

面向 2C 页面的轻量物料集成方案：通过 UMD + `mount()` 将 Vue2 / Vue3 / H5 物料以统一方式接入同一看板。

## 核心思路

依赖冲突的解决方案是 `external` + `globals` + 不同的全局变量名（`Vue2` / `Vue3`），不是 Custom Elements。新方案删除 CE 包装层，保留 UMD 加载和依赖隔离机制。

```
基座加载共享运行时：
  window.Vue2 = Vue2      // 给 Vue2 物料
  window.Vue3 = Vue3      // 给 Vue3 物料
  window.ElementPlus = ElementPlus
  window._ = lodash
  ...

物料 UMD 构建：
  external: ['vue']
  output.globals: { vue: 'Vue2' }  // 或 Vue3

基座加载：
  mountWidget(container, { name, js, vueVersion, props })
```

## 目录

```
wc/
├── loader.js              # UMD 加载 + URL 缓存 + 依赖检查 + 错误降级
├── WidgetHost.vue         # Vue3 基座组件
├── templates/             # Vue2 / Vue3 / H5 物料入口模板
└── README.md

demo/
├── host/                  # 新基座（同时加载 Vue2 + Vue3 运行时）
├── vue2-widget/           # Vue2 物料示例
├── vue3-widget/           # Vue3 物料示例
└── h5-widget/             # H5 物料示例
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建所有物料
pnpm build:widgets

# 启动基座
pnpm serve
```

访问 http://localhost:5000，页面会同时展示 Vue2 / Vue3 / H5 三个物料。

## 开发

```bash
# 一键启动：构建物料 + watch + host
pnpm dev

# 单独预览某个物料
pnpm dev:widget:vue2
pnpm dev:widget:vue3
pnpm dev:widget:h5
```

## 测试

```bash
# 单元测试
pnpm test:run

# 端到端测试
pnpm e2e
```

## 写一个物料

Vue3 示例：

```js
// demo/my-widget/src/index.js
import MyComponent from './MyComponent.vue';
import { createVue3Widget } from '@wc/core/templates/vue3';

export default createVue3Widget(MyComponent);
```

```js
// demo/my-widget/vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: './src/index.js',
      name: 'myWidget',
      formats: ['umd'],
      fileName: () => 'widget.js'
    },
    rollupOptions: {
      external: ['vue'],
      output: { globals: { vue: 'Vue3' } }
    }
  }
});
```

在基座中加载：

```vue
<WidgetHost
  name="myWidget"
  js="/widgets/my-widget.js"
  vue-version="3"
  :widget-props="{ title: '示例' }"
/>
```
