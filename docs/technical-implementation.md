# 跨技术栈看板物料集成方案 关键技术实现文档

> 本文档基于实际代码实现逆向输出，详细描述核心算法、关键实现细节与设计权衡。与 `docs/spec-requirements.md`（需求规格）、`docs/design.md`（总体设计）配套使用。

---

## 目录

1. [轻量 semver 实现](#1-轻量-semver-实现)
2. [资源加载竞态修复与重试策略](#2-资源加载竞态修复与重试策略)
3. [错误边界与全局归因算法](#3-错误边界与全局归因算法)
4. [扁平化 props 序列化协议](#4-扁平化-props-序列化协议)
5. [widget-scope 嵌套循环检测算法](#5-widget-scope-嵌套循环检测算法)
6. [PostCSS 命名空间前缀算法](#6-postcss-命名空间前缀算法)
7. [schema-generator 双策略 props 解析](#7-schema-generator-双策略-props-解析)
8. [i18n locale 回退链与多 bundle 幂等](#8-i18n-locale-回退链与多-bundle-幂等)
9. [widget-bus 命名空间隔离与 off 反查](#9-widget-bus-命名空间隔离与-off-反查)
10. [widget-context 深比较与序列化兜底](#10-widget-context-深比较与序列化兜底)
11. [Vue3 包装层 locale 重渲染关键决策](#11-vue3-包装层-locale-重渲染关键决策)
12. [Vue2 包装层 ignoredElements 合并去重](#12-vue2-包装层-ignoredelements-合并去重)
13. [UI 组件按需加载与降级链路](#13-ui-组件按需加载与降级链路)
14. [声明式插件 Babel AST 转换](#14-声明式插件-babel-ast-转换)
15. [DevTools 三层桥接架构](#15-devtools-三层桥接架构)
16. [构建期 AST 风险扫描](#16-构建期-ast-风险扫描)
17. [性能优化与 API 一致性改进](#17-性能优化与-api-一致性改进)

---

## 1. 轻量 semver 实现

**文件**：`wc/widget-loader/index.js`

**目标**：不引入完整 semver 库（增加体积），实现 `satisfies(version, range)` 支持常见 semver 范围语法。

### 1.1 支持的语法

| 语法 | 语义 | 示例 |
| ------ | ------ | ------ |
| `^x.y.z` | 兼容同一 major（0.x 收紧到同 minor，0.0.x 收紧到同 patch） | `^2.6.0` 匹配 2.6.0~2.x.x |
| `~x.y.z` | 兼容同一 minor | `~2.6.0` 匹配 2.6.0~2.6.x |
| `>=` / `>` / `<=` / `<` | 范围比较 | `>=2.6.0 <3.0.0` |
| `=x.y.z` / 精确版本 | 精确匹配 | `2.6.14` |
| `*` | 任意版本 |  |
| 空格分隔 | AND 复合范围 | `>=2.6.0 <3.0.0` |
| `\|\|` 分隔 | OR 范围 | `^2.6.0 \|\| ^3.0.0` |

### 1.2 核心算法

```js
// 解析版本号
function parseVersion(v) {
  // 拆出 major/minor/patch/prerelease
  // 如 '2.6.14-beta.1' → { major: 2, minor: 6, patch: 14, prerelease: ['beta', 1] }
}

// 版本比较
function compareVersion(a, b) {
  // 1. 比较 major/minor/patch
  // 2. 正式版 > 预发布（无 prerelease > 有 prerelease）
  // 3. 预发布按字符串字典序比较
}

// 单个范围匹配
function satisfiesSingle(version, range) {
  // 处理 ^/~/>=/>>/<=/</=/精确/*
  // ^ 对 0.x 收紧到同 minor，0.0.x 收紧到同 patch：
  //   ^0.0.5 → >=0.0.5 <0.0.6（同 patch）
  //   ^0.1.0 → >=0.1.0 <0.2.0（同 minor）
  //   ^1.0.0 → >=1.0.0 <2.0.0（同 major）
}

// 复合范围匹配
export function satisfies(version, range) {
  // 1. 按 || 拆分为 OR 子范围
  // 2. 每个子范围按空格拆分为 AND 条件
  // 3. 任一 OR 子范围全部 AND 条件满足则返回 true
}
```

### 1.3 `^` 对 0.x 的收紧规则（P0-4 修复）

**问题**：标准 semver `^0.0.5` 应只匹配 `0.0.5`，但旧实现错误匹配到 `0.0.x`。

**修复**：增加 `0.0.x` 分支收紧到同 patch：

```js
if (major === 0 && minor === 0) {
  // ^0.0.x → >=0.0.x <0.0.(x+1)
  return compareVersion(v, { major:0, minor:0, patch }) >= 0
      && compareVersion(v, { major:0, minor:0, patch: patch+1 }) < 0;
} else if (major === 0) {
  // ^0.x.y → >=0.x.y <0.(x+1).0
  return compareVersion(v, { major:0, minor, patch }) >= 0
      && compareVersion(v, { major:0, minor: minor+1, patch:0 }) < 0;
} else {
  // ^x.y.z → >=x.y.z <(x+1).0.0
  return compareVersion(v, { major, minor, patch }) >= 0
      && compareVersion(v, { major: major+1, minor:0, patch:0 }) < 0;
}
```

---

## 2. 资源加载竞态修复与重试策略

**文件**：`wc/widget-loader/index.js`

### 2.1 竞态问题（N4 修复）

**问题**：旧实现把「超时 reject」与「真实加载结果」耦合——超时后移除 `<script>` 节点并删除缓存，但 CDN 可能只是慢，最终仍会加载成功，删除缓存导致后续重试重复创建 `<script>` 标签。

**修复**：将「真实加载结果」与「超时」分离。

```js
_loadScriptOnce(url, opts) {
  // 1. 缓存命中直接返回
  if (this.loadedResources.has(url)) {
    return this.loadedResources.get(url);
  }

  // 2. loadPromise 由 onload/onerror 决定（真实结果）
  const loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(script);
    script.onerror = () => {
      // 真正失败才清理缓存
      this.loadedResources.delete(url);
      reject(new WidgetError(WidgetError.SCRIPT_ERROR, ...));
    };
    document.head.appendChild(script);
  });

  // 3. 缓存真实加载结果（非超时结果）
  this.loadedResources.set(url, loadPromise);

  // 4. 调用方拿到 Promise.race（超时只 reject 给调用方，不移除节点/不删缓存）
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new WidgetError(WidgetError.LOAD_TIMEOUT, ...)), opts.timeout);
  });

  return Promise.race([loadPromise, timeoutPromise]).finally(() => {
    clearTimeout(timer); // 提前完成时清理 timer
  });
}
```

**关键点**：超时后真实加载成功仍可复用缓存（后续 `loadWidget` 命中 `loadedResources` 直接返回），避免重复创建 `<script>`。

### 2.3 资源节点引用与 O(1) 卸载

`unloadWidget` 需移除 `<script>` / `<link>` 节点。旧实现用 `document.querySelectorAll('script')` 全文档扫描，O(n) 且匹配字符串。改为在加载时保存节点引用到 `resourceNodes` Map，卸载时 O(1) 直接移除。

```js
// 构造函数中初始化
constructor(hostId) {
  this.resourceNodes = new Map();  // url → DOM node 引用
  // ...
}

// _loadScriptOnce / _loadStyleOnce 中保存引用
_loadScriptOnce(url, opts) {
  // ... 创建 script 节点 ...
  document.head.appendChild(script);
  this.resourceNodes.set(url, script);  // 保存引用
  // ...
}

// unloadWidget 中 O(1) 移除
function unloadWidget(name) {
  // ...
  if (resources.js) {
    const node = this.resourceNodes.get(resources.js);
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);  // O(1) 直接移除
    } else {
      // 回退全文档扫描（兼容边缘场景）
      Array.from(document.querySelectorAll('script')).forEach(s => {
        if (s.src === resources.js || s.getAttribute('src') === resources.js) {
          if (s.parentNode) s.parentNode.removeChild(s);
        }
      });
    }
    this.resourceNodes.delete(resources.js);
    this.loadedResources.delete(resources.js);
  }
  // CSS 同理
}
```

**回退策略**：若 `resourceNodes` 中找不到引用（如跨实例操作），回退到 `querySelectorAll` 全文档扫描，保证健壮性。

### 2.2 重试策略

```js
async _loadScriptWithRetry(url, opts) {
  const retries = opts.retries ?? 3;
  const backoff = opts.backoff ?? 1000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await this._loadScriptOnce(url, opts);
    } catch (err) {
      // 仅 SCRIPT_ERROR / CSS_ERROR 重试
      if (err.code === WidgetError.LOAD_TIMEOUT) {
        throw err;  // 超时不重试（可能底层仍在加载，重试会重复创建标签加剧拥塞）
      }
      if (attempt < retries) {
        const delay = backoff * Math.pow(2, attempt);  // 1s → 2s → 4s
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}
```

**关键区分**：
- `SCRIPT_ERROR` / `CSS_ERROR`：可重试 3 次 + 指数退避（应对 CDN 网络抖动）。
- `LOAD_TIMEOUT`：**不重试**（超时可能底层仍在加载，重试会重复创建 `<script>` 标签加剧拥塞）。
- `loadScript` / `loadStyle` 失败时清除 `loadedResources` 缓存，重试才会真正重新拉取。

---

## 3. 错误边界与全局归因算法

**文件**：`wc/widget-loader/index.js`

### 3.1 全局错误监听器

```js
_ensureGlobalErrorListener() {
  if (this.globalErrorListenerInstalled) return;
  this.globalErrorListenerInstalled = true;

  // 捕获阶段监听 error（资源加载失败 + JS 运行时错误）
  window.addEventListener('error', (event) => {
    this._attributeErrorToWidget(event);
  }, true);  // 注意：捕获阶段，才能捕获资源加载错误

  // 监听 unhandledrejection
  window.addEventListener('unhandledrejection', (event) => {
    this._attributeErrorToWidget(event);
    event.preventDefault();  // 抑制控制台告警
  });
}
```

### 3.2 归因算法 `attributeErrorToWidget`

**优先级**：资源错误 → JS 运行时错误 → Promise rejection。

```js
_attributeErrorToWidget(event) {
  let widget = null;

  // 1. 资源错误：event.target 是已挂载物料内部的元素
  if (event.target && event.target !== window) {
    for (const [element, entry] of this.mountedWidgets) {
      if (entry.failed) continue;
      if (element.contains(event.target)) {
        widget = element;
        break;
      }
    }
  }

  // 2. JS 运行时错误：按 filename / message / stack 匹配
  if (!widget && event.error) {
    const { filename, message, stack } = event.error;
    for (const [element, entry] of this.mountedWidgets) {
      if (entry.failed) continue;
      const widgetJsUrl = entry.widget.js;
      const widgetName = entry.widget.name;
      // 匹配物料 JS URL 或物料名
      if ((filename && filename.includes(widgetJsUrl)) ||
          (message && message.includes(widgetName)) ||
          (stack && stack.includes(widgetJsUrl))) {
        widget = element;
        break;
      }
    }
  }

  // 3. Promise rejection：按 reason.stack 匹配
  if (!widget && event.reason) {
    // 同上 stack 匹配
  }

  if (widget) {
    this._markWidgetFailed(widget, event.error || event.reason);
  }
}
```

### 3.3 `markWidgetFailed` 降级处理

```js
_markWidgetFailed(element, error) {
  const entry = this.mountedWidgets.get(element);
  if (!entry || entry.failed) return;

  // 1. 标记失败，避免重复处理
  entry.failed = true;

  // 2. 移除崩溃元素，防止残留破坏布局
  if (element.parentNode) {
    element.parentNode.removeChild(element);
  }

  // 3. 派发 error 生命周期事件
  this._emitLifecycle('error', { name: entry.widget.name, error, container: entry.container });

  // 4. 渲染降级占位（附「点击重试」）
  this._renderFallback(
    entry.container,
    `${entry.widget.name} 运行时崩溃：${error.message}`,
    entry.widget,
    () => this._mountWithFallback(entry.container, entry.widget)
  );
}
```

### 3.4 降级占位防堆叠（N8 修复）

```js
_renderFallback(container, message, widget, onRetry) {
  // 移除同容器内已有占位，避免堆叠
  const existing = container.querySelector('.widget-error-placeholder');
  if (existing) existing.remove();

  this._injectFallbackStyles();  // 模块级标志，只注入一次

  const placeholder = document.createElement('div');
  placeholder.className = 'widget-error-placeholder';
  placeholder.dataset.widgetFallback = widget.name;
  placeholder.innerHTML = `<div class="widget-error-message">${message}</div>`;

  if (onRetry) {  // 版本不兼容时 onRetry 为 null，不渲染重试按钮
    const retryBtn = document.createElement('button');
    retryBtn.className = 'widget-error-retry';
    retryBtn.textContent = t('loader.retry');  // i18n 翻译
    retryBtn.onclick = onRetry;
    placeholder.appendChild(retryBtn);
  }

  container.appendChild(placeholder);
}
```

---

## 4. 扁平化 props 序列化协议

**文件**：`wc/widget-loader/index.js` (renderWidget) + `wc/vue2-widget-template/widget-wrapper.js`

### 4.1 序列化（loader 端）

```js
renderWidget(container, widget) {
  const { name, props = {} } = widget;
  const element = document.createElement(name);

  for (const [key, value] of Object.entries(props)) {
    // scope prop 被显式跳过（框架内部维护）
    if (key === 'scope') continue;

    const attr = camelToKebab(key);  // maxCount → max-count

    if (value === null || value === undefined) {
      element.removeAttribute(attr);  // 由 Vue 应用默认值
    } else if (value === true) {
      element.setAttribute(attr, '');  // presence 语义
    } else if (value === false) {
      element.setAttribute(attr, 'false');  // 显式 false
      // 不可 removeAttribute！否则包装层 _collectProps 跳过该 prop
      // Vue 回退默认值，尤其默认值为 true 时 false 丢失
    } else if (typeof value === 'object') {
      try {
        element.setAttribute(attr, JSON.stringify(value));
      } catch (e) {
        throw new WidgetError(WidgetError.PROPS_ERROR, ...);  // 循环引用
      }
    } else {
      element.setAttribute(attr, String(value));
    }
  }

  // 自动注入上下文
  injectContext(element);

  container.appendChild(element);  // 触发 connectedCallback
  return element;
}
```

### 4.2 反序列化（包装层端）

```js
// vue2-widget-template / vue3-widget-template
function parseAttrValue(raw, type) {
  if (type === Boolean) {
    // HTML 语义：存在即 true，"false" 为 false
    return raw !== 'false';
  }
  if (type === Number) {
    return Number(raw);
  }
  if (type === Object || type === Array || Array.isArray(type)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;  // 失败回退原始字符串
    }
  }
  return raw;  // String 原样
}

function collectProps(element) {
  const props = {};
  for (const attr of element.constructor.observedAttributes) {
    if (!element.hasAttribute(attr)) continue;  // 未设置则跳过，Vue 用默认值
    const camelKey = kebabToCamel(attr);  // max-count → maxCount
    const type = getPropType(camelKey);   // 从组件 props 声明获取类型
    props[camelKey] = parseAttrValue(element.getAttribute(attr), type);
  }
  return props;
}
```

### 4.3 Boolean false 的陷阱

**关键场景**：组件 `props: { isVisible: { type: Boolean, default: true } }`，宿主传入 `isVisible: false`。

**错误做法**：`removeAttribute('is-visible')` → 包装层 `_collectProps` 跳过该 prop（`!element.hasAttribute(attr)`）→ Vue 应用默认值 `true` → **宿主显式传入的 false 丢失**。

**正确做法**：`setAttribute('is-visible', 'false')` → 包装层 `parseAttrValue('false', Boolean)` 返回 `false` → Vue 收到 `false`。

---

## 5. widget-scope 嵌套循环检测算法

**文件**：`wc/widget-scope/index.js`

### 5.1 数据结构

```js
// 多 Host 分桶，避免微前端/iframe 嵌套误判
const pendingAncestorsByHost = new Map();
// 结构：host → Map<widgetName, Set<ancestor>>

// 示例：
// {
//   'host-A': {
//     'bi-B': Set{'bi-A', 'bi-X'},  // B 的祖先链 = A + A 的祖先链
//     'bi-C': Set{'bi-B', 'bi-A', 'bi-X'}
//   }
// }
```

### 5.2 算法流程

```js
// 父物料加载子物料时调用
function propagateAncestors(parentScope, childName, host) {
  const parentName = parentScope.meta.name;
  const parentAncestors = parentScope.meta.ancestors || [];

  if (!pendingAncestorsByHost.has(host)) {
    pendingAncestorsByHost.set(host, new Map());
  }
  const hostBucket = pendingAncestorsByHost.get(host);

  if (!hostBucket.has(childName)) {
    hostBucket.set(childName, new Set());
  }
  const childAncestors = hostBucket.get(childName);

  // 把 [parentName + parent 的祖先链] 写入 child 的祖先集合
  childAncestors.add(parentName);
  for (const ancestor of parentAncestors) {
    childAncestors.add(ancestor);
  }
}

// 子物料 createWidgetScope 时取出继承
function consumePendingAncestors(name, host) {
  const hostBucket = pendingAncestorsByHost.get(host);
  if (!hostBucket || !hostBucket.has(name)) return new Set();
  const ancestors = hostBucket.get(name);
  hostBucket.delete(name);  // 消费后清除
  if (hostBucket.size === 0) pendingAncestorsByHost.delete(host);
  return ancestors;
}

// 循环检测
function checkCycle(name, ancestors) {
  // 1. 直接自引用
  if (childName === name) {
    const chain = `${name} -> ${childName}`;
    throw new Error(`[widget-scope] 循环加载检测: 物料 ${name} 试图加载自身。链路: ${chain}`);
  }
  // 2. 祖先链命中
  if (ancestorSet.has(childName)) {
    const chain = [...ancestorSet, name, childName].join(' -> ');
    throw new Error(`[widget-scope] 循环加载检测: 物料 ${name} 试图加载祖先物料 ${childName}。链路: ${chain}`);
  }
}
```

### 5.3 多级嵌套传播示例

```text
A (host=h1) 加载 B
  → propagateAncestors(A, 'bi-B', 'h1')
  → h1 桶 bi-B = {bi-A}

B (host=h1) createWidgetScope
  → consumePendingAncestors('bi-B', 'h1')
  → B.meta.ancestors = {bi-A}

B 加载 C
  → propagateAncestors(B, 'bi-C', 'h1')
  → h1 桶 bi-C = {bi-B, bi-A}  // B + B 的祖先链

C (host=h1) createWidgetScope
  → consumePendingAncestors('bi-C', 'h1')
  → C.meta.ancestors = {bi-B, bi-A}

C 加载 A
  → checkCycle('bi-A', {bi-B, bi-A})
  → bi-A ∈ ancestors → 抛错 "A -> B -> C -> A"
```

---

## 6. PostCSS 命名空间前缀算法

**文件**：`wc/widget-wrapper-plugin/postcss-namespace.js`

### 6.1 全局选择器白名单

```js
const GLOBAL_SELECTOR_PATTERNS = [
  ':host', ':root', 'html', 'body', '*',
  '::before', '::after',
  '::v-deep', '::v-global', '::v-slotted', '::v-enter', '::v-leave',
  '>>>', '/deep/',
  ':deep(', ':global(', ':slotted(',
  '@media', '@supports', '@keyframes', '@-webkit-keyframes',
  '@font-face', '@page', '@import', '@charset', '@namespace'
];
```

> 与 `css-namespace-checker` 的 `ALLOWED_GLOBAL_SELECTORS` 保持一致。

### 6.2 深度组合器特判

**问题**：`>>>` 与 `/deep/` 是组合器而非普通选择器，其后代选择器属于「穿透目标」不应再加前缀。

```js
const DEEP_COMBINATOR_REGEX = /(>>>|\/deep\/)/;

function prefixSelector(selector, namespaceClass) {
  // 已含命名空间则原样返回避免双重前缀
  if (hasNamespace(selector, namespaceClass)) return selector;

  // 空选择器原样返回
  if (!selector.trim()) return selector;

  // 全局白名单放行
  if (isGlobalSelector(selector)) return selector;

  // 深度组合器特判
  if (DEEP_COMBINATOR_REGEX.test(selector)) {
    // .title >>> .child → .bi-xxx .title >>> .child
    // 仅给组合器前的部分加前缀，后代不加
    const [before, ...rest] = selector.split(DEEP_COMBINATOR_REGEX);
    return `${prefixSelector(before, namespaceClass)} >>> ${rest.join('')}`;
  }

  // 后代选择器拼接
  // .title → .bi-sales-panel .title
  return `.${namespaceClass} ${selector}`;
}
```

### 6.3 @keyframes / @font-face 跳过

```js
// postcss 遍历 rule 时检查父节点
if (rule.parent.type === 'atrule') {
  const name = rule.parent.name;
  if (name === 'keyframes' || name === '-webkit-keyframes' || name === 'font-face') {
    return;  // 跳过内部规则（如 0%/from/to）
  }
}
```

---

## 7. schema-generator 双策略 props 解析

**文件**：`wc/schema-generator/index.js`

### 7.1 AST 优先策略

```js
function generateSchema(widgetName, componentPath, options) {
  const source = fs.readFileSync(componentPath, 'utf-8');

  let props;
  try {
    // 优先 AST 解析（准确）
    props = extractPropsViaAST(source);
  } catch (e) {
    // 回退正则解析（兜底）
    props = parseProps(source);
  }

  const uiDeps = extractUiDependencies(source);

  return {
    name: widgetName,
    properties: props,
    layout: DEFAULT_LAYOUT,
    ...(uiDeps.length ? { uiDependencies: { lib: inferUiLib(options.vueVersion), components: uiDeps } } : {})
  };
}
```

### 7.2 AST 解析流程

```js
function extractPropsViaAST(source) {
  // 1. @vue/compiler-sfc parse（解析 .vue SFC）
  const { descriptor } = parse(source);

  // 2. compileScript（归一化 <script setup> 与 Options API）
  const script = compileScript(descriptor, { id: 'schema-gen' });

  // 3. @babel/parser 解析 script.content
  const ast = babelParse(script.content, { sourceType: 'module' });

  // 4. findPropsOptionNode 定位 props 选项对象
  //    支持：export default { props } 与 export default _defineComponent({ props })
  const propsNode = findPropsOptionNode(ast);

  // 5. evalPropDef 求值每个 prop 定义
  for (const propNode of propsNode.properties) {
    // evalNode：字面量求值器（数字/字符串/布尔/null/数组/对象）
    // evalFunctionReturn：工厂函数求值（如 () => ({})）
    const propDef = evalPropDef(propNode);
    normalizeAstProp(propDef);  // 规范化为 schema 格式
  }
}
```

### 7.3 正则回退解析

#### TS 泛型 defineProps

```js
function parseTsProps(source) {
  // 匹配 defineProps<{ title: string; count?: number }>()
  // 用 findMatchedBrace 提取泛型体
  // 用 splitTopLevelFields 按深度 0 切分字段（按分号/换行）

  // TS 类型映射
  const TS_TYPE_MAP = {
    string: 'string', number: 'number', boolean: 'boolean', bool: 'boolean',
    Array: 'array', Object: 'object', any: 'string', unknown: 'string', null: 'string'
  };

  // 联合类型 string | number → 数组类型
  // string[] / Array<T> → 'array'
  // {} / Record<> → 'object'
}
```

#### withDefaults 合并

```js
// defineProps<{...}>() + withDefaults(defineProps<{...}>(), { title: '默认' })
// parseTsPropsBody 提取泛型，withDefaults 第二参数提取默认值合并
```

#### findMatchedBrace 逐字符扫描

```js
function findMatchedBrace(str, start) {
  // 逐字符扫描，处理：
  // - 字符串字面量（含转义）
  // - 注释（// 与 /* */）
  // - 嵌套花括号深度
  // 返回匹配的闭合花括号位置
}
```

#### splitTopLevelFields 按深度 0 切分

```js
function splitTopLevelFields(body) {
  // 按深度 0 的逗号/分号/换行切分
  // 换行切分时检查下一段是否像新字段，避免误切联合类型 string | number
}
```

### 7.4 parseDefault 处理

```js
function parseDefault(raw) {
  // 箭头函数默认值 () => ({}) → evalFunctionReturn
  // 字符串/布尔/null/数字 → 字面量
  // 数组/对象 → tryParseJsonLike
  //   先 JSON.parse
  //   失败用 singleQuoteToJson（单引号感知转换）
  //   逐字符扫描仅在字符串字面量边界替换单引号
  //   避免破坏字符串内部单引号
}
```

### 7.5 UI 依赖扫描

```js
function extractUiDependencies(source) {
  // 1. 提取 <template> 块
  // 2. 移除 HTML 注释
  // 3. 正则匹配 <el-([a-z][a-z0-9-]*)
  // 4. 去前缀去重
  return [...new Set(matches.map(m => m.replace(/^el-/, '')))];

  // 已知局限：
  // - 动态组件 <component :is> 不扫描
  // - 字符串渲染 h('el-button') 不扫描
}
```

---

## 8. i18n locale 回退链与多 bundle 幂等

**文件**：`wc/i18n/index.js`

### 8.1 locale 回退链（纯函数 memoize）

`t()` 是渲染期最高频热路径，每次调用都重新计算回退链（split/includes/push）会产生冗余开销。`getLocaleFallbackChain` 是纯函数（输入 locale → 输出确定数组），用模块级 Map 缓存后，同一 locale 仅计算一次。

```js
// 模块级缓存（纯函数 memoize）
const _fallbackChainCache = new Map();

function getLocaleFallbackChain(locale) {
  // 缓存命中直接返回
  const cached = _fallbackChainCache.get(locale);
  if (cached) return cached;

  const chain = [locale];
  const base = String(locale).split('-')[0];
  if (base !== locale) chain.push(base);        // 'zh-CN' → push 'zh'

  // 最终回退到 en（若尚未包含）
  if (!chain.includes('en')) chain.push('en');
  // 最终回退到 zh（若 en 也没有，作为最后保障）
  if (!chain.includes('zh')) chain.push('zh');

  _fallbackChainCache.set(locale, chain);
  return chain;
  // 'zh-CN' → ['zh-CN', 'zh', 'en']    （base='zh' 已在链中，跳过 push 'zh'）
  // 'en-GB' → ['en-GB', 'en']           （base='en' 已在链中，跳过 push 'en' 与 'zh'）
  // 'fr'    → ['fr', 'en', 'zh']
}
```

**缓存安全性**：`getLocaleFallbackChain` 是纯函数（无副作用、不依赖可变状态、输出确定性），同一 locale 永远返回同一数组。locale 集合有限（通常 zh-CN / en-US 等几种），缓存大小可控，无需淘汰策略。
```

### 8.2 点分键查找

```js
function lookupInLocale(locale, key) {
  const dict = messages[locale];
  if (!dict) return undefined;
  const parts = String(key).split('.');
  let cur = dict;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  // 仅返回 string 类型值（避免返回对象/数组）
  return typeof cur === 'string' ? cur : undefined;
}

function t(key, params) {
  const chain = getLocaleFallbackChain(currentLocale);
  for (const locale of chain) {
    const val = lookupInLocale(locale, key);
    if (val != null) {
      // 插值替换 /\{(\w+)\}/g
      return interpolate(val, params);
    }
  }
  return key;  // 回退返回 key 本身
}
```

### 8.3 多 bundle 单例幂等

**问题**：多个物料 bundle 各自 `import { t } from 'wc-i18n'`，若每个 bundle 维护独立 messages/listeners/currentLocale，locale 切换只通知首个实例的订阅者。

**解决方案**：`window.__wcI18n__` 已存在时，后续 bundle 的函数代理到全局实例。

```js
const g = typeof window !== 'undefined' ? window.__wcI18n__ : null;

if (g) {
  // 已存在全局实例，代理到全局
  module.exports = {
    t: (...args) => g.t(...args),
    setLocale: (...args) => g.setLocale(...args),
    onLocaleChange: (...args) => g.onLocaleChange(...args),
    addMessages: (...args) => g.addMessages(...args),
    getLocale: () => g.getLocale()
  };
} else {
  // 首个 bundle，初始化并挂载到 window
  const instance = createI18n();
  if (typeof window !== 'undefined') {
    window.__wcI18n__ = instance;
  }
  module.exports = instance;
}
```

### 8.4 深合并 addMessages

```js
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];  // 非对象值直接覆盖
    }
  }
  return target;
}
```

---

## 9. widget-bus 命名空间隔离与 off 反查

**文件**：`wc/widget-bus/index.js`

### 9.1 handler 包装与反查

```js
function createBus(namespace) {
  const busName = namespace ? `${GLOBAL_BUS_NAME}:${namespace}` : GLOBAL_BUS_NAME;
  const handlers = new Map();  // eventType → Set<{handler, wrapped}>

  function on(type, handler) {
    const eventType = `${busName}:${type}`;
    if (!handlers.has(eventType)) handlers.set(eventType, new Set());
    const set = handlers.get(eventType);

    // wrapped 包 try/catch，避免单个 handler 抛异常阻断其他同类型监听器
    const wrapped = (e) => {
      try { handler(e.detail, e); } catch (err) { console.error('[widget-bus] handler error:', err); }
    };
    set.add({ handler, wrapped });
    window.addEventListener(eventType, wrapped);

    return () => {  // 返回取消函数
      window.removeEventListener(eventType, wrapped);
      set.delete({ handler, wrapped });
      if (set.size === 0) handlers.delete(eventType);
    };
  }

  function off(type, handler) {
    const eventType = `${busName}:${type}`;
    const set = handlers.get(eventType);
    if (!set) return;
    // 遍历 set 找 entry.handler === handler
    for (const entry of set) {
      if (entry.handler === handler) {
        window.removeEventListener(eventType, entry.wrapped);
        set.delete(entry);
        break;
      }
    }
    if (set.size === 0) handlers.delete(eventType);
  }

  function once(type, handler) {
    const off = on(type, (payload, event) => {
      off();  // 先取消再执行，避免重入
      handler(payload, event);
    });
    return off;
  }

  return { emit, on, once, off };
}
```

### 9.2 once 与 off 的协调

**问题**：`once` 注册的 handler 是包装后的，`off(type, userHandler)` 用用户原始 handler 反查时找不到。

**解决方案**：`once` 通过闭包保留用户原始 handler，`off` 按 `entry.handler === handler` 匹配用户原始 handler。

---

## 10. widget-context 深比较与序列化兜底

**文件**：`wc/widget-context/index.js`

### 10.1 深比较 `isDeepEqual`

```js
function isDeepEqual(a, b) {
  try {
    // 优先 JSON.stringify 比较（快）
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    // 循环引用回退浅比较
    if (e instanceof TypeError) {
      // 循环引用，用引用比较
      return a === b;
    }
    throw e;
  }
}
```

**注意**：同引用直接判等（`oldValue !== newValue` 浅比较先执行），对「同一对象原地突变后再次传入」无法检测。

### 10.2 injectContext 序列化缓存与兜底

`renderWidget` 每次挂载物料都调 `injectContext`，每次都 `JSON.stringify` 全量上下文。N 个物料 = N 次序列化。引入版本号缓存后，同一上下文版本仅序列化一次，后续挂载直接复用缓存字符串。

**store 版本号**：`setContext` / `clearContext` 在数据变化时递增 `store.version`，作为缓存失效信号。

```js
// store 含 version 字段
function getStore() {
  if (!window.__wcContext__) {
    window.__wcContext__ = { data: {}, listeners: new Map(), version: 0 };
  }
  return window.__wcContext__;
}

// setContext 数据变化时递增版本号
function setContext(partial, opts) {
  // ...浅比较/deep 比较...
  if (changedKeys.length > 0) {
    // 写入数据
    store.version++;  // 递增版本号，使 injectContext 缓存失效
  }
}

// injectContext 三重缓存键：(store 引用 + version + keys 指纹)
let _injectCacheStore = null;
let _injectCacheVersion = -1;
let _injectCacheKeysFp = undefined;
let _injectCacheSerialized = null;

function injectContext(element, keys) {
  if (!element) return;
  const store = getStore();
  const context = getContext(keys);
  const keysFp = keys ? JSON.stringify(keys) : null;

  // 三重缓存键：store 引用（跨用例隔离）+ version（变更检测）+ keys 指纹
  let json;
  if (store && store === _injectCacheStore
      && store.version === _injectCacheVersion
      && _injectCacheKeysFp === keysFp
      && _injectCacheSerialized !== null) {
    json = _injectCacheSerialized;  // 缓存命中
  } else {
    try {
      json = JSON.stringify(context);  // 优先 JSON.stringify（快）
    } catch (e) {
      json = safeStringify(context);  // 失败回退 safeStringify（WeakSet 去环）
      if (!json) json = '{}';  // 再失败为 '{}'
    }
    // 写缓存
    if (store) {
      _injectCacheStore = store;
      _injectCacheVersion = store.version;
      _injectCacheKeysFp = keysFp;
      _injectCacheSerialized = json;
    }
  }

  // 同时写入 attribute 与实例属性
  element.setAttribute('data-context', json);
  element._wcContext = context;

  // 序列化失败不阻断挂载
}
```

**三重缓存键的必要性**：
- **store 引用**：测试中 `delete window.__wcContext__` 后重建 store，引用不同即缓存自动失效，避免跨测试用例状态污染。
- **version**：`setContext` 递增 version，下次 `injectContext` 检测到 version 不匹配即重新序列化。
- **keys 指纹**：不同 `keys` 参数序列化不同子集，需区分缓存。

### 10.3 safeStringify

```js
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (value && typeof value === 'object') {
      if (seen.has(value)) return undefined; // 跳过环（JSON.stringify 会丢弃值为 undefined 的字段）
      seen.add(value);
    }
    return value;
  });
}
```

---

## 11. Vue3 包装层 locale 重渲染关键决策

**文件**：`wc/widget-wrapper-plugin/vite-plugin.js`（Vue3） / `wc/widget-wrapper-plugin/vue-cli-plugin.js`（Vue2）

> **注意**：以下 locale 重渲染逻辑仅存在于**插件生成的 wrapper**（`vite-plugin.js` / `vue-cli-plugin.js` 生成的临时入口文件）。手动模板 `wc/vue3-widget-template/widget-wrapper.js` 与 `wc/vue2-widget-template/widget-wrapper.js` 不含此逻辑。

### 11.1 问题

Vue3 的 `shouldUpdateComponent` 在 props 未变时会跳过子组件重渲染。仅替换 `_propsRef.value` 无法让物料重渲染。

### 11.2 解决方案：forceUpdate 物料组件实例

```js
// 生成 wrapper 时注入 ref 捕获物料组件实例
class WidgetElement extends HTMLElement {
  connectedCallback() {
    // ...
    this._propsRef = ref(this._collectProps());
    // 仅当组件声明了 scope prop 时才注入，防止 $attrs fallthrough 到根元素
    const hasScopeProp = getDeclaredPropNames(Component).includes('scope');
    this._app = createApp({
      render: () => {
        const props = { ...this._propsRef.value };
        if (hasScopeProp) props.scope = this._scope;
        return h(Component, {
          ...props,
          ref: this._captureWidget  // 捕获物料组件实例
        });
      }
    });

    // onLocaleChange 注册回调触发 forceUpdate
    this._offLocaleChange = onLocaleChange(() => {
      if (this._widgetInstance) {
        this._widgetInstance.$forceUpdate();  // 强制更新物料组件本身
      }
    });

    this._app.mount(this);
  }

  _captureWidget = (instance) => {
    this._widgetInstance = instance;
  }
}
```

**关键**：必须 forceUpdate 物料组件实例本身（`_widgetInstance`），而非外壳 root。`ref: this._captureWidget` 拿到组件实例引用。

**scope 条件注入**：未声明 `scope` prop 的组件不应收到 `scope`——否则 Vue3 会把它放入 `$attrs` 并 fallthrough 到根元素，渲染成无意义的 `scope="[object Object]"` 属性。通过 `getDeclaredPropNames(Component).includes('scope')` 检测后条件注入，消除此问题。

### 11.3 Vue2 的对应实现

Vue2 在子组件 props 未变时不会重渲染子组件，仅 forceUpdate 外壳无效：

```js
// Vue2 包装层
connectedCallback() {
  this.vm = new Vue({
    data: { widgetProps: collectProps(this), widgetScope: this._scope },
    render: h => h(Component, { props: { ...this.widgetProps, scope: this.widgetScope } })
  });
  // ...

  this._offLocaleChange = onLocaleChange(() => {
    // forceUpdate 物料组件（this.vm.$children[0]），而非外壳 this.vm
    if (this.vm.$children[0]) {
      this.vm.$children[0].$forceUpdate();
    }
  });
}
```

---

## 12. Vue2 包装层 ignoredElements 合并去重

**文件**：`wc/widget-wrapper-plugin/vue-cli-plugin.js`

### 12.1 问题

Vue2 默认会警告未知自定义元素（`bi-xxx`），需通过 `Vue.config.ignoredElements` 忽略。若多个物料都设置 `ignoredElements`，后者会覆盖前者。

### 12.2 合并 `/^el-/` 正则方案

实际代码合并的是 `/^el-/` 正则（用于忽略 ElementUI 的 `el-*` 元素），而非 widget name 字符串：

```js
// vue-cli-plugin.js 生成的 wrapper
import Vue from 'vue';
import Component from '__WIDGET_COMPONENT__';

// ─── 合并而非覆盖，避免污染基座或其他物料的 ignoredElements 配置 ───
// 去重检查：同页多物料加载时避免重复添加 /^el-/
const _existing = Array.isArray(Vue.config.ignoredElements) ? Vue.config.ignoredElements : [];
const _hasEl = _existing.some(re => re instanceof RegExp && re.source === '^el-');
if (!_hasEl) Vue.config.ignoredElements = [..._existing, /^el-/];
```

**关键**：合并的是 `/^el-/` 正则（匹配所有 `el-*` 前缀的 ElementUI 组件），用 `re.source === '^el-'` 去重避免重复添加。

---

## 13. UI 组件按需加载与降级链路

**文件**：`wc/widget-loader/index.js` (preloadUiDependencies)

### 13.1 收集与去重

```js
async preloadUiDependencies(widgets, options) {
  // 1. 收集所有物料的 uiDependencies
  const libMap = new Map();  // lib → Set<component>
  for (const widget of widgets) {
    const ui = widget.uiDependencies;
    if (!ui) continue;
    if (!libMap.has(ui.lib)) libMap.set(ui.lib, new Set());
    for (const comp of ui.components) {
      libMap.get(ui.lib).add(comp);
    }
  }

  // 2. 按 lib 分组加载
  for (const [lib, components] of libMap) {
    // 校验 lib 与 vueVersion 匹配
    const expectedVue = LIB_VUE_MAP[lib];  // {'element-ui':'2', 'element-plus':'3'}
    // 不匹配抛 UI_DEP_LIB_MISMATCH

    if (ui.full === true) {
      // full 模式短路加载全量包
      await this._loadUiFull(lib);
      continue;
    }

    // 3. base CSS 始终纳入
    const componentsToLoad = ['base', ...components];

    // 4. per-component 并行加载
    await Promise.all(componentsToLoad.map(comp =>
      this._loadUiComponent(lib, comp).catch(err => {
        if (comp === 'base') throw err;  // base 失败抛错
        // 单组件失败重试 1 次
        return this._loadUiComponentWithRetry(lib, comp, 1).catch(() => {
          console.warn(`[widget-loader] UI 组件 ${lib}/${comp} 加载失败，跳过`);
          // CSS 失败只记录不阻断主流程
        });
      })
    ));

    // 5. 注册到对应 Vue 运行时（加回 el- 前缀）
    this._registerUiComponents(lib, components);
  }
}
```

### 13.2 IIFE 全局挂载约定

```js
const UI_GLOBAL_VARS = {
  'element-ui': '__UI_ELEMENT_UI__',
  'element-plus': '__UI_ELEMENT_PLUS__'
};

// per-component IIFE bundle 挂载到 window[UI_GLOBAL_VARS[lib]]
// registerUiComponent 注册为 el-{componentName}
function registerUiComponent(lib, componentName, component) {
  const globalVar = UI_GLOBAL_VARS[lib];
  if (!window[globalVar]) window[globalVar] = {};
  window[globalVar][componentName] = component;

  // 注册到 Vue 运行时
  const Vue = lib === 'element-ui' ? window.Vue2 : window.Vue3;
  if (Vue) {
    const fullName = `el-${componentName}`;
    Vue.component(fullName, component);
    // Vue3 app 隔离：物料 app 需重新注册
  }
}
```

### 13.3 URL 规范

```text
{CDN_BASE}/ui/{lib}@{version}/{component}.js
{CDN_BASE}/ui/{lib}@{version}/{component}.css
{CDN_BASE}/ui/{lib}@{version}/base.css
{CDN_BASE}/ui/{lib}@{version}/manifest.json
{CDN_BASE}/ui/{lib}@{version}/full.js
{CDN_BASE}/ui/{lib}@{version}/full.css
```

### 13.4 manifest.json 格式

```json
{
  "lib": "element-plus",
  "version": "2.7.0",
  "globalVar": "__UI_ELEMENT_PLUS__",
  "baseCss": "base.css",
  "fullJs": "full.js",
  "fullCss": "full.css",
  "components": {
    "button": { "js": "button.js", "css": "button.css", "depends": [] },
    "table": { "js": "table.js", "css": "table.css", "depends": ["tooltip"] }
  }
}
```

### 13.5 失败处理与不阻断策略

实际代码的失败处理策略为「重试 + 记录 + 不阻断」，**不存在 30% 阈值降级与全量包兜底**（后者属 docs/elementui-on-demand-loading.md 设计态规划，未落地）：

```text
1. 单组件 JS 加载失败 → 重试 1 次（loadUiResourceWithRetry）
2. 仍失败 → 记入 failed 数组，不阻断整体 Promise
3. CSS 加载失败 → 只记录不阻断主流程（样式缺失只影响美观）
4. full:true 模式 full.js/full.css 加载失败 → 记入 failed，不阻断
5. 函数返回 { loaded, failed }，由调用方决定是否处理 failed
```

---

## 14. 声明式插件 Babel AST 转换

**文件**：`wc/widget-declarative-plugin/babel-plugin.js`

### 14.1 宏转换 `$widget()`

```js
// 源码：$widget('bi-sales-panel', { title: 'Q3' })
// 转换后：widgetMount({ name:'bi-sales-panel', js, css, vueVersion }, undefined, { title: 'Q3' })

module.exports = function babelPlugin({ types: t }, options) {
  const { macroName = '$widget', registry = {}, helperModule, helperName = 'widgetMount' } = options;
  const pluginState = { _widgetHelperImported: new Set() };

  return {
    visitor: {
      CallExpression(path, state) {
        // 1. 识别 $widget(name, props) 或 $widget(name, container, props)
        if (!t.isIdentifier(path.node.callee, { name: macroName })) return;

        const args = path.node.arguments;
        if (args.length < 2 || !t.isStringLiteral(args[0])) return;

        const widgetName = args[0].value;
        const props = args[args.length - 1];
        const container = args.length === 3 ? args[1] : t.identifier('undefined');

        // 2. 构建元信息表达式
        const meta = buildMetaExpression(widgetName, registry, t);

        // 3. 替换为 widgetMount(meta, container, props)
        path.replaceWith(
          t.callExpression(t.identifier(helperName), [meta, container, props])
        );

        // 4. 注入 helper import
        ensureHelperImport(path, helperModule, helperName, pluginState, t);
      }
    }
  };
};

function buildMetaExpression(widgetName, registry, t) {
  const meta = registry[widgetName];
  if (meta) {
    // registry 含该物料，内联 js/css/vueVersion
    return t.objectExpression([
      t.objectProperty(t.identifier('name'), t.stringLiteral(widgetName)),
      t.objectProperty(t.identifier('js'), t.stringLiteral(meta.js)),
      t.objectProperty(t.identifier('css'), t.stringLiteral(meta.css)),
      t.objectProperty(t.identifier('vueVersion'), t.stringLiteral(meta.vueVersion))
    ]);
  } else {
    // 否则只放 name，运行时远程解析
    return t.objectExpression([
      t.objectProperty(t.identifier('name'), t.stringLiteral(widgetName))
    ]);
  }
}
```

### 14.2 JSX 转换 `<Widget />`

```js
JSXElement(path) {
  // 识别 <Widget name="..." props={...} [container={...}] />
  const opening = path.node.openingElement;
  if (!t.isJSXIdentifier(opening.name, { name: jsxTag })) return;

  const attrs = opening.attributes;
  const nameAttr = attrs.find(a => a.name.name === 'name');
  if (!nameAttr || !t.isStringLiteral(nameAttr.value)) return;

  // 构建 widgetMount 调用
  const callExpr = t.callExpression(t.identifier(helperName), [meta, container, props]);

  // 作为 JSX 子节点用 jsxExpressionContainer 包裹
  path.replaceWith(t.jsxExpressionContainer(callExpr));
}
```

### 14.3 helper import 去重注入

```js
function ensureHelperImport(path, helperModule, helperName, pluginState, t) {
  const filename = path.hub.file.opts.filename;
  if (pluginState._widgetHelperImported.has(filename)) return;

  const program = path.findParent(p => p.isProgram());
  // 检查已存在同名 import
  const existing = program.node.body.find(
    node => t.isImportDeclaration(node) &&
            node.source.value === helperModule &&
            node.specifiers.some(s => s.local.name === helperName)
  );
  if (existing) {
    pluginState._widgetHelperImported.add(filename);
    return;
  }

  // unshiftContainer 注入
  program.unshiftContainer('body',
    t.importDeclaration(
      [t.importSpecifier(t.identifier(helperName), t.identifier(helperName))],
      t.stringLiteral(helperModule)
    )
  );
  pluginState._widgetHelperImported.add(filename);
}
```

### 14.4 Vite 插件远程 registry 联动

```js
// vite-plugin.js
export default function widgetVitePlugin(options) {
  let registryFetchPromise = null;

  return {
    name: 'widget-declarative',
    enforce: 'pre',

    async buildStart() {
      // 远程 registry 联动
      registryFetchPromise = fetchRemoteRegistry(options.registryUrl)
        .then(remote => {
          const remoteMap = normalizeRegistryArray(remote);
          // 静态优先覆盖远程
          return { ...remoteMap, ...options.registry };
        })
        .catch(() => options.registry);  // 失败回退静态 registry
    },

    async transform(code, id) {
      // 跳过 node_modules 与虚拟模块
      if (id.includes('node_modules') || id.includes('\0')) return null;

      // 快速跳过：源码不含声明式语法
      if (!code.includes(options.macroName || '$widget') &&
          !code.includes(options.jsxTag || 'Widget')) return null;

      // .vue 文件只转换 <script> 块
      if (id.endsWith('.vue')) {
        const { scriptContent, scriptStart } = extractVueScript(code);
        if (!scriptContent) return null;
        // 仅转换 script 块，不触碰 template
        const transformed = await babelTransform(scriptContent, ...);
        // 拼回原文件
        return code.slice(0, scriptStart) + transformed.code + code.slice(scriptStart + scriptContent.length);
      }

      // 等待 registry fetch 完成确保内联正确
      const registry = await registryFetchPromise;

      // Babel 转换
      const result = await babelTransformAsync(code, {
        plugins: [[babelPlugin, { ...options, registry }]]
      });
      return result;
    }
  };
}
```

### 14.5 降级模式

```js
// @babel/core 不可用时不转换
if (!babelCoreAvailable) {
  // 仅注入 import { widgetMount as $widget } 让宏指向运行时 helper
  // 运行时宏模式：$widget 在运行时解析为 widgetMount 调用
}
// 转换失败不阻断构建，告警并返回原码
```

---

## 15. DevTools 三层桥接架构

**文件**：`wc/devtools-extension/{manifest,panel,content-script,injected,devtools}.{json,js}`

### 15.1 三层数据流

```text
DevTools 面板 (panel.js)
  │ chrome.tabs.sendMessage
  ▼
Content Script (content-script.js，隔离世界，无法直接访问 window.widgetBus)
  │ CustomEvent 注入 injected.js 到 MAIN world
  ▼
Injected Script (injected.js，MAIN world，可访问 window)
  │ Hook customElements.define / widgetBus.emit / __wcDevtoolsBridge
  │
  ▼ CustomEvent 回传
Content Script
  │ sendResponse
  ▼
DevTools 面板渲染
```

### 15.2 injected.js Hook 实现

```js
// Hook customElements.define
const originalDefine = customElements.define.bind(customElements);
customElements.define = function(name, constructor, options) {
  if (name.startsWith('bi-')) {
    registeredWidgets.set(name, { name, constructor, registeredAt: Date.now() });
  }
  return originalDefine(name, constructor, options);
};

// Hook window.widgetBus.emit
if (window.widgetBus) {
  const originalEmit = window.widgetBus.emit;
  window.widgetBus.emit = function(type, payload) {
    busEvents.push({ type, payload, timestamp: Date.now() });
    if (busEvents.length > MAX_EVENTS) busEvents.shift();  // 环形缓冲 500 条
    return originalEmit.call(this, type, payload);
  };
}

// 暴露生命周期桥接
window.__wcDevtoolsBridge = {
  onLifecycle(event, payload) {
    lifecycleEvents.push({ event, payload, timestamp: Date.now() });
    if (lifecycleEvents.length > MAX_EVENTS) lifecycleEvents.shift();
  }
};
```

### 15.3 collectSnapshot

```js
function collectSnapshot() {
  const widgets = [];
  for (const [name, info] of registeredWidgets) {
    // 遍历 DOM 查找实例
    const elements = document.querySelectorAll(name);
    for (const el of elements) {
      widgets.push({
        name,
        status: el.isConnected ? 'connected' : 'disconnected',
        props: safePreview(el._props || (el._propsRef && el._propsRef.value)),
        scopeMeta: safePreview(el._scope && el._scope.meta),
        registeredAt: info.registeredAt
      });
    }
  }

  // 收集 runtime 全局变量
  const runtime = {
    Vue2: !!window.Vue2,
    Vue3: !!window.Vue3,
    ElementPlus: !!window.ElementPlus,
    lodash: !!window._,
    axios: !!window.axios,
    wcI18n: !!window.__wcI18n__,
    wcWidgetScope: !!window.__wcWidgetScope__,
    widgetBus: !!window.widgetBus
  };

  return { widgets, busEvents, lifecycleEvents, runtime };
}
```

### 15.4 safePreview 循环引用处理

```js
function safePreview(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    if (typeof value === 'function') return '[Function]';
    return value;
  }, 2).slice(0, 2000);  // 截断超长 JSON
}
```

---

## 16. 构建期 AST 风险扫描

**文件**：`wc/js-risk-scanner/index.js`

### 16.1 AST 优先（acorn + acorn-walk）

```js
function scanViaAST(source) {
  const ast = acornParse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const findings = [];

  walk.simple(ast, {
    MemberExpression(node) {
      // document.body / document.documentElement
      if (isDocumentBodyOrDocElMember(node)) {
        findings.push({ severity: 'high', node, pattern: 'document.body/documentElement' });
      }
      // Vue.prototype
      if (isVuePrototypeMember(node)) {
        findings.push({ severity: 'high', node, pattern: 'Vue.prototype' });
      }
      // app.config.globalProperties
      if (isAppGlobalPropsMember(node)) {
        findings.push({ severity: 'high', node, pattern: 'app.config.globalProperties' });
      }
    },
    AssignmentExpression(node) {
      // window.xxx = ...
      if (isWindowGlobalAssign(node)) {
        findings.push({ severity: 'high', node, pattern: 'window 全局赋值' });
      }
    },
    CallExpression(node) {
      // Vue.component / Vue.use
      if (isVueComponentUseCall(node)) {
        findings.push({ severity: 'high', node, pattern: 'Vue.component/use' });
      }
      // document.body.appendChild
      if (isBodyMountCall(node)) {
        findings.push({ severity: 'high', node, pattern: 'document.body 挂载' });
      }
      // document.querySelector 等
      if (isDocumentQueryCall(node)) {
        findings.push({ severity: 'medium', node, pattern: 'document 全局查询' });
      }
    },
    NewExpression(node) {
      // new Vuex.Store / new Pinia / new Vue() 事件总线
      if (isStateStoreNew(node)) {
        findings.push({ severity: 'high', node, pattern: 'Vuex/Pinia' });
      }
    },
    ImportDeclaration(node) {
      // import mitt / eventbus
      if (isEventBusImport(node)) {
        findings.push({ severity: 'high', node, pattern: 'mitt/EventBus' });
      }
    }
  });

  return findings;
}
```

### 16.2 正则回退（stripCommentsAndStrings）

```js
function stripCommentsAndStrings(source) {
  // 剥离注释和字符串，用空格占位保留列宽
  // 避免 P1-15 误报：旧实现把注释和字符串中的关键词判为风险
  return source
    .replace(/\/\/[^\n]*/g, match => ' '.repeat(match.length))      // 行注释
    .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length)) // 块注释
    .replace(/'([^'\\]|\\.)*'/g, match => ' '.repeat(match.length))  // 单引号字符串
    .replace(/"([^"\\]|\\.)*"/g, match => ' '.repeat(match.length))  // 双引号字符串
    .replace(/`([^`\\]|\\.)*`/g, match => ' '.repeat(match.length)); // 模板字符串
}
```

### 16.3 风险模式分级

```js
const RISK_PATTERNS = {
  high: [
    { pattern: 'document.body 挂载', regex: /document\.body\.(appendChild|insertBefore|append)/ },
    { pattern: 'window 全局赋值', test: isWindowGlobalAssign },
    { pattern: 'Vue.component/use', test: isVueComponentUseCall },
    { pattern: 'Vue.prototype', test: isVuePrototypeMember },
    { pattern: 'Vuex/Pinia', test: isStateStoreNew },
    { pattern: 'mitt/EventBus', test: isEventBusImport }
  ],
  medium: [
    { pattern: 'document 全局查询', test: isDocumentQueryCall },
    { pattern: 'document.body/documentElement 操作', test: isDocumentBodyMember }
  ]
};
```

---

## 17. 性能优化与 API 一致性改进

> 本节记录 6 项面向用户体验（降低学习成本、减少改造成本、提升性能）的优化，均为内部实现变更，不改变公开 API 签名，不需用户修改业务代码。

### 17.1 i18n t() 回退链 memoize

**问题**：`t()` 是渲染期最高频热路径，每次调用都重新计算 locale 回退链（split/includes/push），造成冗余计算。

**方案**：`getLocaleFallbackChain` 是纯函数，用模块级 Map 缓存计算结果，同一 locale 仅计算一次。

**收益**：高频 `t()` 调用从 O(chain-length) 降到 O(1) 查找。详见 [§8.1](#81-locale-回退链纯函数-memoize)。

### 17.2 scope.context/t 同步化

**问题**：`scope.context.get()` / `scope.context.onChange()` / `scope.t()` 是异步的（内部用 `import()` 懒加载），但全局 `getContext()` / `onContextChange()` / `t()` 是同步的。同一上下文存在两套异步语义，增加心智负担。

**方案**：将 `widget-context` / `i18n` 改为静态 import（`widget-bus` 已是静态），消除 `import()` 懒加载。`widget-loader` 保持懒加载（`loadWidget` 本身是异步操作）。

**收益**：scope API 与全局 API 语义完全一致，无需区分"scope 里是异步、全局是同步"。改造成本为零（公开 API 签名不变，仅返回值从 Promise 变为同步值，await 同步值不会报错）。

### 17.3 injectContext 序列化缓存

**问题**：`renderWidget` 每次挂载物料都调 `injectContext`，每次都 `JSON.stringify` 全量上下文。N 个物料 = N 次序列化。

**方案**：store 引入 `version` 字段，`setContext` / `clearContext` 变更时递增。`injectContext` 用三重缓存键（store 引用 + version + keys 指纹）缓存序列化结果。

**收益**：同一上下文版本下 N 次挂载仅序列化 1 次，后续直接复用缓存字符串。详见 [§10.2](#102-injectcontext-序列化缓存与兜底)。

### 17.4 unloadWidget 节点引用 O(1) 卸载

**问题**：`unloadWidget` 用 `document.querySelectorAll('script')` 全文档扫描移除节点，O(n) 且字符串匹配。

**方案**：加载时保存 DOM 节点引用到 `resourceNodes` Map，卸载时 O(1) 直接移除。找不到引用时回退 `querySelectorAll`。

**收益**：卸载从 O(n) 全文档扫描降到 O(1) 引用查找。详见 [§2.3](#23-资源节点引用与-o1-卸载)。

### 17.5 vueVersion 缺失告警

**问题**：`vueVersion` 默认 `'2'`，Vue3 物料若遗漏声明会被静默按 Vue2 校验，错误指向 Vue2 依赖链，极难排查。

**方案**：`checkDependencies` 检测到 `vueVersion === undefined` 时 `console.warn` 告警（不阻断），提示显式声明 `vueVersion`。

**收益**：开发者第一时间发现遗漏声明，避免静默降级带来的困惑。

### 17.6 Vue3 wrapper scope 条件注入

**问题**：Vue3 wrapper 无条件注入 `scope: this._scope`。若组件未声明 `scope` prop，Vue3 将其放入 `$attrs` 并 fallthrough 到根元素，渲染成无意义的 `scope="[object Object]"` attribute。

**方案**：通过 `getDeclaredPropNames(Component).includes('scope')` 检测组件是否声明了 `scope` prop，仅在声明时注入。

**收益**：消除 DOM 中无意义的 `scope` attribute，避免对 CSS 选择器 / DOM 查询产生干扰。详见 [§11.2](#112-解决方案forceupdate-物料组件实例)。

### 17.7 优化总览

| 编号 | 优化项 | 维度 | 改造影响 | 性能收益 |
| ------ | ------ | ------ | ------ | ------ |
| K1 | i18n 回退链 memoize | 性能 | 无 | t() 热路径 O(chain)→O(1) |
| K2 | scope.context/t 同步化 | 学习成本 | 无 | 消除 import() 开销 |
| K3 | injectContext 序列化缓存 | 性能 | 无 | N 次序列化→1 次 |
| K4 | unloadWidget 节点引用 | 性能 | 无 | O(n) 扫描→O(1) 查找 |
| K5 | vueVersion 缺失告警 | 学习成本 | 无 | 快速定位遗漏声明 |
| K6 | scope 条件注入 | 正确性 | 无 | 消除 $attrs fallthrough |

---

## 附录：关键实现索引

| 技术点 | 文件 | 关键行 |
| ------ | ------ | ------ |
| 轻量 semver | [widget-loader/index.js](file:///workspace/wc/widget-loader/index.js) | `satisfies` / `parseVersion` / `compareVersion` |
| 资源加载竞态 | [widget-loader/index.js](file:///workspace/wc/widget-loader/index.js) | `_loadScriptOnce` / `Promise.race` |
| 错误归因 | [widget-loader/index.js](file:///workspace/wc/widget-loader/index.js) | `attributeErrorToWidget` / `markWidgetFailed` |
| props 序列化 | [widget-loader/index.js](file:///workspace/wc/widget-loader/index.js) | `renderWidget` |
| props 反序列化 | [vue2-widget-template/widget-wrapper.js](file:///workspace/wc/vue2-widget-template/widget-wrapper.js) | `parseAttrValue` / `collectProps` |
| 循环检测 | [widget-scope/index.js](file:///workspace/wc/widget-scope/index.js) | `pendingAncestorsByHost` / `checkCycle` |
| PostCSS 命名空间 | [postcss-namespace.js](file:///workspace/wc/widget-wrapper-plugin/postcss-namespace.js) | `prefixSelector` / `GLOBAL_SELECTOR_PATTERNS` |
| schema 双策略 | [schema-generator/index.js](file:///workspace/wc/schema-generator/index.js) | `extractPropsViaAST` / `parseProps` |
| i18n 回退链 | [i18n/index.js](file:///workspace/wc/i18n/index.js) | `getLocaleFallbackChain` / `lookupInLocale` |
| bus 命名空间 | [widget-bus/index.js](file:///workspace/wc/widget-bus/index.js) | `createBus` / `handlers` Map |
| context 深比较 | [widget-context/index.js](file:///workspace/wc/widget-context/index.js) | `isDeepEqual` / `safeStringify` |
| Vue3 locale 重渲染 | [vite-plugin.js](file:///workspace/wc/widget-wrapper-plugin/vite-plugin.js) | `onLocaleChange` / `$forceUpdate` |
| Vue2 ignoredElements | [vue-cli-plugin.js](file:///workspace/wc/widget-wrapper-plugin/vue-cli-plugin.js) | `Vue.config.ignoredElements` 合并 |
| UI 按需加载 | [widget-loader/index.js](file:///workspace/wc/widget-loader/index.js) | `preloadUiDependencies` / `registerUiComponent` |
| 声明式 Babel 转换 | [babel-plugin.js](file:///workspace/wc/widget-declarative-plugin/babel-plugin.js) | `CallExpression` / `JSXElement` visitor |
| DevTools Hook | [injected.js](file:///workspace/wc/devtools-extension/injected.js) | `customElements.define` / `widgetBus.emit` Hook |
| AST 风险扫描 | [js-risk-scanner/index.js](file:///workspace/wc/js-risk-scanner/index.js) | `scanViaAST` / `stripCommentsAndStrings` |
| i18n 回退链缓存 | [i18n/index.js](file:///workspace/wc/i18n/index.js) | `_fallbackChainCache` / `getLocaleFallbackChain` |
| scope 同步化 | [widget-scope/index.js](file:///workspace/wc/widget-scope/index.js) | 静态 import `widget-context` / `i18n` |
| injectContext 缓存 | [widget-context/index.js](file:///workspace/wc/widget-context/index.js) | `store.version` / `_injectCacheVersion` |
| 资源节点引用 | [widget-loader/index.js](file:///workspace/wc/widget-loader/index.js) | `resourceNodes` Map / `unloadWidget` |
| vueVersion 告警 | [widget-loader/index.js](file:///workspace/wc/widget-loader/index.js) | `checkDependencies` |
| scope 条件注入 | [vite-plugin.js](file:///workspace/wc/widget-wrapper-plugin/vite-plugin.js) | `hasScopeProp` / `getDeclaredPropNames` |
