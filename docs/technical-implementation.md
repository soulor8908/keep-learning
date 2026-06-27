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
  if (name === ancestors.self) {
    throw new Error(`[widget-scope] 循环加载检测：${name} -> ${name}`);
  }
  // 2. 祖先链命中
  if (ancestors.has(name)) {
    const chain = [...ancestors, name].join(' -> ');
    throw new Error(`[widget-scope] 循环加载检测：试图加载祖先物料，链路 ${chain}`);
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

### 8.1 locale 回退链

```js
// 模块级缓存（K1）：getLocaleFallbackChain 是纯函数（locale → 确定性数组），
// 同一 locale 仅计算一次，后续命中 Map 缓存直接返回，避免 t() 热路径反复构造链
const _fallbackChainCache = new Map();

function getLocaleFallbackChain(locale) {
  // 1. 缓存命中：纯函数结果可复用
  const cached = _fallbackChainCache.get(locale);
  if (cached) return cached;

  // 2. 构造回退链
  const chain = [locale];
  const baseLang = String(locale).split('-')[0];
  if (baseLang !== locale) chain.push(baseLang);

  // 最终回退：先 en 再 zh（保证至少能找到文案）
  if (!chain.includes('en')) chain.push('en');
  if (!chain.includes('zh')) chain.push('zh');

  // 3. 写入缓存
  _fallbackChainCache.set(locale, chain);
  return chain;
  // 'zh-CN' → ['zh-CN', 'zh', 'en', 'zh']
  // 'en-GB' → ['en-GB', 'en', 'zh']
}
```

**K1 memoize 收益**：`t(key)` 是物料渲染与 loader 错误提示的热路径，每次都需先 `getLocaleFallbackChain(currentLocale)` 得到链再逐项 `lookupInLocale`。未缓存时回退链每次重新构造数组（含 split / push / includes），缓存后同一 locale 仅计算一次，`t()` 调用从 `O(chain)` 降为 `O(1)` 查找 + `O(chain)` 查字典（字典查找不可省，但数组构造与 split 成本被消除）。缓存 key 为 locale 字符串，命中率高且无失效问题（locale 切换只是查另一个 key）。

### 8.2 点分键查找

```js
function lookupInLocale(messages, locale, key) {
  const parts = key.split('.');
  let cur = messages[locale];
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
    const val = lookupInLocale(messages, locale, key);
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

### 10.2 injectContext 序列化兜底

```js
// ─── injectContext 序列化缓存（K3）───
// renderWidget 每次挂载物料都调 injectContext，每次都 JSON.stringify 全量上下文。
// N 个物料 = N 次序列化。这里用三重缓存键（store 引用 + version + keys 指纹）
// 缓存序列化结果：上下文未变时复用同一字符串，避免重复 stringify。
let _injectCacheStore = null;        // 缓存时的 store 引用（检测 store 切换/重建）
let _injectCacheVersion = -1;        // 缓存时的 store.version（检测上下文变更）
let _injectCacheKeysFp = undefined;  // 缓存时的 keys 指纹（JSON.stringify(keys)，检测 keys 变化）
let _injectCacheSerialized = null;   // 缓存的序列化结果

function injectContext(element, keys) {
  const context = getContext(keys);
  const store = getStore();  // window.__wcContext__，含 version 字段
  const filtered = keys ? pick(context, keys) : context;
  const keysFp = keys ? JSON.stringify(keys) : null;

  // 三重缓存键命中判定：store 引用 + version + keys 指纹 一致且已缓存过
  const cacheHit = store
    && store === _injectCacheStore
    && store.version === _injectCacheVersion
    && _injectCacheKeysFp === keysFp
    && _injectCacheSerialized !== null;

  let json;
  if (cacheHit) {
    json = _injectCacheSerialized;                 // 命中复用
  } else {
    try {
      json = JSON.stringify(filtered);             // 优先 JSON.stringify（快）
    } catch (e) {
      json = safeStringify(filtered);              // 失败回退 safeStringify（WeakSet 去环）
      if (!json) json = '{}';                       // 再失败为 '{}'
    }
    // 只有 store 存在时才写缓存（SSR 无 window 场景 store 为 null，不缓存）
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

**K3 三重缓存键说明**：

| 缓存键 | 检测场景 |
| ------ | ------ |
| `store === _injectCacheStore` | store 引用变化（基座重建 `window.__wcContext__`，或 iframe/微前端切换 store） |
| `store.version === _injectCacheVersion` | 上下文内容变更（`setContext` / `clearContext` 时 `store.version++`，缓存自动失效） |
| `_injectCacheKeysFp === keysFp` | `keys` 参数变化（不同物料传入不同 keys 子集） |

**收益**：N 个物料同页挂载时，序列化从 N 次降为 1 次（首次未命中算 1 次，后续 N-1 次命中缓存）。上下文变更后下一次 inject 自动重算并更新缓存，无需手动失效。

> store.version 字段由 `widget-context` 维护，详见 [design.md §3.5](file:///workspace/docs/design.md)。

### 10.3 safeStringify

```js
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';  // 循环引用
      seen.add(value);
    }
    return value;
  });
}
```

---

## 11. Vue3 包装层 locale 重渲染关键决策

**文件**：`wc/widget-wrapper-plugin/vite-plugin.js` / `wc/vue3-widget-template/widget-wrapper.js`

### 11.1 问题

Vue3 的 `shouldUpdateComponent` 在 props 未变时会跳过子组件重渲染。仅替换 `_propsRef.value` 无法让物料重渲染。

### 11.2 解决方案：forceUpdate 物料组件实例

```js
// 生成 wrapper 时注入 ref 捕获物料组件实例
class WidgetElement extends HTMLElement {
  connectedCallback() {
    // ...
    this._app = createApp({
      render: () => h(Component, {
        ...this._propsRef.value,
        scope: this._scope,
        ref: this._captureWidget  // 捕获物料组件实例
      })
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

### 12.2 合并去重方案

```js
function generateVue2Wrapper(widgetName, vueGlobal) {
  return `
    import Vue from 'vue';
    import Component from '__WIDGET_COMPONENT__';

    // ─── 合并 ignoredElements，避免覆盖其他物料配置 ───
    const existing = Vue.config.ignoredElements || [];
    const merged = [...new Set([...existing, '${widgetName}'])];
    // 去重检查 /^el-/ 是否已存在（避免污染 element-ui 配置）
    if (!merged.some(e => /^el-/.test(e) === false && e === '${widgetName}')) {
      Vue.config.ignoredElements = merged;
    }

    // ... 其余 wrapper 逻辑
  `;
}
```

**关键**：用合并而非覆盖，去重检查 `/^el-/` 是否已存在，避免污染基座或其他物料配置。

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

### 13.5 降级链路（3 级）

```text
1. 单组件加载失败 → 重试 1 次
2. 缺失组件数超 30% 阈值 → 触发全量包降级
3. 全量包仍失败 → 渲染错误占位（复用 renderFallback）
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

**目标**：在保持现有功能与对外 API 兼容的前提下，针对热路径性能、API 语义一致性、内存治理与可观测性做一轮系统化加固。共 20 项优化：K1-K6 为既有热路径与语义对齐（已完成），N1-N14 为新增的健壮性、内存与可观测性改进。

### 17.1 总览

| 编号 | 主题 | 文件 | 收益 |
| ------ | ------ | ------ | ------ |
| K1 | i18n t() 回退链 memoize | `wc/i18n/index.js` | t() 热路径 O(chain)→O(1) |
| K2 | scope.context/t 同步化 | `wc/widget-scope/index.js` | 消除两套异步语义 |
| K3 | injectContext 序列化缓存 | `wc/widget-context/index.js` | N 次序列化→1 次 |
| K4 | unloadWidget 节点引用 O(1) 卸载 | `wc/widget-loader/index.js` | O(n) 扫描→O(1) 查找 |
| K5 | vueVersion 缺失告警 | `wc/widget-loader/index.js` | 快速定位遗漏声明 |
| K6 | Vue3 wrapper scope 条件注入 | `wc/widget-wrapper-plugin/vite-plugin.js` | 防 $attrs fallthrough 到根元素 |
| N1 | vueGlobal 默认值对齐基座 | `wc/widget-wrapper-plugin/{vite,vue-cli}-plugin.js` | 物料默认 externals 名与基座一致 |
| N2 | scope.bus 补 off 方法 | `wc/widget-scope/index.js` | 与 widgetBus API 完全对齐 |
| N3 | UI_DEP_LIB_MISMATCH 纳入 WidgetError 枚举 | `wc/widget-loader/index.js` | 用户可用枚举捕获 |
| N4 | vueVersion 非法值白名单校验 | `wc/widget-loader/index.js` | 防 'Vue3'/3 等非法值静默回退 vue2 |
| N5 | loadScript/loadStyle 错误信息补全物料名 | `wc/widget-loader/index.js` | error.widgetName 便于定位 |
| N6 | preloadUiDependencies 错误信息加物料名 | `wc/widget-loader/index.js` | UI 依赖失败时定位物料 |
| N7 | SUPPORTED_DEPS .d.ts 补全 lodash/axios 类型 | `wc/widget-loader/index.d.ts` | TS 用户获得类型提示 |
| N8 | checkDependencies 移进 try 块 | `wc/widget-loader/index.js` | i18n 失败不冒泡到无意义的重试按钮 |
| N9 | markWidgetFailed 延迟清理 mountedWidgets | `wc/widget-loader/index.js` | 5 分钟无重试则清理，防内存泄漏 |
| N10 | unloadWidget 清理 mountedWidgets 同名条目 | `wc/widget-loader/index.js` | 防内存泄漏 |
| N11 | pendingAncestorsByHost 失败回滚 | `wc/widget-scope/index.js` | 失败时清除预置祖先链，防泄漏+循环误判 |
| N12 | DevTools registeredWidgets 改用 Map 去重 | `wc/devtools-extension/injected.js` | 防内存+CPU 双泄漏 |
| N13 | 构建期 warn 含物料名 | `wc/widget-wrapper-plugin/*.js` | CSS重命名/schema生成失败时提示是哪个物料 |
| N14 | i18n addMessages locale 归一化 | `wc/i18n/index.js` | zh-CN 归一到 zh，与字典 key 一致 |

### 17.2 K1 — i18n t() 回退链 memoize

**问题**：`t(key)` 是物料渲染与 loader 错误提示的热路径，每次调用都先 `getLocaleFallbackChain(currentLocale)` 构造回退链数组（含 `split('-')` / `push` / `includes`）。看板单页物料数十个、每个物料渲染多次 `t()`，重复构造链造成无谓开销。

**方案**：`getLocaleFallbackChain` 是纯函数（locale → 确定性数组），用模块级 `Map<locale, chain>` 缓存结果，同一 locale 仅计算一次。详见 [§8.1](#81-locale-回退链)。

**收益**：`t()` 调用从 `O(chain)` 数组构造降为 `O(1)` Map 查找 + `O(chain)` 字典查找（字典查找不可省，但数组构造与 split 成本被消除）。缓存 key 为 locale 字符串，命中率高且无失效问题。

### 17.3 K2 — scope.context/t 同步化

**问题**：原实现中 `widget-scope` 懒加载 `widget-context` 与 `i18n`，导致 `scope.context.get()` / `scope.t()` 返回 Promise 或需 await，与全局 `getContext` / `t()` 的同步语义不一致——同一上下文两套异步语义，物料开发者心智负担重，且初始化时同步读取数据时机丢失。

**方案**：改为静态 `import` 同步引入 `widget-context`（`getContext` / `onContextChange`）与 `i18n`（`t`），`scope.context.get` / `scope.context.onChange` / `scope.t` 直接同步调用全局 API。`widget-loader` 保持懒加载（`loadWidget` 本身就是异步操作）。

```js
// wc/widget-scope/index.js
import { createBus } from '../widget-bus/index.js';        // 已同步（事件总线本就是同步 API）
import { getContext, onContextChange } from '../widget-context/index.js';  // K2：同步引入
import { t } from '../i18n/index.js';                       // K2：同步引入
// widget-loader 仍懒加载：loadWidget/mountWidget 本身是异步操作
```

**收益**：消除「同一上下文两套异步语义」的心智负担；初始化时同步读取 context 不再丢时机；与全局 API 行为一致。`widget-context` / `i18n` 由基座通过 `external` + 全局变量提供，同步引入不增加物料包首屏体积。

### 17.4 K3 — injectContext 序列化缓存

**问题**：`renderWidget` 每次挂载物料都调 `injectContext(element)`，每次都 `JSON.stringify` 全量上下文。看板 N 个物料同页 = N 次全量序列化，上下文未变也重复算。

**方案**：用三重缓存键（`store` 引用 + `store.version` + `keys` 指纹）缓存序列化字符串。`widget-context` 在 `setContext` / `clearContext` 时 `store.version++`，缓存键自动失效。详见 [§10.2](#102-injectcontext-序列化兜底)。

**收益**：N 个物料同页挂载时序列化从 N 次降为 1 次（首次未命中算 1 次，后续 N-1 次命中）。上下文变更后下一次 inject 自动重算并更新缓存，无需手动失效。

### 17.5 K4 — unloadWidget 节点引用 O(1) 卸载

**问题**：`unloadWidget(name)` 清理 `<script>` / `<link>` 节点时，原实现遍历 `document.head.children` 比对 `src`/`href`，O(n) 扫描 DOM（n 为 head 子节点总数，含其他物料与基座自身的节点）。

**方案**：`WidgetLoader` 新增 `resourceNodes: Map<url, DOMNode>`，`_loadScriptOnce` / `_loadStyleOnce` 创建节点后 `resourceNodes.set(url, node)`。`unloadWidget` 直接 `resourceNodes.get(url)` 拿到节点引用 O(1) 移除。

```js
// wc/widget-loader/index.js
class WidgetLoader {
  constructor(opts) {
    // ...
    this.resourceNodes = new Map();  // K4：url → DOM node，供 unloadWidget O(1) 移除
  }
  _loadScriptOnce(url, opts) {
    // ...
    document.head.appendChild(script);
    this.resourceNodes.set(url, script);  // 保存引用
  }
  unloadWidget(name) {
    const { js, css } = this.widgetResources.get(name) || {};
    if (js) {
      const node = this.resourceNodes.get(js);  // O(1) 查找
      if (node && node.parentNode) node.parentNode.removeChild(node);
      this.resourceNodes.delete(js);
      this.loadedResources.delete(js);
    }
    // css 同理
  }
}
```

**收益**：卸载复杂度从 O(n) DOM 扫描降为 O(1) Map 查找。head 子节点越多（看板物料多、基座样式多）收益越显著。

### 17.6 K5 — vueVersion 缺失告警

**问题**：物料未声明 `vueVersion` 时默认按 Vue2 校验。Vue3 物料若漏声明会被静默按 Vue2 校验通过（基座恰好提供 Vue2），但运行时却用 Vue3 渲染，出现难以定位的「校验通过但实际不兼容」假象。

**方案**：`checkDependencies` 检测到 `widget.vueVersion === undefined` 时 `console.warn`（不阻断，仍按默认 '2' 校验），提示开发者显式声明 `'2'` / `'3'` / `'none'`。

```js
if (widget.vueVersion === undefined) {
  console.warn(
    `[widget-loader] 物料 ${name} 未声明 vueVersion，默认按 Vue2 校验。` +
    `Vue3 物料请显式声明 vueVersion:'3'，H5 物料请声明 vueVersion:'none'。`
  );
}
```

**收益**：快速定位遗漏声明。warn 而非 throw 保证存量物料平滑过渡（不会因告警中断加载）。

### 17.7 K6 — Vue3 wrapper scope 条件注入

**问题**：Vue3 wrapper 无条件把 `scope` 注入到物料组件 props。当业务组件未声明 `scope` prop 时，`scope` 会作为 fallthrough attribute 透传到根元素，污染根元素属性（`<bi-xxx scope="[object Object]">`），并触发 Vue3 的 attribute 继承告警。

**方案**：渲染时检测业务组件是否声明了 `scope` prop，仅在声明时注入：

```js
// wc/widget-wrapper-plugin/vite-plugin.js（generateVue3Wrapper 生成代码内）
_mount() {
  this._propsRef = ref(this._collectProps());
  const hasScopeProp = getDeclaredPropNames(Component).includes('scope');  // K6
  this.app = createApp({
    render: () => {
      const props = { ...this._propsRef.value };
      if (hasScopeProp) props.scope = this._scope;  // 仅声明时注入
      return h(Component, { ref: this._captureWidget, ...props });
    }
  });
  // ...
}
```

**收益**：防 `$attrs` fallthrough 到根元素；与 Vue3 默认 attribute 继承行为兼容；不影响已声明 `scope` prop 的物料。

### 17.8 N1 — vueGlobal 默认值对齐基座

**问题**：原 `widget-wrapper-plugin` 的 `vueGlobal` 默认值 `'Vue'`，但基座 Vue2 / Vue3 全局变量实际是 `window.Vue2` / `window.Vue3`。物料未显式配置 `vueGlobal` 时，UMD externals `vue` 映射到不存在的 `window.Vue`，运行时报 `Vue is not defined`。

**方案**：默认值按基座实际全局变量名对齐：

| 插件 | 旧默认 | 新默认（N1） | 基座全局变量 |
| ------ | ------ | ------ | ------ |
| `widgetVitePlugin`（Vue3） | `'Vue'` | `'Vue3'` | `window.Vue3` |
| `widgetVueCliPlugin`（Vue2） | `'Vue'` | `'Vue2'` | `window.Vue2` |

模板配置同步对齐（demo `vue.config.js` / `vite.config.js` 不再显式传 `vueGlobal` 也能正确 externals）。

**收益**：物料零配置即可正确 externals 到基座全局变量；消除「忘了配 vueGlobal」导致运行时 `Vue is not defined` 的常见踩坑。

### 17.9 N2 — scope.bus 补 off 方法

**问题**：`widget-bus` 的 `createBus` 提供 `emit / on / once / off` 四方法，但 `widget-scope` 包装 `scope.bus` 时漏实现 `off`，导致物料调用 `scope.bus.off(type, handler)` 抛 `TypeError: off is not a function`，只能用 `on` 返回的取消函数，无法按 handler 反查移除。

**方案**：`scope.bus` 补 `off` 方法，与 `widgetBus` API 完全对齐：

```js
const bus = {
  emit(type, payload, options) { /* try/catch */ },
  on(type, cb) { /* 返回取消函数 */ },
  once(type, cb) { /* 返回取消函数 */ },
  off(type, cb) {  // N2：补全
    try {
      if (busInstance && busInstance.off) busInstance.off(type, cb);
    } catch (e) { log.error('bus.off failed:', e.message); }
  }
};
```

**收益**：`scope.bus` 与 `window.widgetBus` API 完全对齐，物料在 scope 与全局 bus 之间迁移零成本；`off` 按 handler 反查移除 once 注册的监听（与 widget-bus §9.2 一致）。

### 17.10 N3 — UI_DEP_LIB_MISMATCH 纳入 WidgetError 枚举

**问题**：`preloadUiDependencies` 检测到 `uiDependencies.lib` 与 `vueVersion` 不匹配时抛错，但错误码用裸字符串 `'UI_DEP_LIB_MISMATCH'`，未挂到 `WidgetError` 枚举。用户用 `err.code === WidgetError.UI_DEP_LIB_MISMATCH` 捕获时拿到 `undefined`，只能用裸字符串硬编码。

**方案**：`WidgetError` 枚举新增 `UI_DEP_LIB_MISMATCH`：

```js
const WidgetError = {
  LOAD_TIMEOUT: 'LOAD_TIMEOUT',
  SCRIPT_ERROR: 'SCRIPT_ERROR',
  CSS_ERROR: 'CSS_ERROR',
  DEP_VERSION_MISMATCH: 'DEP_VERSION_MISMATCH',
  ELEMENT_TIMEOUT: 'ELEMENT_TIMEOUT',
  PROPS_ERROR: 'PROPS_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UI_DEP_LIB_MISMATCH: 'UI_DEP_LIB_MISMATCH'  // N3：纳入枚举
};
```

**收益**：用户可用 `err.code === WidgetError.UI_DEP_LIB_MISMATCH` 枚举捕获，与其它错误码处理方式一致。

### 17.11 N4 — vueVersion 非法值白名单校验

**问题**：`checkDependencies` 原仅 `if (vueVersion !== 'none' && vueVersion !== '3')` 走 Vue2 分支，导致 `vueVersion: 'Vue3'` / `vueVersion: 3`（数字）/ `vueVersion: 'vue2'` 等非法值静默回退到 Vue2 校验，掩盖物料声明错误。

**方案**：白名单校验，非法值直接报错：

```js
// vueVersion 白名单校验（N4）：非法值不静默回退到 vue2
if (!['2', '3', 'none'].includes(vueVersion)) {
  errors.push(
    `物料 ${name} 的 vueVersion="${vueVersion}" 不合法，必须为 '2'、'3' 或 'none'`
  );
}
```

**收益**：防 `'Vue3'` / `3` / `'vue2'` 等非法值静默回退到 vue2，物料声明错误在加载阶段即暴露。

### 17.12 N5 — loadScript/loadStyle 错误信息补全物料名

**问题**：`loadScript` / `loadStyle` 失败抛错只含 URL，不含物料名。错误信息形如 `Failed to load script: https://cdn/.../bi-finance-panel.js`，用户需从 URL 反推物料名，定位成本高。

**方案**：`loadWidget` catch 错误后补全 `error.widgetName` 字段：

```js
try {
  checkDependencies(widget);
  await Promise.all([this.loadScript(js), this.loadStyle(css)]);
  // ...
} catch (error) {
  // 错误信息补全物料名（N5）：loadScript/loadStyle 的错误只含 URL，补全后用户可直接定位
  if (!error.widgetName) {
    error.widgetName = name;
  }
  throw error;
}
```

**收益**：错误信息含物料名，用户可直接定位是哪个物料加载失败。

### 17.13 N6 — preloadUiDependencies 错误信息加物料名

**问题**：`preloadUiDependencies` 抛 `UI_DEP_LIB_MISMATCH` 时错误信息只含 lib 名，不含物料名，用户不知道是哪个物料的 UI 依赖配置错。

**方案**：错误信息加物料名：

```js
if (!LIB_VUE_MAP[lib]) {
  throw createUiError(`物料 ${widget.name} 的 uiDependencies.lib 未知: ${lib}（N6）`, WidgetError.UI_DEP_LIB_MISMATCH);
}
if (LIB_VUE_MAP[lib] !== vv) {
  throw createUiError(
    `物料 ${widget.name} vueVersion=${vv} 但 uiDependencies.lib=${lib}（期望 vueVersion=${LIB_VUE_MAP[lib]}）`,
    WidgetError.UI_DEP_LIB_MISMATCH
  );
}
```

**收益**：UI 依赖失败时错误信息含物料名，定位更直接。

### 17.14 N7 — SUPPORTED_DEPS .d.ts 补全 lodash/axios 类型声明

**问题**：`wc/widget-loader/index.d.ts` 的 `SUPPORTED_DEPS` 类型只声明 `vue2` / `vue3`，缺 `lodash` / `axios`，TS 用户访问 `SUPPORTED_DEPS.lodash` 报类型错误。

**方案**：`.d.ts` 补全：

```ts
export const SUPPORTED_DEPS: {
  vue2: SupportedDep;
  vue3: SupportedDep;
  lodash: SupportedDep;   // N7：补全
  axios: SupportedDep;    // N7：补全
};
```

`SupportedDep.globalVar` 类型也补 `'_' | 'axios'`。

**收益**：TS 用户访问 `SUPPORTED_DEPS.lodash` / `.axios` 不报类型错误，IDE 自动补全正确。

### 17.15 N8 — checkDependencies 移进 try 块

**问题**：`loadWidget` 原把 `checkDependencies(widget)` 放在 try 块外。`checkDependencies` 内部调 `t()` 翻译错误信息，若 i18n 字典加载失败 `t()` 抛错，异常冒泡到 `mountWidget` 的 catch，被当成「物料加载失败」渲染带「点击重试」的降级占位——但 i18n 失败与物料本身无关，点重试也不会修 i18n，按钮毫无意义。

**方案**：把 `checkDependencies` 移进 try 块，i18n 失败时异常被同一 catch 处理，错误信息走「物料加载失败」链路但不下发无意义的重试按钮（`onRetry = null`）：

```js
try {
  checkDependencies(widget);  // N8：移进 try，i18n 失败不冒泡到无意义的重试按钮
  await Promise.all([this.loadScript(js), this.loadStyle(css)]);
  await this.waitForCustomElement(name);
  this.definedElements.add(name);
  this.widgetResources.set(name, { js, css });
} catch (error) {
  // 统一处理：i18n 失败、版本不兼容、加载失败都走这里
  // ...
}
```

**收益**：i18n 失败不再冒泡到无意义的重试按钮；错误处理路径统一。

### 17.16 N9 — markWidgetFailed 延迟清理 mountedWidgets

**问题**：`markWidgetFailed` 标记 `entry.failed = true` 后渲染降级占位（含「点击重试」）。`onRetry` 闭包需读 `entry`（清除 failed 标记后重挂载），故 entry 不能立即 delete。但若用户 5 分钟内不点重试，entry 永久驻留 `mountedWidgets` Map，element 也无法被 GC（Map 持有 element 引用），导致内存泄漏。

**方案**：`markWidgetFailed` 渲染降级占位后启动 5 分钟定时器，到期若 entry 仍 failed（未点重试）则 delete：

```js
markWidgetFailed(element, error) {
  // ... 标记 failed、移除崩溃元素、emit error、renderFallback ...

  // 延迟清理（N9）：保留 entry 供 onRetry 使用，5 分钟后无重试则清理，防内存泄漏
  setTimeout(() => {
    const e = this.mountedWidgets.get(element);
    if (e && e.failed) {
      this.mountedWidgets.delete(element);
    }
  }, 5 * 60 * 1000);
}
```

`onRetry` 闭包在用户点重试时立即 `mountedWidgets.delete(element)` 清除 failed 标记后重挂载（与新元素 entry 区分）。

**收益**：防内存泄漏——5 分钟无重试则清理 entry，element 可被 GC；用户点重试时仍能正常工作。

### 17.17 N10 — unloadWidget 清理 mountedWidgets 同名条目

**问题**：`unloadWidget(name)` 清理 `<script>` / `<link>` 与 `widgetResources` / `loadedResources` / `definedElements`，但漏清理 `mountedWidgets` 中该物料的已挂载实例条目。卸载后实例 entry 残留 Map，element 持续被引用无法 GC。

**方案**：`unloadWidget` 遍历 `mountedWidgets` 清理同名条目：

```js
unloadWidget(name) {
  // ... 清理 resourceNodes / loadedResources / widgetResources / definedElements ...

  // 清理该物料的已挂载实例（N10：防内存泄漏）
  for (const [el, entry] of this.mountedWidgets) {
    if (entry.widget.name === name) {
      this.mountedWidgets.delete(el);
    }
  }
}
```

**收益**：防内存泄漏——卸载后实例 entry 不残留，element 可被 GC；与 `unmountWidget(element)` 行为对齐（后者已 delete entry）。

### 17.18 N11 — pendingAncestorsByHost 失败回滚

**问题**：`scope.loader.loadWidget(child)` / `mountWidget(container, child)` 先 `propagateAncestors(child.name)` 把祖先链写入 `pendingAncestorsByHost`，再调底层 loader 加载。若加载失败（网络 / 版本不兼容 / 元素注册超时），预置的祖先链不清理，残留 Map：

- 内存泄漏：失败物料的祖先链条目永久驻留。
- 循环检测误判：后续同名子物料正常加载时，会消费到残留的祖先链，可能误判为循环。

**方案**：`loadWidget` / `mountWidget` 在底层 loader 调用 catch 时回滚，清除预置的祖先链条目：

```js
async loadWidget(widget) {
  if (!widget || !widget.name) throw new Error('...');
  checkCycle(widget.name);
  propagateAncestors(widget.name);  // 预置祖先链
  const mod = await getLoaderModule();
  const inst = mod.defaultLoader || mod;
  try {
    return await inst.loadWidget(widget);
  } catch (e) {
    // 失败回滚：清除预置的祖先链，避免泄漏 + 循环检测误判（N11）
    const bucket = getAncestorBucket(host);
    bucket.delete(widget.name);
    throw e;
  }
}
```

`mountWidget` 同样处理。

**收益**：防内存泄漏 + 循环检测误判——失败时祖先链不残留；正常加载路径行为不变（`consumePendingAncestors` 在子物料 `createWidgetScope` 时已 delete）。

### 17.19 N12 — DevTools registeredWidgets 改用 Map 去重

**问题**：DevTools `injected.js` Hook `customElements.define` 时用数组 `push` 记录注册物料。同一物料名重复 `define`（HMR / 重载）会重复 push，数组无限增长：

- 内存泄漏：数组条目数随 HMR 次数线性增长。
- CPU 泄漏：`collectSnapshot` 遍历数组查 DOM，重复条目导致重复 `querySelectorAll`。

**方案**：改用 `Map<name, { name, timestamp }>` 去重，同名物料只保留最新注册时间：

```js
var registeredWidgetsMap = new Map();   // N12：Map<name, { name, timestamp }> 同名物料只保留最新注册时间

customElements.define = function (name, constructor, options) {
  if (typeof name === 'string' && name.indexOf('bi-') === 0) {
    registeredWidgetsMap.set(name, { name: name, timestamp: Date.now() });  // set 自动去重
  }
  return origDefine(name, constructor, options);
};
```

`collectSnapshot` 改用 `Array.from(registeredWidgetsMap.values())` 遍历。

**收益**：防内存 + CPU 双泄漏——HMR 重载不再导致数组线性增长；`collectSnapshot` 不再重复扫描同名物料。

### 17.20 N13 — 构建期 warn 含物料名

**问题**：构建期 `widget-wrapper-plugin` 在 CSS 命名空间扫描、schema 生成等环节告警时不含物料名，用户看到 warn 不知道是哪个物料出问题。

**方案**：所有 warn / error 信息含物料名 `${widgetName}`：

```js
console.warn(`[widget-wrapper-plugin] 物料 ${widgetName} CSS 命名空间检查: ${formatCssIssues(issues)}`);
console.warn(`[widget-wrapper-plugin] 物料 ${widgetName} schema 生成失败: ${e.message}`);
```

**收益**：CSS 重命名 / schema 生成 / 风险扫描失败时提示是哪个物料，定位更直接。

### 17.21 N14 — i18n addMessages locale 归一化

**问题**：`addMessages(locale, msgs)` 原直接以传入 locale 为 key 写字典。物料调用 `addMessages('zh-CN', msgs)` 会写入 `messages['zh-CN']`，但 `t()` 查找时按回退链 `['zh-CN', 'zh', 'en', 'zh']`，若 `zh-CN` 字典未注册则回退到 `zh`。结果：

- 物料用 `zh-CN` 注入文案，但 `setLocale('zh-CN')` 时回退链查 `zh` 字典，注入的文案查不到。
- 字典出现 `zh-CN` 与 `zh` 两个并行桶，重复且易遗漏。

**方案**：`addMessages` 入口归一化 locale 到 base lang：

```js
let addMessages = function addMessages(locale, msgs) {
  // 归一化到 base locale（N14）：使 addMessages('zh-CN', ...) 与 addMessages('zh', ...)
  // 写入同一个 messages 桶，避免重复桶 / 查找遗漏
  const normalizedLocale = String(locale).split('-')[0];  // 'zh-CN' → 'zh'
  if (!messages[normalizedLocale]) messages[normalizedLocale] = {};
  deepMerge(messages[normalizedLocale], msgs);
}
```

**收益**：`addMessages('zh-CN', ...)` 与 `addMessages('zh', ...)` 写入同一桶，与字典 key（base lang）一致；消除重复桶与查找遗漏。

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
| 性能优化与 API 一致性改进 | [i18n/index.js](file:///workspace/wc/i18n/index.js) / [widget-context/index.js](file:///workspace/wc/widget-context/index.js) / [widget-scope/index.js](file:///workspace/wc/widget-scope/index.js) / [widget-loader/index.js](file:///workspace/wc/widget-loader/index.js) / [widget-wrapper-plugin/vite-plugin.js](file:///workspace/wc/widget-wrapper-plugin/vite-plugin.js) / [devtools-extension/injected.js](file:///workspace/wc/devtools-extension/injected.js) | K1-K6 + N1-N14（详见 §17） |
