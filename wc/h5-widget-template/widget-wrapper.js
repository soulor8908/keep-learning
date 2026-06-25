/**
 * 原生 H5 物料组件自动包装器（无框架依赖）
 *
 * 适用场景：不需要 Vue/React 等框架的轻量物料，如纯展示卡片、
 * 简单交互组件、性能敏感的列表项等。
 *
 * 使用方式：
 *   1. 复制本文件到物料项目
 *   2. 实现 render(config) 方法，返回 HTML 字符串或操作 DOM
 *   3. 通过环境变量 WIDGET_NAME 指定物料名
 *   4. 用任何打包工具（或直接 IIFE）输出 UMD/IIFE 格式 JS
 *
 * 核心模式（与 vue2/vue3-widget-template 一致）：
 * - 手写 HTMLElement + light DOM（禁止 Shadow DOM）
 * - config attribute 协议（String → JSON.parse → Object）
 * - 生命周期映射：connectedCallback/attributeChangedCallback/disconnectedCallback
 * - customElements.define 注册
 *
 * 与 Vue 模板的差异：
 * - 无 Vue 运行时依赖，checkDependencies 中 vueVersion='none' 跳过 Vue 校验
 * - 渲染直接用 innerHTML 或 DOM API，无响应式系统
 * - config 变化时需手动调用 render 重绘（无自动 diff）
 * - 可选接入 widget-bus 实现跨物料通信
 */

/**
 * 创建原生物料的 Custom Element 类
 * @param {object} opts
 * @param {string} opts.name 物料名（Custom Element 标签名，如 bi-weather-card）
 * @param {function} opts.render 渲染函数，接收 config 对象，返回 HTML 字符串
 * @param {function} [opts.onMount] 挂载后回调，接收 (element, config)，可绑定事件
 * @param {function} [opts.onUnmount] 卸载前回调，接收 element，可清理监听
 * @param {function} [opts.onConfigChange] config 变化回调，接收 (element, newConfig, oldConfig)
 * @returns {typeof HTMLElement} Custom Element 类
 */
function createH5Widget(opts) {
  const { name, render, onMount, onUnmount, onConfigChange } = opts;

  if (!name || typeof render !== 'function') {
    throw new Error('[h5-widget-template] name 和 render 函数必须提供');
  }

  class H5WidgetElement extends HTMLElement {
    constructor() {
      super();
      this._config = null;
      this._cleanup = null;
    }

    static get observedAttributes() {
      return ['config'];
    }

    /**
     * 解析 config attribute 为 Object
     * 解析失败时返回空对象，不抛错（与 Vue 模板的 parseConfig 一致）
     */
    _parseConfig(value) {
      try {
        return value ? JSON.parse(value) : {};
      } catch (e) {
        console.error(`[${name}] config parse error:`, e);
        return {};
      }
    }

    connectedCallback() {
      this._config = this._parseConfig(this.getAttribute('config'));
      this._render();

      // 挂载后回调：绑定事件、初始化交互等
      if (typeof onMount === 'function') {
        this._cleanup = onMount(this, this._config) || null;
      }
    }

    disconnectedCallback() {
      // 卸载前回调：清理事件监听、定时器等
      if (typeof onUnmount === 'function') {
        onUnmount(this);
      }
      if (typeof this._cleanup === 'function') {
        this._cleanup();
        this._cleanup = null;
      }
      this._config = null;
    }

    attributeChangedCallback(attrName, oldValue, newValue) {
      if (attrName !== 'config') return;
      // 值未变化时跳过（首次挂载时 oldValue 为 null）
      if (oldValue === newValue) return;

      const oldConfig = this._config;
      this._config = this._parseConfig(newValue);
      this._render();

      // config 变化回调
      if (typeof onConfigChange === 'function') {
        onConfigChange(this, this._config, oldConfig);
      }
    }

    /**
     * 调用 render 函数渲染内容
     * render 返回 HTML 字符串时用 innerHTML 设置；
     * 返回 undefined/null 时不覆盖（允许 onMount 中手动操作 DOM）
     */
    _render() {
      if (typeof render !== 'function') return;
      const html = render(this._config);
      if (typeof html === 'string') {
        this.innerHTML = html;
      }
    }

    /**
     * 外部获取当前 config（只读快照）
     */
    getConfig() {
      return this._config ? { ...this._config } : {};
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
  //     render(config) { return `<div class="bi-weather-card">...</div>`; },
  //     onMount(el, config) { /* 绑定事件 */ },
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
