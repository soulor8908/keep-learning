/**
 * 原生 H5 物料组件自动包装器（无框架依赖）
 *
 * 适用场景：不需要 Vue/React 等框架的轻量物料，如纯展示卡片、
 * 简单交互组件、性能敏感的列表项等。
 *
 * 使用方式：
 *   1. 复制本文件到物料项目
 *   2. 实现 render(props, scope) 方法，返回 HTML 字符串或操作 DOM
 *   3. 通过环境变量 WIDGET_NAME 指定物料名
 *   4. 用任何打包工具（或直接 IIFE）输出 UMD/IIFE 格式 JS
 *
 * 核心模式（与 vue2/vue3-widget-template 一致）：
 * - 手写 HTMLElement + light DOM（禁止 Shadow DOM）
 * - 扁平化 props 协议：宿主把每个 prop 作为独立 kebab-case attribute 传入，
 *   包装层收集后作为扁平 props 对象传给 render(props, scope)
 * - 生命周期映射：connectedCallback/attributeChangedCallback/disconnectedCallback
 * - customElements.define 注册
 *
 * 与 Vue 模板的差异：
 * - 无 Vue 运行时依赖，checkDependencies 中 vueVersion='none' 跳过 Vue 校验
 * - 渲染直接用 innerHTML 或 DOM API，无响应式系统
 * - props 变化时需手动调用 render 重绘（无自动 diff）
 * - 可选接入 widget-bus 实现跨物料通信
 */

/**
 * 内建最小 scope（H5 模板独立运行时的兜底）
 * 仅提供 meta + log + no-op 的 context/bus/t/request，结构与 wc/widget-scope 一致。
 * 物料项目若需完整能力（上下文/事件总线/i18n/请求拦截），应通过 opts.scope
 * 注入由 wc/widget-scope 的 createWidgetScope() 创建的实例。
 *
 * 语义对齐（M2）：context.get/onChange、bus.emit/on/once、t 均为同步，
 * 与 wc/widget-scope 的同步语义一致，消除"同一 scope 两套异步语义"的心智负担。
 * request 保持 async（fetch 本身是异步操作）。
 */
function createMinimalScope(widgetName) {
  const meta = Object.freeze({
    name: widgetName,
    version: '',
    host: '',
    __isWidgetScope: true,
    __minimal: true
  });
  const noop = () => {};
  return Object.freeze({
    meta,
    log: {
      info: (...a) => console.log(`[${widgetName}]`, ...a),
      warn: (...a) => console.warn(`[${widgetName}]`, ...a),
      error: (...a) => console.error(`[${widgetName}]`, ...a),
      debug: () => {}
    },
    context: { get: () => ({}), onChange: () => noop },
    bus: { emit: noop, on: () => noop, once: () => noop },
    t: (k) => k,
    request: (url, options) => {
      if (typeof globalThis.fetch !== 'function') {
        return Promise.reject(new Error('[h5-widget-scope] fetch unavailable'));
      }
      return globalThis.fetch(url, options);
    },
    __noGlobalAccess: true
  });
}

// camelCase → kebab-case
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * 按属性值解析为最终值
 * R2-6：与 vue2/vue3 wrapper 的 Boolean 语义对齐——
 * 空 attribute（is-visible）与 "true" → true，"false" → false
 */
function parseAttrValue(raw) {
  if (raw === null) return undefined;
  if (raw === '' || raw === 'true') return true;
  if (raw === 'false') return false;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

/**
 * 创建原生物料的 Custom Element 类
 * @param {object} opts
 * @param {string} opts.name 物料名（Custom Element 标签名，如 bi-weather-card）
 * @param {function} opts.render 渲染函数，接收 (props, scope) ，返回 HTML 字符串
 * @param {function} [opts.onMount] 挂载后回调，接收 (element, props, scope)，可绑定事件
 * @param {function} [opts.onUnmount] 卸载前回调，接收 (element, scope)，可清理监听
 * @param {function} [opts.onPropsChange] props 变化回调，接收 (element, newProps, oldProps, scope)
 * @param {object} [opts.scope] 自定义 scope 实例（多 Host 场景），不传则按 name 自动创建
 * @param {string[]} [opts.props] 物料声明的独立 prop 名列表。提供后包装层会观察这些
 *   prop 对应的 kebab attribute，并把它们收集为扁平 props 对象传给 render。
 *   不传则不观察任何属性（render 收到空对象）。
 * @returns {typeof HTMLElement} Custom Element 类
 */
function createH5Widget(opts) {
  const { name, render, onMount, onUnmount, onPropsChange } = opts;

  if (!name || typeof render !== 'function') {
    throw new Error('[h5-widget-template] name 和 render 函数必须提供');
  }

  // 独立 prop 的 kebab attribute 名 → camel prop 名 映射
  const propAttrMap = new Map(
    (opts.props || []).map(p => [camelToKebab(p), p])
  );
  // 观察的属性：仅各独立 prop 的 kebab attribute（去重）
  const observedAttrs = [...new Set(propAttrMap.keys())];

  class H5WidgetElement extends HTMLElement {
    constructor() {
      super();
      this._props = null;
      this._cleanup = null;
      this._offLocale = null;
      // 每个物料实例创建独立的 widgetScope 软隔离对象，
      // 通过回调参数注入给物料，而非让物料直接访问 window
      // 优先用 opts.scope（多 Host 场景或注入完整 widget-scope 实例）；
      // 否则用内建的最小 scope 兜底（仅 meta/log），保证 H5 模板可独立运行
      this._scope = opts.scope || createMinimalScope(name);
      this._widgetScope = this._scope;
    }

    static get observedAttributes() {
      return observedAttrs;
    }

    /**
     * 收集所有已设置的独立 prop 属性，解析为扁平 props 对象传给 render
     */
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
      // 防御性守卫：若未来误引入 attachShadow，立即告警（与 vue2/vue3 wrapper 对齐）
      if (this.shadowRoot) {
        console.error(
          `[widget-wrapper] 物料 ${name} 检测到 shadowRoot，` +
          '基座全局样式将无法穿透。请勿使用 attachShadow。'
        );
      }
      this._props = this._collectProps();
      this._render();

      // 挂载后回调：绑定事件、初始化交互等；注入 scope 作为第三参数
      if (typeof onMount === 'function') {
        this._cleanup = onMount(this, this._props, this._scope) || null;
      }
      // 订阅 locale 变化重渲染（M2：与 vue2/vue3 wrapper 行为对齐）
      // 独立运行时通过 window.__wcI18n__ 全局实例订阅（若存在）；
      // scope.t() 会读取最新 locale 文案，_render 重绘即可刷新
      if (typeof window !== 'undefined' && window.__wcI18n__ && typeof window.__wcI18n__.onLocaleChange === 'function') {
        this._offLocale = window.__wcI18n__.onLocaleChange(() => this._render());
      }
    }

    disconnectedCallback() {
      // 卸载前回调：清理事件监听、定时器等；注入 scope
      if (typeof onUnmount === 'function') {
        onUnmount(this, this._scope);
      }
      if (this._offLocale) { this._offLocale(); this._offLocale = null; }
      if (typeof this._cleanup === 'function') {
        this._cleanup();
        this._cleanup = null;
      }
      // 清理 scope bus 上所有 window 事件监听器，防止泄漏
      if (this._scope && typeof this._scope.destroy === 'function') this._scope.destroy();
      this._props = null;
      this._scope = null;
      this._widgetScope = null;
    }

    attributeChangedCallback(attrName, oldValue, newValue) {
      // 首次挂载时 oldValue 为 null，但 connectedCallback 已统一收集，这里跳过
      if (oldValue === newValue) return;

      const oldProps = this._props;
      this._props = this._collectProps();
      this._render();

      // props 变化回调；注入 scope
      if (typeof onPropsChange === 'function') {
        onPropsChange(this, this._props, oldProps, this._scope);
      }
    }

    /**
     * 调用 render 函数渲染内容
     * render 返回 HTML 字符串时用 innerHTML 设置；
     * 返回 undefined/null 时不覆盖（允许 onMount 中手动操作 DOM）
     * 注入 scope 作为第二参数，让物料渲染时可读取上下文/翻译
     */
    _render() {
      if (typeof render !== 'function') return;
      const html = render(this._props, this._scope);
      if (typeof html === 'string') {
        this.innerHTML = html;
      }
    }

    /**
     * 外部获取当前 props（只读快照）
     */
    getProps() {
      return this._props ? { ...this._props } : {};
    }

    /**
     * 外部获取 widgetScope（只读）
     */
    getScope() {
      return this._scope;
    }
  }

  return H5WidgetElement;
}

// ─── 环境变量注入模式（与 vue2-widget-template 一致）───
// 通过 WIDGET_NAME 环境变量指定物料名，打包工具（webpack/vite/rollup）注入
const widgetName = typeof process !== 'undefined' && process.env && process.env.WIDGET_NAME;

if (widgetName) {
  // 默认导出：注册一个空的 H5 物料（占位），实际物料项目应覆盖 render 函数
  // 物料项目使用方式：
  //   import { createH5Widget } from './widget-wrapper';
  //   const Widget = createH5Widget({
  //     name: 'bi-weather-card',
  //     props: ['title', 'items'],
  //     render(props, scope) { return `<div class="bi-weather-card">...</div>`; },
  //     onMount(el, props, scope) { /* 绑定事件 */ },
  //   });
  //   customElements.define('bi-weather-card', Widget);
  //
  // 或直接在入口文件中调用 createH5Widget 并注册，不依赖环境变量
}

// 导出工厂函数供物料项目使用
// CommonJS + ESM 双格式导出，兼容不同打包工具
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createH5Widget };
}
// ESM 导出（打包工具支持时生效）
if (typeof exports !== 'undefined') {
  exports.createH5Widget = createH5Widget;
}
