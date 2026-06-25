/**
 * 跨技术栈全局消息总线
 * 基于原生 CustomEvent，可被 Vue2/Vue3/原生 JS 共同使用
 *
 * 命名空间隔离：默认全局总线 GLOBAL_BUS_NAME='bi-widget-bus'，所有页面共享。
 * 若同一页面存在多个 Host 实例（如 iframe 内嵌、微前端嵌套），可通过
 * createBus(hostId) 创建独立命名空间的总线，避免 A 基座的事件被 B 基座监听。
 */

const GLOBAL_BUS_NAME = 'bi-widget-bus';

/**
 * 创建带命名空间隔离的消息总线
 * @param {string} [namespace] 命名空间标识（如 hostId），省略则用全局总线
 * @returns {{emit: Function, on: Function, once: Function, off: Function}} 隔离的总线实例
 */
export function createBus(namespace) {
  const busName = namespace ? `${GLOBAL_BUS_NAME}:${namespace}` : GLOBAL_BUS_NAME;

  // handlers: eventType -> Set<{ handler, wrapped }>
  // 用于 off(type, handler) 时按原 handler 反查 wrapped 并移除。
  // 记录的是用户传入的原 handler，因此对 on 与 once 注册的都能正确移除。
  const handlers = new Map();

  function getEventSet(eventType) {
    if (!handlers.has(eventType)) handlers.set(eventType, new Set());
    return handlers.get(eventType);
  }

  function emit(type, payload, options = {}) {
    const event = new CustomEvent(`${busName}:${type}`, {
      detail: payload,
      bubbles: options.bubbles !== false,
      composed: options.composed !== false
    });
    window.dispatchEvent(event);
  }

  function on(type, handler, originalHandler) {
    const eventType = `${busName}:${type}`;
    const wrappedHandler = event => {
      // 包裹 try/catch 避免单个 handler 抛异常阻断 window 上其他同类型监听器
      try {
        handler(event.detail, event);
      } catch (e) {
        console.error('[widget-bus] listener error:', e);
      }
    };
    window.addEventListener(eventType, wrappedHandler);
    // 记录“原 handler”用于 off 反查：once 内部传入包装函数作为 handler，
    // 但通过 originalHandler 透传用户原始 handler，使 off(type, userHandler) 也能命中。
    const entry = { handler: originalHandler || handler, wrapped: wrappedHandler };
    getEventSet(eventType).add(entry);

    return () => {
      window.removeEventListener(eventType, wrappedHandler);
      const set = handlers.get(eventType);
      if (set) {
        set.delete(entry);
        if (set.size === 0) handlers.delete(eventType);
      }
    };
  }

  function once(type, handler) {
    // 通过第三个参数透传原 handler，使 off(type, handler) 也能移除 once 注册的监听。
    const off = on(type, (payload, event) => {
      off();
      handler(payload, event);
    }, handler);
    return off;
  }

  /**
   * 按类型与原 handler 取消订阅
   * @param {string} type 消息类型
   * @param {Function} handler 原 on/once 注册时传入的 handler
   */
  function off(type, handler) {
    const eventType = `${busName}:${type}`;
    const set = handlers.get(eventType);
    if (!set) return;
    for (const entry of set) {
      if (entry.handler === handler) {
        try { window.removeEventListener(eventType, entry.wrapped); } catch (e) { /* ignore */ }
        set.delete(entry);
      }
    }
    if (set.size === 0) handlers.delete(eventType);
  }

  return { emit, on, once, off };
}

// 默认全局总线实例（向后兼容现有 emit/on/once 导出）
const defaultBus = createBus();

/**
 * 发送全局消息
 * @param {string} type 消息类型
 * @param {any} payload 消息载荷
 * @param {Object} options
 * @param {boolean} options.bubbles 是否冒泡
 * @param {boolean} options.composed 是否穿透 Shadow DOM
 */
export const emit = defaultBus.emit;

/**
 * 监听全局消息
 * @param {string} type 消息类型
 * @param {Function} handler 回调函数
 * @returns {Function} 取消监听函数
 */
export const on = defaultBus.on;

/**
 * 监听一次全局消息
 * @param {string} type
 * @param {Function} handler
 * @returns {Function} 取消监听函数
 */
export const once = defaultBus.once;

/**
 * 按类型与原 handler 取消订阅
 * @param {string} type 消息类型
 * @param {Function} handler on/once 注册时传入的原 handler
 */
export const off = defaultBus.off;

/**
 * Vue2 插件形式安装
 * 安装后可通过 this.$widgetBus.emit / this.$widgetBus.on 调用
 */
export const Vue2BusPlugin = {
  install(Vue) {
    Vue.prototype.$widgetBus = { emit, on, once, off };
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
    app.config.globalProperties.$widgetBus = { emit, on, once, off };
  },
  uninstall(app) {
    delete app.config.globalProperties.$widgetBus;
  }
};

/**
 * 原生 JS 直接在 window 上暴露
 */
if (typeof window !== 'undefined') {
  window.widgetBus = { emit, on, once, off };
}

export default { emit, on, once, off, createBus, Vue2BusPlugin, Vue3BusPlugin };
