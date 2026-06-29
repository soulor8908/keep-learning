# 跨技术栈 BI 看板物料集成

面向 2C 页面的轻量物料集成方案：通过 UMD + `mount()` 将 Vue2 / Vue3 / H5 物料以统一方式接入同一看板。

## 核心思路

依赖冲突的解决方案是 `external` + `globals` + 不同的全局变量名（`Vue2` / `Vue3`），不是 Custom Elements。新方案删除 CE 包装层，保留 UMD 加载和依赖隔离机制。

```
基座按需加载共享运行时（loader.ensureRuntimes）：
  window.Vue2           // Vue2 物料运行时（缺失时由 loader 拉取 /runtime/vue2.js）
  window.Vue3           // Vue3 物料运行时（缺失时由 loader 拉取 /runtime/vue3.js）
  window.ELEMENT        // element-ui（Vue2 物料声明 runtimeDeps: ['element-ui'] 时拉取）
  window.ElementPlus    // element-plus（Vue3 物料声明 runtimeDeps: ['element-plus'] 时拉取）

物料 UMD 构建（每个物料独立一个 UMD 文件）：
  external: ['vue']
  output.globals: { vue: 'Vue2' }  // 或 Vue3

基座加载：
  mountWidget(container, { name, js, css, vueVersion, runtimeDeps, props })

同栈物料优先走 ESM 直引（Vite 编译挂载，跳过 UMD 协议）：
  vue2-host 中的 Vue2 物料 → import SalesPanel from '.../SalesPanel.vue'
  h5-host   中的 H5   物料 → import { renderChart } from '.../ChartWidget.js'
```

## 目录

```
wc/
├── loader.js              # UMD 加载 + URL 缓存 + 依赖检查 + 错误降级 + 运行时按需加载
├── WidgetHost.vue         # Vue3 基座组件
├── templates/             # Vue2 / Vue3 / H5 物料入口模板
└── README.md

demo/
├── host/                  # 统一基座（Vue2 + Vue3 + H5 共存，端口 5000）
├── vue2-host/             # Vue2 单栈基座（同栈走 ESM，跨栈走 loader，端口 5001）
├── h5-host/               # H5 单栈基座（同栈走 ESM，跨栈走 loader，端口 5002）
├── vue2-widgets/          # Vue2 物料（每个物料独立 UMD）
│   ├── build.mjs          # 分包构建脚本
│   └── src/widgets/       # 各物料独立目录
├── vue3-widgets/          # Vue3 物料（每个物料独立 UMD）
│   ├── build.mjs
│   └── src/widgets/
└── h5-widgets/            # H5 物料（每个物料独立 UMD）
    ├── build.mjs
    └── src/widgets/
```

## 快速开始（本地开发）

```bash
# 安装根依赖（测试工具）
pnpm install

# 各物料仓库独立构建
cd demo/vue2-widgets && pnpm install && pnpm run build
cd demo/vue3-widgets && pnpm install && pnpm run build
cd demo/h5-widgets && pnpm install && pnpm run build

# 启动基座（指定物料产物目录）
cd demo/host
VITE_WIDGETS_DIRS="../vue2-widgets/dist,../vue3-widgets/dist,../h5-widgets/dist" pnpm run serve

# 启动 Vue2 单栈基座（端口 5001）
cd demo/vue2-host && pnpm install && pnpm serve

# 启动 H5 单栈基座（端口 5002）
cd demo/h5-host && pnpm install && pnpm serve
```

访问 http://localhost:5000，页面会同时展示 Vue2 / Vue3 / H5 三个物料。

## 开发

```bash
# 单元测试（根目录）
pnpm test:run

# 端到端测试（根目录）
pnpm e2e

# 单独预览物料（进入物料仓库）
cd demo/vue2-widgets && pnpm run serve
cd demo/vue3-widgets && pnpm run serve
cd demo/h5-widgets && pnpm run serve
```

## 多基座形态

| 基座 | 端口 | 同栈物料 | 跨栈物料 |
|------|------|----------|----------|
| `demo/host` | 5000 | — | Vue2/Vue3/H5 全部走 loader（UMD） |
| `demo/vue2-host` | 5001 | Vue2 物料 ESM 直引 | Vue3/H5 走 loader |
| `demo/h5-host` | 5002 | H5 物料 ESM 直引 | Vue2/Vue3 走 loader |

**为什么要多种基座**：实际业务里基座本身就是某种技术栈——Vue2 老页面、H5 营销页等。同栈物料没必要走 UMD 中转，ESM 直引更轻量；跨栈物料仍由 `loader` 统一加载，运行时按需补齐。

## 写一个物料

### 1. 创建物料目录（在物料仓库中）

```
src/widgets/my-widget/
├── index.js           # 物料入口
└── MyWidget.vue       # Vue 组件
```

### 2. 编写物料入口

```js
// src/widgets/my-widget/index.js
import MyWidget from './MyWidget.vue';
import { createVue3Widget } from '@wc/core/templates/vue3';

export default createVue3Widget(MyWidget, {
  plugins: window.ElementPlus ? [window.ElementPlus] : [],
  deps: ['element-plus']
});
```

### 3. 自动构建

在物料仓库中运行：

```bash
pnpm run build
```

`build.mjs` 会自动扫描 `src/widgets/` 下所有目录，无需额外配置。产物输出到 `dist/` 目录。

### 4. 在基座中加载

```vue
<WidgetHost
  name="my-widget"
  js="/widgets/my-widget.js"
  css="/widgets/my-widget.css"
  vue-version="3"
  :widget-props="{ title: '示例' }"
/>
```

### 命名规范

- 目录名：`my-widget`（kebab-case）
- UMD 全局名：`my-widget`（与目录名一致，不再做转换）
- 文件名：`my-widget.js` + `my-widget.css`
