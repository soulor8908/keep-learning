/**
 * 跨技术栈全局消息总线
 * 基于原生 CustomEvent，可被 Vue2/Vue3/原生 JS 共同使用
 */

const GLOBAL_BUS_NAME = 'bi-widget-bus';

/**
 * 发送全局消息
 * @param {string} type 消息类型
 * @param {any} payload 消息载荷
 * @param {Object} options
 * @param {boolean} options.bubbles 是否冒泡
 * @param {boolean} options.composed 是否穿透 Shadow DOM
 */
export function emit(type, payload, options = {}) {
  const event = new CustomEvent(`${GLOBAL_BUS_NAME}:${type}`, {
    detail: payload,
    bubbles: options.bubbles !== false,
    composed: options.composed !== false
  });
  window.dispatchEvent(event);
}

/**
 * 监听全局消息
 * @param {string} type 消息类型
 * @param {Function} handler 回调函数
 * @returns {Function} 取消监听函数
 */
export function on(type, handler) {
  const eventType = `${GLOBAL_BUS_NAME}:${type}`;
  const wrappedHandler = event => {
    // 包裹 try/catch 避免单个 handler 抛异常阻断 window 上其他同类型监听器
    try {
      handler(event.detail, event);
    } catch (e) {
      console.error('[widget-bus] listener error:', e);
    }
  };
  window.addEventListener(eventType, wrappedHandler);
  return () => {
    window.removeEventListener(eventType, wrappedHandler);
  };
}

/**
 * 监听一次全局消息
 * @param {string} type
 * @param {Function} handler
 * @returns {Function} 取消监听函数
 */
export function once(type, handler) {
  const off = on(type, (payload, event) => {
    off();
    handler(payload, event);
  });
  return off;
}

/**
 * Vue2 插件形式安装
 * 安装后可通过 this.$widgetBus.emit / this.$widgetBus.on 调用
 */
export const Vue2BusPlugin = {
  install(Vue) {
    Vue.prototype.$widgetBus = { emit, on, once };
  },
  uninstall(Vue) {
    delete Vue.prototype.$widgetBus;
  }
};

/**
 * Vue3 插件形式安装
 * 安装后可通过 app.config.globalProperties.$widgetBus 调用
 */
export const Vue3BusPlugin = {
  install(app) {
    app.config.globalProperties.$widgetBus = { emit, on, once };
  },
  uninstall(app) {
    delete app.config.globalProperties.$widgetBus;
  }
};

/**
 * 原生 JS 直接在 window 上暴露
 */
if (typeof window !== 'undefined') {
  window.widgetBus = { emit, on, once };
}

export default { emit, on, once, Vue2BusPlugin, Vue3BusPlugin };
