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
import { createNamespacePlugin } from './postcss-namespace.js';

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

// camelCase → kebab-case，把 prop 名映射为可观察的 attribute 名
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// 提取业务组件声明的 prop 名列表（数组 / 对象 / <script setup> defineProps 产物）
function getDeclaredPropNames(Component) {
  const props = Component && Component.props;
  if (!props) return [];
  if (Array.isArray(props)) return props.filter(p => typeof p === 'string');
  return Object.keys(props);
}

// 取某个 prop 的声明类型构造器
function getPropType(Component, name) {
  const props = Component && Component.props;
  if (!props || Array.isArray(props)) return null;
  const def = props[name];
  if (!def) return null;
  if (Array.isArray(def)) return def;
  if (typeof def === 'function') return def;
  return def.type || null;
}

// 按属性值与 prop 类型解析为最终值
function parseAttrValue(raw, type) {
  if (type === Boolean) {
    if (raw === '' || raw === 'true') return true;
    if (raw === 'false') return false;
    return true;
  }
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

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

const { render, onMount, onUnmount, onPropsChange, props: declaredProps } = widgetOpts;

if (typeof render !== 'function') {
  throw new Error('[h5-widget-wrapper] 物料入口必须 default 导出 render 函数或含 render 的配置对象');
}

// camelCase → kebab-case
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// 按属性值解析为最终值
function parseAttrValue(raw) {
  if (raw === null) return undefined;
  if (raw === '' || raw === 'true') return true;
  if (raw === 'false') return false;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

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
    const html = render(this._props, this._scope);
    if (typeof html === 'string') {
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

  return {
    name: isH5 ? 'h5-widget-wrapper-plugin' : 'widget-wrapper-plugin',
    enforce: 'pre',
    resolveId(source) {
      if (externalIds.has(source)) {
        return { id: source, external: true };
      }
      return null;
    },
    config: () => ({
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
    }),
    closeBundle() {
      // ─── CSS 文件重命名（Vite 5.4 兼容）───
      // Vue3 模式：Vite 5.4 lib 不支持 cssFileName，CSS 默认输出 style.css
      // H5 模式：cssFileName 在 Vite 6+ 才生效，5.4 仍输出 style.css
      if (!isH5) {
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

      // 清理临时 wrapper 文件
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  };
}

// 导出 wrapper 生成函数，供外部复用
export { generateVue3Wrapper, generateH5Wrapper };
