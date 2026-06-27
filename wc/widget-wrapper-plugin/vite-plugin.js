/**
 * 统一物料自动包装 Vite 插件
 *
 * 合并原 h5-vite-plugin 与 vite-plugin，通过 mode 区分：
 *   - mode='h5'  — 原生 H5 物料（无框架依赖，导出 render 函数/配置对象）
 *   - mode='vue3' — Vue3 物料（默认，导出 .vue 单文件组件）
 *
 * 入口约定（mode='h5'）：
 *   方式 A：导出 render 函数
 *     export default function render(props, scope) {
 *       return `<div class="bi-weather-card">...</div>`;
 *     }
 *   方式 B：导出配置对象
 *     export default {
 *       props: ['title', 'items'],
 *       render(props, scope) { return `<div>...</div>`; },
 *       onMount(el, props, scope) {},
 *       onUnmount(el, scope) {},
 *       onPropsChange(el, newProps, oldProps, scope) {}
 *     };
 *
 * 入口约定（mode='vue3'）：
 *   export default { ... } // Vue3 SFC 组件
 *
 * 用法（vite.config.js）：
 *   import widgetVitePlugin from 'wc/widget-wrapper-plugin/vite-plugin';
 *   export default {
 *     plugins: [
 *       // Vue3 物料
 *       widgetVitePlugin({
 *         name: 'bi-finance-panel',
 *         component: './src/components/FinancePanel.vue'
 *       }),
 *       // H5 物料
 *       widgetVitePlugin({
 *         name: 'bi-weather-card',
 *         mode: 'h5',
 *         entry: './src/weather-card.js'
 *       })
 *     ]
 *   };
 *
 * 构建产物：dist/{name}.js（UMD）+ dist/{name}.css
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createNamespacePlugin } from './postcss-namespace.cjs';

/**
 * 读取 shared/props.js 源码并去除 export 关键字，
 * 供 wrapper 生成时内联注入，确保工具函数单一来源。
 * @returns {string}
 */
function readSharedPropsCode() {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'shared', 'props.js'),
    'utf-8'
  );
  return src
    .replace(/\bexport\s+function\b/g, 'function')
    .trim();
}

const _sharedPropsCode = readSharedPropsCode();

// ─── external 模块集合（基座统一提供 window 全局变量）───
// 用 Set + 函数形式 external：lib 模式下数组形式 external 在 config hook 合并阶段
// 可能被自动外部化覆盖，导致 wc-i18n 等非 npm 包导入无法外部化。函数形式逐个判定更稳健。

// Vue3 物料的 external
const VUE3_EXTERNAL_IDS = new Set([
  'vue', 'element-plus', 'wc-i18n', 'wc-widget-scope', 'lodash', 'axios'
]);

// H5 物料的 external（无 Vue 依赖）
const H5_EXTERNAL_IDS = new Set([
  'wc-widget-scope', 'wc-i18n', 'lodash', 'axios'
]);

// ─── Vue3 Wrapper 生成 ───
function generateVue3Wrapper(widgetName, vueGlobal, uiDeps = []) {
  return `
import { createApp, h, ref } from 'vue';
import Component from '__WIDGET_ENTRY__';
import { createWidgetScope } from 'wc-widget-scope';
import { onLocaleChange } from 'wc-i18n';

// ─── 重要：禁止使用 Shadow DOM ───
// 不要改用 Vue3 官方的 defineCustomElement()——它默认调用 attachShadow()，
// 会把物料样式完全隔离，导致基座注入的 element-plus 全局样式 / 主题变量 / 字体图标无法穿透。
// 本包装层手写 HTMLElement + createApp().mount(this)，挂载到 light DOM，
// 与"不开启 Shadow DOM"的架构决策保持一致。

${_sharedPropsCode}

// 预计算 prop 映射
const individualPropNames = getDeclaredPropNames(Component).filter(n => n !== 'scope');
const attrToProp = new Map(individualPropNames.map(n => [camelToKebab(n), n]));
const observedAttrs = [...new Set(individualPropNames.map(camelToKebab))];

class WidgetElement extends HTMLElement {
  constructor() {
    super();
    this.app = null;
    this._propsRef = null;
    this._offLocale = null;
    this._widgetInstance = null;
    this._captureWidget = (el) => { this._widgetInstance = el; };
    this._scope = createWidgetScope({ name: '${widgetName}' });
    this._widgetScope = this._scope;
  }

  static get observedAttributes() {
    return observedAttrs;
  }

  connectedCallback() {
    if (this.shadowRoot) {
      console.error(
        '[widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，' +
        'element-plus 全局样式将无法穿透。请勿使用 defineCustomElement 或 attachShadow。'
      );
    }
    this._mount();
  }

  _mount() {
    if (this.app) return;
    this._propsRef = ref(this._collectProps());
    const hasScopeProp = getDeclaredPropNames(Component).includes('scope');
    this.app = createApp({
      render: () => {
        const props = { ...this._propsRef.value };
        if (hasScopeProp) props.scope = this._scope;
        return h(Component, {
          ref: this._captureWidget,
          ...props
        });
      }
    });
    const __WIDGET_UI_DEPS__ = ${JSON.stringify(uiDeps)};
    if (typeof window !== 'undefined' && window.ElementPlus && __WIDGET_UI_DEPS__.length > 0) {
      __WIDGET_UI_DEPS__.forEach(function(compName) {
        var pascalName = 'El' + compName.split('-').map(function(s) {
          return s.charAt(0).toUpperCase() + s.slice(1);
        }).join('');
        var comp = window.ElementPlus[pascalName];
        if (comp) {
          this.app.component(comp.name || pascalName, comp);
          this.app.component('el-' + compName, comp);
        }
      }, this);
    }
    this.app.mount(this);
    this._offLocale = onLocaleChange(() => {
      if (this._widgetInstance && this._widgetInstance.$forceUpdate) {
        this._widgetInstance.$forceUpdate();
      }
    });
  }

  _collectProps() {
    const result = {};
    for (const [attrName, propName] of attrToProp) {
      if (this.hasAttribute(attrName)) {
        result[propName] = parseAttrValue(this.getAttribute(attrName), getPropType(Component, propName));
      }
    }
    return result;
  }

  _updateProp(propName, newValue) {
    if (!this._propsRef) return;
    this._propsRef.value = {
      ...this._propsRef.value,
      [propName]: parseAttrValue(newValue, getPropType(Component, propName))
    };
  }

  disconnectedCallback() {
    if (this._offLocale) { this._offLocale(); this._offLocale = null; }
    if (this.app) {
      this.app.unmount();
      this.app = null;
      this._propsRef = null;
      this._widgetInstance = null;
      if (this._scope && typeof this._scope.destroy === 'function') this._scope.destroy();
      this._scope = null;
      this._widgetScope = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    const propName = attrToProp.get(name);
    if (propName && this.app) {
      this._updateProp(propName, newValue);
    }
  }
}

customElements.define('${widgetName}', WidgetElement);
`;
}

// ─── H5 Wrapper 生成 ───
function generateH5Wrapper(widgetName) {
  return `
import widgetEntry from '__WIDGET_ENTRY__';
import { createWidgetScope } from 'wc-widget-scope';
import { onLocaleChange } from 'wc-i18n';

// ─── 重要：禁止使用 Shadow DOM ───
// H5 物料挂载到 light DOM，与基座共享全局样式（主题、字体图标等）。

// 内建最小 scope（wc-widget-scope 不可用时的兜底）
function createMinimalScope(widgetName) {
  const meta = Object.freeze({
    name: widgetName,
    version: '',
    host: '',
    __isWidgetScope: true,
    __minimal: true
  });
  const noop = function() {};
  return Object.freeze({
    meta,
    log: {
      info: (...a) => console.log('[' + widgetName + ']', ...a),
      warn: (...a) => console.warn('[' + widgetName + ']', ...a),
      error: (...a) => console.error('[' + widgetName + ']', ...a),
      debug: function() {}
    },
    context: { get: function() { return {}; }, onChange: function() { return noop; } },
    bus: { emit: noop, on: function() { return noop; }, once: function() { return noop; } },
    t: function(k) { return k; },
    request: function(url, options) {
      if (typeof globalThis.fetch !== 'function') {
        return Promise.reject(new Error('[h5-widget-scope] fetch unavailable'));
      }
      return globalThis.fetch(url, options);
    },
    __noGlobalAccess: true
  });
}

// 解析入口
const widgetOpts = typeof widgetEntry === 'function'
  ? { render: widgetEntry }
  : (widgetEntry && typeof widgetEntry === 'object' ? widgetEntry : {});

const { render, onMount, onUnmount, onPropsChange, props: declaredProps, sanitize } = widgetOpts;

if (typeof render !== 'function') {
  throw new Error('[h5-widget-wrapper] 物料入口必须 default 导出 render 函数或含 render 的配置对象');
}

${_sharedPropsCode}

const propAttrMap = new Map(
  (Array.isArray(declaredProps) ? declaredProps : []).map(p => [camelToKebab(p), p])
);

class H5WidgetElement extends HTMLElement {
  constructor() {
    super();
    this._props = null;
    this._cleanup = null;
    this._offLocale = null;
    try {
      this._scope = createWidgetScope({ name: '${widgetName}' });
    } catch (e) {
      this._scope = createMinimalScope('${widgetName}');
    }
    this._widgetScope = this._scope;
  }

  static get observedAttributes() {
    return [...propAttrMap.keys()];
  }

  _collectProps() {
    const result = {};
    for (const [attrName, propName] of propAttrMap) {
      if (this.hasAttribute(attrName)) {
        result[propName] = parseAttrValue(this.getAttribute(attrName));
      }
    }
    return result;
  }

  connectedCallback() {
    if (this.shadowRoot) {
      console.error(
        '[h5-widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，' +
        '基座全局样式将无法穿透。请勿使用 attachShadow。'
      );
    }
    this._props = this._collectProps();
    this._render();
    if (typeof onMount === 'function') {
      this._cleanup = onMount(this, this._props, this._scope) || null;
    }
    this._offLocale = onLocaleChange(() => this._render());
  }

  disconnectedCallback() {
    if (this._offLocale) { this._offLocale(); this._offLocale = null; }
    if (typeof onUnmount === 'function') {
      onUnmount(this, this._scope);
    }
    if (typeof this._cleanup === 'function') {
      this._cleanup();
      this._cleanup = null;
    }
    if (this._scope && typeof this._scope.destroy === 'function') this._scope.destroy();
    this._props = null;
    this._scope = null;
    this._widgetScope = null;
  }

  attributeChangedCallback(attrName, oldValue, newValue) {
    if (oldValue === newValue) return;
    const oldProps = this._props;
    this._props = this._collectProps();
    this._render();
    if (typeof onPropsChange === 'function') {
      onPropsChange(this, this._props, oldProps, this._scope);
    }
  }

  _render() {
    if (typeof render !== 'function') return;
    let html = render(this._props, this._scope);
    if (typeof html === 'string') {
      if (typeof sanitize === 'function') html = sanitize(html);
      this.innerHTML = html;
    }
  }

  getProps() {
    return this._props ? Object.assign({}, this._props) : {};
  }

  getScope() {
    return this._scope;
  }
}

if (!customElements.get('${widgetName}')) {
  customElements.define('${widgetName}', H5WidgetElement);
}
`;
}

// ─── Dev-Preview HTML 模板 ───
function generateDevPreviewHtml(widgetName, props = []) {
  const propInputs = props.map(p =>
    `<label style="display:block;margin:4px 0">${p}: <input data-prop="${p}" value="" style="width:200px"></label>`
  ).join('\n      ');
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${widgetName} - Dev Preview</title>
  <style>
    body { font-family: sans-serif; margin: 0; display: flex; }
    #preview { flex: 1; padding: 20px; }
    #panel { width: 280px; padding: 16px; background: #f5f5f5; border-left: 1px solid #ddd; overflow-y: auto; }
    #panel h3 { margin-top: 0; }
    #panel label { font-size: 13px; }
    #panel input { font-size: 13px; padding: 2px 6px; }
  </style>
</head>
<body>
  <div id="preview">
    <${widgetName} id="widget"></${widgetName}>
  </div>
  <div id="panel">
    <h3>Props Editor</h3>
    <p style="font-size:12px;color:#888">${widgetName}</p>
    ${propInputs}
  </div>
  <script>
    // CSS HMR 客户端：监听服务端推送的样式更新，只替换 <style> 内容，不重新注册 Custom Element
    try {
      var __wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var __ws = new WebSocket(__wsProto + '//' + location.host);
      __ws.onmessage = function(e) {
        try {
          var msg = JSON.parse(e.data);
          if (msg.type === 'custom' && msg.event === 'widget-css-update') {
            var tag = document.querySelector('style[data-widget-hmr]');
            if (!tag) { tag = document.createElement('style'); tag.setAttribute('data-widget-hmr', '${widgetName}'); document.head.appendChild(tag); }
            tag.textContent = msg.css;
          }
        } catch(_) {}
      };
    } catch(_) {}
  </script>
  <script type="module" src="/src/__dev_preview_entry__.js"></script>
</body>
</html>`;
}

// ─── Dev-Preview 入口脚本模板 ───
function generateDevPreviewEntry(widgetName, entryPath, mode, uiDeps) {
  if (mode === 'h5') {
    return `
import widgetEntry from '${entryPath}';

${_sharedPropsCode}

const widgetOpts = typeof widgetEntry === 'function'
  ? { render: widgetEntry }
  : (widgetEntry && typeof widgetEntry === 'object' ? widgetEntry : {});

const { render, onMount, onUnmount, onPropsChange, props: declaredProps } = widgetOpts;
const propNames = Array.isArray(declaredProps) ? declaredProps : [];

class DevWidgetElement extends HTMLElement {
  constructor() { super(); this._props = {}; this._cleanup = null; }
  static get observedAttributes() { return propNames.map(camelToKebab); }
  _collectProps() {
    const result = {};
    for (const p of propNames) {
      const attr = camelToKebab(p);
      if (this.hasAttribute(attr)) {
        const raw = this.getAttribute(attr);
        try { result[p] = JSON.parse(raw); } catch { result[p] = raw; }
      }
    }
    return result;
  }
  connectedCallback() {
    this._props = this._collectProps();
    this._render();
    if (typeof onMount === 'function') this._cleanup = onMount(this, this._props, { meta: { name: '${widgetName}' } }) || null;
  }
  disconnectedCallback() {
    if (typeof onUnmount === 'function') onUnmount(this);
    if (typeof this._cleanup === 'function') this._cleanup();
  }
  attributeChangedCallback() {
    this._props = this._collectProps();
    this._render();
    if (typeof onPropsChange === 'function') onPropsChange(this, this._props, {}, { meta: { name: '${widgetName}' } });
  }
  _render() { if (typeof render === 'function') { const h = render(this._props, { meta: { name: '${widgetName}' } }); if (typeof h === 'string') this.innerHTML = h; } }
}
if (!customElements.get('${widgetName}')) customElements.define('${widgetName}', DevWidgetElement);

// Props editor 交互
const widget = document.getElementById('widget');
document.querySelectorAll('#panel input[data-prop]').forEach(input => {
  input.addEventListener('input', () => {
    const attr = camelToKebab(input.dataset.prop);
    if (input.value) widget.setAttribute(attr, input.value);
    else widget.removeAttribute(attr);
  });
});
`;
  }
  // Vue3 mode
  return `
import { createApp, h, ref } from 'vue';
import Component from '${entryPath}';

${_sharedPropsCode}

const propNames = getDeclaredPropNames(Component).filter(n => n !== 'scope');
const attrToProp = new Map(propNames.map(n => [camelToKebab(n), n]));
const observedAttrs = [...new Set(propNames.map(camelToKebab))];

class DevWidgetElement extends HTMLElement {
  constructor() { super(); this.app = null; this._propsRef = null; }
  static get observedAttributes() { return observedAttrs; }
  _collectProps() {
    const result = {};
    for (const [attr, prop] of attrToProp) {
      if (this.hasAttribute(attr)) result[prop] = parseAttrValue(this.getAttribute(attr), getPropType(Component, prop));
    }
    return result;
  }
  connectedCallback() {
    this._propsRef = ref(this._collectProps());
    this.app = createApp({ render: () => h(Component, this._propsRef.value) });
    ${uiDeps && uiDeps.length > 0 ? `const uiDeps = ${JSON.stringify(uiDeps)};
    if (typeof window !== 'undefined' && window.ElementPlus && uiDeps.length > 0) {
      uiDeps.forEach(function(compName) {
        var pascalName = 'El' + compName.split('-').map(function(s) { return s.charAt(0).toUpperCase() + s.slice(1); }).join('');
        var comp = window.ElementPlus[pascalName];
        if (comp) { this.app.component(comp.name || pascalName, comp); this.app.component('el-' + compName, comp); }
      }, this);
    }` : ''}
    this.app.mount(this);
  }
  disconnectedCallback() { if (this.app) { this.app.unmount(); this.app = null; } }
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this._propsRef) return;
    const prop = attrToProp.get(name);
    if (prop) this._propsRef.value = { ...this._propsRef.value, [prop]: parseAttrValue(newValue, getPropType(Component, prop)) };
  }
}
if (!customElements.get('${widgetName}')) customElements.define('${widgetName}', DevWidgetElement);

// Props editor 交互
const widget = document.getElementById('widget');
document.querySelectorAll('#panel input[data-prop]').forEach(input => {
  input.addEventListener('input', () => {
    const attr = camelToKebab(input.dataset.prop);
    if (input.value) widget.setAttribute(attr, input.value);
    else widget.removeAttribute(attr);
  });
});
`;
}

// ─── 简单 UI 依赖提取（从源码中提取 el-xxx 组件名）───
function extractUiDependencies(source) {
  const deps = new Set();
  const re = /<el-([\w-]+)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    deps.add(m[1]);
  }
  // 也匹配 resolveComponent('ElXxx') / resolveComponent('el-xxx')
  const re2 = /resolveComponent\(['"](?:el-|El)([\w-]+)['"]\)/g;
  while ((m = re2.exec(source)) !== null) {
    const name = m[1].replace(/([A-Z])/g, (c, i) => (i ? '-' : '') + c.toLowerCase());
    deps.add(name);
  }
  return [...deps];
}

/**
 * 统一物料 Vite 插件
 * @param {object} options
 * @param {string} options.name 物料名（Custom Element 标签名）
 * @param {'h5'|'vue3'} [options.mode='vue3'] 物料模式
 * @param {string} [options.component] Vue3 物料入口 .vue 文件路径（mode='vue3' 时必填）
 * @param {string} [options.entry] H5 物料入口 .js 文件路径（mode='h5' 时必填）
 * @param {string} [options.vueGlobal='Vue3'] Vue 全局变量名（mode='vue3'）
 * @param {string} [options.cssFileName] CSS 输出文件名（默认同 name）
 * @param {boolean} [options.autoNamespace=true] 是否开启 PostCSS 自动命名空间
 */
export default function widgetVitePlugin(options = {}) {
  const {
    name,
    mode = 'vue3',
    component,
    entry,
    vueGlobal = 'Vue3',
    cssFileName = name,
    autoNamespace = true
  } = options;

  const isH5 = mode === 'h5';

  // 参数校验
  if (!name) {
    throw new Error('[widget-vite-plugin] 请配置 name');
  }
  if (isH5 && !entry) {
    throw new Error('[widget-vite-plugin] H5 模式请配置 entry');
  }
  if (!isH5 && !component) {
    throw new Error('[widget-vite-plugin] Vue3 模式请配置 component');
  }

  const entryPath = isH5
    ? path.resolve(process.cwd(), entry)
    : path.resolve(process.cwd(), component);

  if (!fs.existsSync(entryPath)) {
    throw new Error(`[widget-vite-plugin] 入口文件不存在: ${entryPath}`);
  }

  // 生成 wrapper 代码
  const uiDeps = !isH5 ? extractUiDependencies(fs.readFileSync(entryPath, 'utf-8')) : [];
  const wrapperCode = isH5
    ? generateH5Wrapper(name)
    : generateVue3Wrapper(name, vueGlobal, uiDeps);

  const tmpFile = path.join(os.tmpdir(), `widget-wrapper-${name}-${Date.now()}.js`);
  fs.writeFileSync(tmpFile, wrapperCode);

  // dev-preview 模式标志，在 config hook 中根据 command 判定
  let isDevPreview = false;
  let devEntryFile = null;

  // ─── 异常退出时清理临时文件（Ctrl+C / kill）───
  const cleanupTempFiles = () => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    if (devEntryFile) {
      try { fs.unlinkSync(devEntryFile); } catch (_) {}
    }
  };
  const onSigInt = () => { cleanupTempFiles(); process.exit(130); };
  const onSigTerm = () => { cleanupTempFiles(); process.exit(143); };
  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  const namespacePlugin = autoNamespace ? createNamespacePlugin(name) : null;

  const externalIds = isH5 ? H5_EXTERNAL_IDS : VUE3_EXTERNAL_IDS;

  const globals = isH5
    ? {
        'wc-widget-scope': '__wcWidgetScope__',
        'wc-i18n': '__wcI18n__',
        'lodash': '_',
        'axios': 'axios'
      }
    : {
        vue: vueGlobal,
        'element-plus': 'ElementPlus',
        'wc-i18n': '__wcI18n__',
        'wc-widget-scope': '__wcWidgetScope__',
        'lodash': '_',
        'axios': 'axios'
      };

  // ─── 提取 prop 名列表（用于 dev-preview props 编辑面板）───
  let devPropNames = [];
  if (!isH5) {
    // Vue3: 从源码静态分析 props
    const source = fs.readFileSync(entryPath, 'utf-8');
    // 匹配 props: ['a', 'b'] 或 props: { a: ..., b: ... }
    const arrayMatch = source.match(/props\s*:\s*\[([^\]]*)\]/);
    if (arrayMatch) {
      devPropNames = arrayMatch[1].match(/['"](\w+)['"]/g)?.map(s => s.replace(/['"]/g, '')) || [];
    } else {
      const objMatch = source.match(/props\s*:\s*\{([^}]*)\}/);
      if (objMatch) {
        devPropNames = objMatch[1].match(/^\s*(\w+)\s*[:{,]/gm)?.map(s => s.trim().split(/[\s:{,]/)[0]) || [];
      }
    }
  } else {
    // H5: 从源码提取 props 数组
    const source = fs.readFileSync(entryPath, 'utf-8');
    const match = source.match(/props\s*:\s*\[([^\]]*)\]/);
    if (match) {
      devPropNames = match[1].match(/['"](\w+)['"]/g)?.map(s => s.replace(/['"]/g, '')) || [];
    }
  }

  return {
    name: isH5 ? 'h5-widget-wrapper-plugin' : 'widget-wrapper-plugin',
    enforce: 'pre',
    resolveId(source) {
      // dev-preview 模式不 external 依赖（直接用本地模块）
      if (isDevPreview) return null;
      if (externalIds.has(source)) {
        return { id: source, external: true };
      }
      return null;
    },
    config(userConfig, env) {
      const command = env && env.command;
      isDevPreview = command === 'serve';

      if (isDevPreview) {
        // ─── Dev-Preview 模式：生成预览入口，跳过 lib 构建配置 ───
        const devEntryCode = generateDevPreviewEntry(name, entryPath, mode, uiDeps);
        devEntryFile = path.join(os.tmpdir(), `widget-dev-entry-${name}-${Date.now()}.js`);
        fs.writeFileSync(devEntryFile, devEntryCode);

        // 生成 dev-preview index.html（如果项目根目录不存在）
        const htmlPath = path.resolve(process.cwd(), 'index.html');
        if (!fs.existsSync(htmlPath)) {
          fs.writeFileSync(htmlPath, generateDevPreviewHtml(name, devPropNames));
        }

        return {
          resolve: {
            alias: {
              __WIDGET_ENTRY__: entryPath
            }
          },
          ...(namespacePlugin ? {
            css: { postcss: { plugins: [namespacePlugin] } }
          } : {})
        };
      }

      // ─── Build 模式：标准 lib 构建 ───
      return {
        build: {
          sourcemap: true,
          cssCodeSplit: false,
          lib: {
            entry: tmpFile,
            name,
            fileName: () => `${name}.js`,
            formats: ['umd'],
            ...(isH5 ? { cssFileName } : {})
          },
          rollupOptions: {
            external: (id) => externalIds.has(id),
            output: { globals }
          }
        },
        resolve: {
          alias: {
            __WIDGET_ENTRY__: entryPath
          }
        },
        ...(namespacePlugin ? {
          css: {
            postcss: {
              plugins: [namespacePlugin]
            }
          }
        } : {})
      };
    },
    configureServer(server) {
      // dev-preview: 将 dev entry 文件注册为虚拟模块
      if (isDevPreview && devEntryFile) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/src/__dev_preview_entry__.js') {
            const code = fs.readFileSync(devEntryFile, 'utf-8');
            res.setHeader('Content-Type', 'application/javascript');
            res.end(code);
            return;
          }
          next();
        });

        // ─── CSS HMR：监听样式文件变化，推送更新到 dev-preview 页面 ───
        // Custom Element 注册后无法重复注册，但 CSS 只需替换 <style> 内容即可热更新。
        // 监听 src/ 下的 .css 文件变化，读取内容后通过 WS 推送到浏览器。
        const cssWatcher = server.watcher;
        cssWatcher.on('change', (file) => {
          if (!/\.(css|scss|sass|less|styl)$/.test(file)) return;
          try {
            const css = fs.readFileSync(file, 'utf-8');
            server.ws.send({ type: 'custom', event: 'widget-css-update', css });
          } catch (_) {}
        });
      }
    },
    async handleHotUpdate({ file, server }) {
      // dev-preview 模式下，CSS 文件变化时推送更新（补充 configureServer 中的 watcher）
      if (isDevPreview && /\.(css|scss|sass|less|styl)$/.test(file)) {
        try {
          const css = fs.readFileSync(file, 'utf-8');
          server.ws.send({ type: 'custom', event: 'widget-css-update', css });
        } catch (_) {}
      }
    },
    closeBundle() {
      // ─── CSS 文件重命名（Vite 5.4 兼容）───
      if (!isH5 && !isDevPreview) {
        try {
          const outputDir = path.resolve(process.cwd(), 'dist');
          const defaultCssPath = path.join(outputDir, 'style.css');
          const targetCssPath = path.join(outputDir, `${name}.css`);
          if (fs.existsSync(defaultCssPath)) {
            fs.renameSync(defaultCssPath, targetCssPath);
          }
        } catch (e) {
          console.warn(`[widget-vite-plugin] 物料 ${name} CSS 重命名失败:`, e.message);
        }
      }

      // 清理临时文件
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      if (devEntryFile) {
        try { fs.unlinkSync(devEntryFile); } catch (_) {}
      }

      // 移除信号监听，避免重复清理
      process.removeListener('SIGINT', onSigInt);
      process.removeListener('SIGTERM', onSigTerm);
    }
  };
}

// 导出 wrapper 生成函数，供外部复用
export { generateVue3Wrapper, generateH5Wrapper };
