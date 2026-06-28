# 跨技术栈看板物料集成 关键技术实现文档

> 本文档基于实际代码实现，详细描述核心算法与关键实现细节。

---

## 目录

1. [UMD 脚本加载与缓存](#1-umd-脚本加载与缓存)
2. [CSS 样式加载与引用计数](#2-css-样式加载与引用计数)
3. [依赖检查](#3-依赖检查)
4. [分包构建](#4-分包构建)
5. [WidgetHost 组件](#5-widgethost-组件)

---

## 1. UMD 脚本加载与缓存

**文件**：`wc/loader.js`

### 1.1 加载流程

```js
export function loadScript(url) {
  // 1. 缓存命中直接返回
  if (cache.has(url)) return cache.get(url);

  // 2. 创建 <script> 标签
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => {
      cache.delete(url);  // 失败时清除缓存，支持重试
      reject(new Error(`JS 加载失败: ${url}`));
    };
    document.head.appendChild(s);
  });

  // 3. 缓存 Promise
  cache.set(url, p);
  return p;
}
```

### 1.2 关键设计

- **缓存去重**：同一 URL 只创建一个 `<script>` 标签
- **失败清除**：加载失败时从缓存移除，支持重试
- **Promise 缓存**：多个调用方共享同一个 Promise

---

## 2. CSS 样式加载与引用计数

**文件**：`wc/loader.js`

### 2.1 加载流程

```js
function loadStyle(url) {
  if (!url) return Promise.resolve();
  if (cache.has(url)) return cache.get(url);

  // 1. 先创建 DOM 元素并记录引用
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = url;
  document.head.appendChild(l);

  const ref = { count: 1, el: l };
  cssRefs.set(url, ref);

  // 2. 构造 Promise
  const p = new Promise((resolve, reject) => {
    l.onload = () => resolve();
    l.onerror = () => {
      cssRefs.delete(url);
      cache.delete(url);
      if (l.parentNode) l.parentNode.removeChild(l);
      reject(new Error(`CSS 加载失败: ${url}`));
    };
  });

  cache.set(url, p);
  return p;
}
```

### 2.2 引用计数卸载

```js
function unloadStyle(url) {
  if (!url) return;
  const ref = cssRefs.get(url);
  if (!ref) return;

  ref.count--;
  if (ref.count <= 0 && ref.el && ref.el.parentNode) {
    ref.el.parentNode.removeChild(ref.el);
    cssRefs.delete(url);
    cache.delete(url);
  }
}
```

### 2.3 关键设计

- **引用计数**：多个物料共享同一 CSS 时，只有最后一个卸载才移除
- **失败清理**：加载失败时移除 DOM 元素并清除缓存
- **先创建后 Promise**：避免竞态条件

---

## 3. 依赖检查

**文件**：`wc/loader.js`

### 3.1 全局变量映射

```js
const DEP_GLOBALS = {
  lodash: '_',
  'element-ui': 'ELEMENT',
  'element-plus': 'ElementPlus',
  axios: 'axios'
};
```

### 3.2 检查流程

```js
function checkDeps(name, vueVersion, deps) {
  const errors = [];

  // 检查 Vue 运行时
  if (vueVersion === '2' && typeof window.Vue2 === 'undefined') {
    errors.push('Vue2 运行时未加载');
  }
  if (vueVersion === '3' && typeof window.Vue3 === 'undefined') {
    errors.push('Vue3 运行时未加载');
  }

  // 检查其他依赖
  for (const dep of deps) {
    const g = DEP_GLOBALS[dep] || dep;
    if (typeof window[g] === 'undefined') {
      errors.push(`${dep} 未加载（window.${g}）`);
    }
  }

  if (errors.length) {
    throw new Error(`物料 ${name} 依赖缺失：${errors.join('、')}`);
  }
}
```

---

## 4. 分包构建

**文件**：`demo/*/build.mjs`

### 4.1 构建流程

```js
import { build } from 'vite';
import fs from 'fs';

// 扫描 src/widgets/ 目录
const widgets = fs.readdirSync(widgetsDir)
  .filter(f => fs.statSync(resolve(widgetsDir, f)).isDirectory());

// 每个物料独立构建
for (const name of widgets) {
  await build({
    configFile: false,
    root: __dirname,
    plugins: [vue()],
    build: {
      lib: {
        entry: resolve(widgetsDir, name, 'index.js'),
        name: `bi${name.charAt(0).toUpperCase() + name.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`,
        formats: ['umd'],
        fileName: () => `${name}`,
      },
      rollupOptions: {
        external: (id) => {
          if (id.endsWith('.css')) return false;
          return id === 'vue' || id === 'element-plus';
        },
        output: {
          globals: { vue: 'Vue3', 'element-plus': 'ElementPlus' },
          entryFileNames: `${name}.js`,
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return `${name}.css`;
            }
            return `[name].[ext]`;
          },
        },
      },
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: false,
    },
  });
}
```

### 4.2 UMD 全局名

UMD 全局变量名直接等于目录名，不再做 `bi` 前缀 + camelCase 转换：

| 目录名 | UMD 全局名 |
|--------|-----------|
| `finance-panel` | `finance-panel` |
| `user-panel` | `user-panel` |
| `sales-panel` | `sales-panel` |
| `clock-widget` | `clock-widget` |

构建完成后会在 `dist/` 目录生成 `manifest.json`，记录所有物料的 name 和文件路径，基座可直接读取配置，无需依赖命名约定。

### 4.3 关键设计

- **configFile: false**：避免加载已有的 vite.config.js
- **emptyOutDir: false**：多次构建不清空目录
- **assetFileNames**：CSS 文件按物料名命名
- **manifest.json**：构建产物自描述，消除运行时 name 猜测的脆弱性

---

## 5. WidgetHost 组件

**文件**：`wc/WidgetHost.vue`

### 5.1 属性定义

```js
const props = defineProps({
  name: { type: String, required: true },
  js: { type: String, required: true },
  css: { type: String, default: '' },
  vueVersion: { type: String, default: '3' },
  widgetProps: { type: Object, default: () => ({}) },
});
```

### 5.2 挂载流程

```js
async function doMount() {
  const mountPoint = ensureMountPoint();

  // 1. 加载脚本
  await loadScript(props.js);

  // 2. 查找物料模块
  const mod = findWidget(props.name);

  // 3. 调用 mount
  if (mod && typeof mod.mount === 'function') {
    const innerApi = await mod.mount(mountPoint, props.widgetProps || {});
    widgetApi = { unmount: () => { if (innerApi?.unmount) innerApi.unmount(); } };
  } else {
    // 降级到 loader 的 mountWidget
    widgetApi = await mountWidget(mountPoint, {
      name: props.name,
      js: props.js,
      css: props.css,
      vueVersion: props.vueVersion,
      props: buildProps()
    });
  }
}
```

### 5.3 物料查找

```js
function findWidget(name) {
  // 直接挂载：window[name]
  if (window[name]?.mount) return window[name];

  // 命名空间：遍历 window 上的对象查找
  for (const key of Object.keys(window)) {
    const val = window[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && val[name]?.mount) {
      return val[name];
    }
  }
  return null;
}
```

### 5.4 关键设计

- **双模式查找**：支持直接挂载和命名空间两种模式
- **CSS 支持**：通过 `css` 属性加载物料样式
- **Props 更新**：`widgetProps` 变化时自动卸载重挂载
