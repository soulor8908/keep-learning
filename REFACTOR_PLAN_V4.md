# 卡帕西式整改计划 v4（Vue2 + Vue3 + H5，共享依赖，多基座隔离，2C 性能优先）

> 核心发现：依赖冲突不是 Custom Elements 解决的。解决依赖冲突的是 `external` + `globals` + 版本检查。Custom Elements 只是给了你一个 `<tag>` 标签，但标签内部的 Vue 实例照样读的是 `window` 上的全局变量。新方案保留依赖冲突的解决方案，删除的是 CE 包装层。

---

## 一、用户提出的新约束

1. **2C 页面，体积敏感** → 共享依赖是刚需（UMD + external）
2. **H5/Vue2/Vue3 物料可能在不同基座中使用** → 需要解决依赖冲突
3. **不同基座可能同时存在于一个页面** → Vue2 基座和 Vue3 基座可能共存

## 二、关键认知：依赖冲突和 Custom Elements 是两回事

### 2.1 当前方案如何解决依赖冲突

```
SUPPORTED_DEPS = {
  vue2: { globalVar: 'Vue2', version: '2.6.14', compatibleRange: '^2.6.0' },
  vue3: { globalVar: 'Vue3', version: '3.4.21', compatibleRange: '^3.0.0' },
  lodash: { globalVar: '_', version: '4.17.21', compatibleRange: '^4.17.0' },
  axios: { globalVar: 'axios', version: '1.7.7', compatibleRange: '^1.0.0' }
}
```

**真正解决依赖冲突的是这四样东西：**

| 机制 | 作用 | 新方案是否保留 |
|------|------|--------------|
| `external: ['vue']` | 物料不打包 Vue，从外部读取 | ✅ 保留 |
| `output.globals: { vue: 'Vue2' }` | Vue2 物料读 `window.Vue2` | ✅ 保留 |
| `output.globals: { vue: 'Vue3' }` | Vue3 物料读 `window.Vue3` | ✅ 保留 |
| `checkDependencies()` | 检查基座是否提供了对应版本 | ✅ 保留（简化） |

**Custom Elements 完全没有参与依赖冲突的解决。**

### 2.2 如果不用 Custom Elements，依赖冲突会恶化吗？

**不会。因为依赖冲突的解决和 Custom Elements 无关。**

```
// 当前方案：UMD 加载 → CE 注册 → 创建 <tag> → Vue 实例读 window.Vue2
//                         ↑ 这一段完全无关
// 新方案：UMD 加载 → 直接调用 mount() → Vue 实例读 window.Vue2
//              两者都读 window.Vue2，没有区别
```

**Vue2 物料和 Vue3 物料在同一个页面中如何共存？**

```
基座加载：
  window.Vue2 = Vue2  // 给 Vue2 物料用
  window.Vue3 = Vue3  // 给 Vue3 物料用

Vue2 物料打包：
  external: ['vue']
  output.globals: { vue: 'Vue2' }  // 运行时读 window.Vue2

Vue3 物料打包：
  external: ['vue']
  output.globals: { vue: 'Vue3' }  // 运行时读 window.Vue3

结果：两者各读各的，互不干扰。这不需要 Custom Elements。
```

### 2.3 真正需要解决的是什么

| 问题 | 是否需要 Custom Elements | 实际解决方案 |
|------|------------------------|-----------|
| Vue2 和 Vue3 运行时冲突 | ❌ 不需要 | 不同的全局变量名（Vue2/Vue3） |
| 基座是否提供了 Vue 运行时 | ❌ 不需要 | 加载前检查 `window.Vue2`/`window.Vue3` |
| 版本兼容性 | ❌ 不需要 | 简单版本检查（不需要 semver） |
| 样式冲突 | ❌ 不需要 | Vue scoped style |
| 在 DOM 中挂载和卸载 | ❌ 不需要 | 直接操作 container.innerHTML |
| 属性传递 | ❌ 不需要 | 直接传 JS 对象 |
| 错误捕获 | ❌ 不需要 | try/catch + Vue errorHandler |

---

## 三、新方案：UMD + mount() + 依赖隔离

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                              页面（浏览器）                            │
│                                                                      │
│  window.Vue2 = Vue2  ──────────────┐                                 │
│  window.Vue3 = Vue3  ──────────────┤                                 │
│  window.ElementPlus = ElementPlus  ├─ 基座加载共享运行时               │
│  window.ELEMENT = ElementUI        │                                 │
│  window.axios = axios              │                                 │
│  window._ = lodash                 │                                 │
│                                      │                                 │
│  ┌─────────────────────┐             │                                 │
│  │  Vue2 基座区域       │             │                                 │
│  │  (Vue2 运行时)       │             │                                 │
│  │                     │             │                                 │
│  │  loadScript(url) ───┼─────────────┘                                 │
│  │  window[widgetName].mount(container, props)                          │
│  │  → new Vue({ render: h => h(Component, { props }) })              │
│  │  → 内部读 window.Vue2（正确版本）                                  │
│  └─────────────────────┘                                              │
│                                                                      │
│  ┌─────────────────────┐                                              │
│  │  Vue3 基座区域       │                                              │
│  │  (Vue3 运行时)       │                                              │
│  │                     │                                              │
│  │  loadScript(url) ───┼─── window.Vue3                               │
│  │  window[widgetName].mount(container, props)                          │
│  │  → createApp({ render: () => h(Component, props) })               │
│  │  → 内部读 window.Vue3（正确版本）                                   │
│  └─────────────────────┘                                              │
│                                                                      │
│  ┌─────────────────────┐                                              │
│  │  H5 基座区域         │                                              │
│  │  (无框架)            │                                              │
│  │                     │                                              │
│  │  loadScript(url) ───┼─── 不依赖 Vue                                │
│  │  window[widgetName].mount(container, props)                          │
│  │  → container.innerHTML = ...                                        │
│  └─────────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 为什么这种隔离比 Custom Elements 更直接

当前方案中，即使用了 Custom Elements，隔离也不是 CE 提供的：

```js
// 当前方案：Vue2 物料的 CE 包装
class WidgetElement extends HTMLElement {
  connectedCallback() {
    // 这里读的还是 window.Vue2，和 CE 无关
    this.vm = new Vue({ render: h => h(Component, { props }) });
  }
}

// 新方案：直接 mount
export default {
  mount(container, props) {
    // 这里读的也是 window.Vue2，和 CE 无关
    const app = new Vue({ render: h => h(Component, { props }) });
    app.$mount(container);
  }
};
```

**两者的依赖隔离机制完全一样：都是 `external` + `globals` + `window` 全局变量。CE 只是加了一层不必要的包装。**

---

## 四、新 loader 代码（保留依赖检查，删除 CE）

```js
// wc/loader.js —— 100 行
// 保留：UMD 加载、URL 缓存、版本检查、降级占位
// 删除：CE 注册、属性序列化、waitForCustomElement、全局错误归因

const cache = new Map();

// 简化的版本检查：只检查是否存在，不需要 semver 解析
function checkDeps(widget) {
  const { name, vueVersion = '2' } = widget;
  const errors = [];

  if (vueVersion === '2' && typeof window.Vue2 === 'undefined') {
    errors.push(`Vue2 运行时未加载（window.Vue2 不存在）`);
  }
  if (vueVersion === '3' && typeof window.Vue3 === 'undefined') {
    errors.push(`Vue3 运行时未加载（window.Vue3 不存在）`);
  }
  // 可选：检查第三方依赖
  if (Array.isArray(widget.runtimeDeps)) {
    for (const dep of widget.runtimeDeps) {
      const g = dep === 'lodash' ? '_' : dep === 'axios' ? 'axios' : dep;
      if (!window[g]) errors.push(`${dep} 运行时未加载（window.${g} 不存在）`);
    }
  }
  if (errors.length) {
    const err = new Error(`物料 ${name} 依赖缺失：\n  - ${errors.join('\n  - ')}`);
    err.code = 'DEP_MISSING';
    throw err;
  }
}

// 加载 JS（URL 级缓存，避免重复加载）
function loadScript(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`加载失败: ${url}`));
    document.head.appendChild(s);
  });
  cache.set(url, p);
  return p;
}

// 加载 CSS
function loadStyle(url) {
  if (!url) return Promise.resolve();
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    l.onload = resolve;
    l.onerror = () => reject(new Error(`CSS 加载失败: ${url}`));
    document.head.appendChild(l);
  });
  cache.set(url, p);
  return p;
}

// 降级占位
function renderError(container, message, onRetry) {
  container.innerHTML = `
    <div class="widget-error" style="padding:12px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;color:#b91c1c;font-size:13px">
      <div>${message}</div>
      ${onRetry ? `<button onclick="this.closest('.widget-error').remove();(${onRetry.toString()})()" style="margin-top:10px;padding:5px 16px;border:1px solid #3b82f6;border-radius:4px;background:#3b82f6;color:#fff;cursor:pointer">重试</button>` : ''}
    </div>
  `;
}

// 加载并挂载物料
export async function mountWidget(container, widget) {
  try {
    // 1. 检查依赖（5 行替代 130 行 semver）
    checkDeps(widget);
    // 2. 加载 JS/CSS（URL 缓存）
    await Promise.all([loadScript(widget.js), loadStyle(widget.css)]);
    // 3. 获取模块（UMD 挂载到 window[widgetName]）
    const mod = window[widget.name];
    if (!mod || typeof mod.mount !== 'function') {
      throw new Error(`物料 ${widget.name} 未导出 mount 方法`);
    }
    // 4. 调用 mount（直接传 JS 对象，不需要序列化）
    return mod.mount(container, widget.props || {});
  } catch (err) {
    console.error(`[widget] ${widget.name} 加载失败:`, err);
    renderError(container, err.message, widget.retryable !== false ? () => mountWidget(container, widget) : null);
    return { unmount: () => {} };
  }
}

export function unmountWidget(api) {
  if (api && typeof api.unmount === 'function') api.unmount();
}
```

**为什么不需要 792 行的 loader：**

| 删除的内容 | 原因 |
|-----------|------|
| `SUPPORTED_DEPS` + semver 解析器（~130 行） | 不需要精确版本匹配，只检查全局变量是否存在 |
| `waitForCustomElement`（~50 行） | 不需要 CE 注册等待 |
| `renderFallback` 的复杂 DOM 操作（~50 行） | 简单的 innerHTML 足够 |
| `WidgetError` 枚举（~20 行） | 直接 throw Error |
| `ensureBaseReady` 的复杂自检（~50 行） | 加载时检查即可 |
| `injectContext`（~20 行） | 通过 props 传入 |
| `camelToKebab`（~20 行） | 不需要属性序列化 |
| `renderWidget` 的属性序列化（~80 行） | 直接传 JS 对象 |
| `attributeErrorToWidget`（~50 行） | 不需要 CE 全局错误归因 |
| `ensureGlobalErrorListener`（~60 行） | Vue errorHandler 足够 |
| `emitLifecycle` / `onWidgetLifecycle`（~40 行） | 不需要生命周期钩子 |
| `mountWithFallback` 的 retry 逻辑（~30 行） | 简单 catch 即可 |
| `unloadWidget` 的节点清理（~50 行） | 简单 removeChild |
| `preloadWidgets` 的 requestIdleCallback（~80 行） | 按需加载即可 |
| `loadWidgets` 的并发控制（~30 行） | 浏览器 HTTP 连接池自动处理 |

### 4.2 基座 Vue 组件（25 行）

```vue
<!-- wc/WidgetHost.vue -->
<template>
  <div ref="el" class="widget-host" />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { mountWidget, unmountWidget } from './loader.js';

const props = defineProps({
  url: String,
  name: String,
  vueVersion: String,
  widgetProps: Object
});

const el = ref();
let api = null;

onMounted(async () => {
  api = await mountWidget(el.value, {
    name: props.name,
    js: props.url,
    vueVersion: props.vueVersion,
    props: props.widgetProps
  });
});

onUnmounted(() => unmountWidget(api));
</script>
```

### 4.3 Vue2 物料入口（5 行）

```js
// src/index.js —— 物料直接导出 mount
import Vue from 'vue';  // 运行时从 window.Vue2 读取（UMD external）
import Component from './Widget.vue';

export default {
  mount(container, props) {
    const app = new Vue({ render: h => h(Component, { props }) });
    app.$mount(container);
    return { unmount: () => app.$destroy() };
  }
};
```

### 4.4 Vue3 物料入口（5 行）

```js
// src/index.js —— 物料直接导出 mount
import { createApp, h } from 'vue';  // 运行时从 window.Vue3 读取（UMD external）
import Component from './Widget.vue';

export default {
  mount(container, props) {
    const app = createApp({ render: () => h(Component, props) });
    app.mount(container);
    return { unmount: () => app.unmount() };
  }
};
```

### 4.5 H5 物料入口（5 行）

```js
// index.js —— 纯 JS，不依赖 Vue
export default {
  mount(container, props) {
    container.innerHTML = `<div class="h5-widget">${props.title || ''}</div>`;
    return { unmount: () => container.innerHTML = '' };
  }
};
```

---

## 五、多基座隔离的完整实现

### 5.1 场景：一个页面中同时有 Vue2 和 Vue3 区域

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 基座加载 Vue2 运行时（给 Vue2 物料使用） -->
  <script src="https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.min.js"></script>
  <script>window.Vue2 = Vue;</script>
  
  <!-- 基座加载 Vue3 运行时（给 Vue3 物料使用） -->
  <script src="https://cdn.jsdelivr.net/npm/vue@3.4.21/dist/vue.global.min.js"></script>
  <script>window.Vue3 = Vue3;</script>
  
  <!-- 基座加载 ElementUI（Vue2 使用） -->
  <script src="https://cdn.jsdelivr.net/npm/element-ui@2.15.14/lib/index.js"></script>
  <script>window.ELEMENT = ELEMENT;</script>
  
  <!-- 基座加载 ElementPlus（Vue3 使用） -->
  <script src="https://cdn.jsdelivr.net/npm/element-plus@2.7.0/dist/index.full.min.js"></script>
  <script>window.ElementPlus = ElementPlus;</script>
</head>
<body>
  <!-- Vue2 区域 -->
  <div id="vue2-area">
    <h3>Vue2 看板</h3>
    <div id="vue2-widget1"></div>
  </div>
  
  <!-- Vue3 区域 -->
  <div id="vue3-area">
    <h3>Vue3 看板</h3>
    <div id="vue3-widget1"></div>
  </div>
  
  <!-- H5 区域 -->
  <div id="h5-area">
    <h3>H5 看板</h3>
    <div id="h5-widget1"></div>
  </div>

  <script type="module">
    import { mountWidget } from './wc/loader.js';
    
    // Vue2 区域加载 Vue2 物料
    mountWidget(document.getElementById('vue2-widget1'), {
      name: 'biSalesPanel',
      js: '/widgets/vue2-sales.js',
      vueVersion: '2',
      props: { title: '销售' }
    });
    
    // Vue3 区域加载 Vue3 物料
    mountWidget(document.getElementById('vue3-widget1'), {
      name: 'biFinancePanel',
      js: '/widgets/vue3-finance.js',
      vueVersion: '3',
      props: { title: '财务' }
    });
    
    // H5 区域加载 H5 物料
    mountWidget(document.getElementById('h5-widget1'), {
      name: 'biClock',
      js: '/widgets/h5-clock.js',
      vueVersion: 'none',
      props: { title: '时钟' }
    });
  </script>
</body>
</html>
```

### 5.2 物料打包配置（Vue2）

```js
// vite.config.js
import { defineConfig } from 'vite';
import vue2 from 'vite-plugin-vue2';

export default defineConfig({
  plugins: [vue2()],
  build: {
    lib: {
      entry: './src/index.js',
      name: 'biSalesPanel',  // UMD 全局变量名
      formats: ['umd'],
      fileName: () => 'widget.js'
    },
    rollupOptions: {
      // external 共享依赖，运行时从 window 读取
      external: ['vue', 'element-ui'],
      output: {
        globals: {
          vue: 'Vue2',        // 运行时读 window.Vue2
          'element-ui': 'ELEMENT'  // 运行时读 window.ELEMENT
        }
      }
    }
  }
});
```

### 5.3 物料打包配置（Vue3）

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
          vue: 'Vue3',              // 运行时读 window.Vue3
          'element-plus': 'ElementPlus'  // 运行时读 window.ElementPlus
        }
      }
    }
  }
});
```

### 5.4 依赖隔离机制总结

| 依赖 | Vue2 物料 | Vue3 物料 | H5 物料 |
|------|-----------|-----------|---------|
| Vue 运行时 | `window.Vue2` | `window.Vue3` | 不需要 |
| UI 库 | `window.ELEMENT` | `window.ElementPlus` | 不需要 |
| axios | `window.axios` | `window.axios` | `window.axios` |
| lodash | `window._` | `window._` | `window._` |

**隔离机制：不同技术栈的物料读取不同的全局变量名，天然隔离。**

---

## 六、版本检查（简化）

当前方案用了 130 行自己写 semver 解析器。但在这个场景下，**只需要检查全局变量是否存在**，不需要精确版本匹配：

```js
// 新方案：5 行替代 130 行
function checkDeps(widget) {
  const { name, vueVersion = '2' } = widget;
  const errors = [];
  if (vueVersion === '2' && !window.Vue2) errors.push('Vue2 未加载');
  if (vueVersion === '3' && !window.Vue3) errors.push('Vue3 未加载');
  if (errors.length) throw new Error(`物料 ${name} 依赖缺失：${errors.join(', ')}`);
}
```

**为什么不需要 semver：**
- 基座和物料都是同一团队维护的
- 基座升级 Vue 版本时，同时升级所有物料
- 不需要支持"基座 Vue 3.3，物料要求 Vue 3.4"这种跨版本兼容
- 如果确实需要版本检查，可以用 `window.Vue3.version` 做简单字符串比较

---

## 七、删除清单（最终版）

| 模块 | 行数 | 操作 | 原因 |
|------|------|------|------|
| `widget-loader/index.js` | ~792 | **重写** | 792 → 100 行，保留 UMD 加载 + 缓存 + 版本检查，删除 CE 相关 |
| `widget-loader/index.d.ts` | ~50 | **删除** | 不需要 |
| `widget-wrapper-plugin/vue-cli-plugin.js` | ~365 | **删除** | 不需要生成 CE wrapper 的 webpack 插件 |
| `widget-wrapper-plugin/vite-plugin.js` | ~394 | **删除** | 不需要生成 CE wrapper 的 vite 插件 |
| `widget-wrapper-plugin/h5-vite-plugin.js` | ~? | **删除** | 不需要 CE wrapper 插件 |
| `widget-wrapper-plugin/postcss-namespace.js` | ~157 | **删除** | Vue scoped style 替代 |
| `widget-bus/index.js` | ~164 | **删除** | 用 mitt + props 替代 |
| `widget-bus/index.d.ts` | ~20 | **删除** | 不需要 |
| `widget-context/index.js` | ~317 | **删除** | 直接 props 传递 |
| `widget-context/index.d.ts` | ~20 | **删除** | 不需要 |
| `widget-declarative-plugin/` | ~130 | **删除** | 不需要 babel/vite 插件 |
| `widget-scope/index.js` | ~379 | **删除** | 拆成独立 props |
| `widget-scope/index.d.ts` | ~20 | **删除** | 不需要 |
| `widget-registry/index.js` | ~? | **删除** | 不需要 |
| `widget-page/index.js` | ~? | **删除** | 不需要 |
| `i18n/index.js` | ~192 | **删除** | 用 vue-i18n 通过 props 传入 |
| `i18n/locales/` | ~50 | **删除** | 不需要 |
| `schema-generator/index.js` | ~843 | **删除** | 手写 schema |
| `vue2-widget-template/widget-wrapper.js` | ~168 | **重写** | 168 → 5 行（mount 函数） |
| `vue3-widget-template/widget-wrapper.js` | ~204 | **重写** | 204 → 5 行（mount 函数） |
| `h5-widget-template/widget-wrapper.js` | ~235 | **重写** | 235 → 5 行（mount 函数） |
| `ai-assistant/` | ~完整 | **删除** | 不需要 |
| `css-namespace-checker/` | ~完整 | **删除** | Vue scoped style 替代 |
| `js-risk-scanner/` | ~完整 | **删除** | 正常 Vue 组件 |
| `scoped-style-checker/` | ~完整 | **删除** | Vue 编译器自带 |
| `dependency-analyzer/` | ~完整 | **删除** | 不需要 |
| `migration-skill/` | ~完整 | **删除** | 不需要 |
| `ai-schema-enricher/` | ~完整 | **删除** | 手写 schema |
| `devtools-extension/` | ~完整 | **删除** | console.log 足够 |
| `ARCHITECTURE_COMPARISON.md` | ~298 | **删除** | 不需要 |
| `README.md` | ~628 | **重写** | 50 行快速开始 |

**保留：**
```
wc/
├── loader.js              # 100 行：UMD 加载 + URL 缓存 + 依赖检查 + 错误降级
├── WidgetHost.vue         # 25 行：基座 Vue 组件
├── README.md              # 50 行
└── templates/
    ├── vue2.js            # 5 行：Vue2 物料 mount 模板
    ├── vue3.js            # 5 行：Vue3 物料 mount 模板
    └── h5.js              # 5 行：H5 物料 mount 模板
```

**总计：~190 行运行时代码（vs 当前 17,630 行）→ 缩减 92 倍**

---

## 八、鲁棒性论证（最终版）

| 场景 | 当前方案 | 新方案 | 为什么新方案更鲁棒 |
|------|----------|--------|------------------|
| 多基座依赖隔离 | `Vue2`/`Vue3` 全局变量 + CE 包装 | `Vue2`/`Vue3` 全局变量 + 直接 mount | 隔离机制相同，但代码少 100 倍 |
| 版本不匹配 | 自己写 semver 解析（130 行） | 检查全局变量是否存在（5 行） | 简单到不会出错 |
| 加载失败 | 10 层 try/catch + 降级 + 重试 | 简单 catch + 降级 | 简单到不会出错 |
| 运行时崩溃 | 全局 error 事件 + 堆栈字符串匹配 | Vue errorHandler / try/catch | Vue 精确到组件 |
| 样式冲突 | PostCSS 命名空间 + CSS 检查 | Vue scoped style | 编译器保证隔离 |
| 属性序列化 | JSON.stringify 循环引用检测 | 直接传 JS 对象 | 不需要序列化 |
| 缓存失效 | 3 个 Map + resourceNodes | 1 个 Map | 简单到不会出错 |
| 物料接入成本 | 安装 wrapper-plugin + 改配置 | 写 5 行 mount 函数 | 学习成本极低 |

---

## 九、执行计划（4 天）

### Day 1：删除（4 小时）
- [ ] 删除所有旧模块，保留 UMD 加载机制的概念
- [ ] 创建新目录：`wc/loader.js`、`wc/WidgetHost.vue`、`wc/templates/`

### Day 2：实现核心（4 小时）
- [ ] 写 `wc/loader.js`（100 行，保留 UMD 加载 + 缓存 + 依赖检查）
- [ ] 写 `wc/WidgetHost.vue`（25 行）
- [ ] 写三个物料模板（各 5 行）
- [ ] 创建 `demo/host/` 基座（提供 Vue2 + Vue3 运行时）

### Day 3：demo 验证（4 小时）
- [ ] 创建 `demo/vue2-widget/`（UMD，external Vue2）
- [ ] 创建 `demo/vue3-widget/`（UMD，external Vue3）
- [ ] 创建 `demo/h5-widget/`（UMD，无框架）
- [ ] 验证三物料在同一个页面中共存，依赖隔离正常
- [ ] 验证错误降级
- [ ] 验证体积优化

### Day 4：测试 + 文档（4 小时）
- [ ] 单元测试（缓存、依赖检查、错误降级）
- [ ] 端到端测试（Playwright）
- [ ] README.md（50 行）
- [ ] 最终验证

---

## 十、一句话总结

> **依赖冲突的解决方案是 `external` + `globals` + 不同全局变量名（Vue2/Vue3），不是 Custom Elements。Custom Elements 只是加了一个不必要的 `<tag>` 包装层。新方案保留 UMD 加载和依赖隔离的全部机制，删除 CE 注册、属性序列化和生命周期管理，从 17,000 行降到 190 行。**
