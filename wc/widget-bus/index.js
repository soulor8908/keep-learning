/**
 * 跨技术栈全局消息总线
 * 基于原生 CustomEvent，可被 Vue2/Vue3/原生 JS 共同使用
 *
 * 命名空间隔离：默认全局总线 GLOBAL_BUS_NAME='bi-widget-bus'，所有页面共享。
 * 若同一页面存在多个 Host 实例，可通过 createBus(hostId) 创建独立命名空间的总线。
 */

const GLOBAL_BUS_NAME = 'bi-widget-bus';

/**
 * 创建带命名空间隔离的消息总线
 * @param {string} [namespace] 命名空间标识（如 hostId），省略则用全局总线
 * @returns {{emit: Function, on: Function, once: Function, off: Function, destroy: Function}}
 */
export function createBus(namespace) {
  const busName = namespace ? `${GLOBAL_BUS_NAME}:${namespace}` : GLOBAL_BUS_NAME;

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
      try {
        handler(event.detail, event);
      } catch (e) {
        console.error('[widget-bus] listener error:', e);
      }
    };
    window.addEventListener(eventType, wrappedHandler);
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
    const off = on(type, (payload, event) => {
      off();
      handler(payload, event);
    }, handler);
    return off;
  }

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

  let _destroyed = false;
  function destroy() {
    if (_destroyed) return;
    _destroyed = true;
    for (const [eventType, set] of handlers) {
      for (const entry of set) {
        try { window.removeEventListener(eventType, entry.wrapped); } catch (e) { /* ignore */ }
      }
    }
    handlers.clear();
  }

  return { emit, on, once, off, destroy };
}

/**
 * 创建内部广播 bus（无命名空间，全局通道）
 *
 * 用途：widget-context / i18n 等内部模块通过此 bus 广播变化事件（如 context-change、
 * locale-change），替代依赖 window.widgetBus 全局变量。不暴露到 window，不依赖全局变量。
 *
 * 每次调用返回新的 bus 实例，各实例通过 DOM CustomEvent 共享全局通道（bi-widget-bus:<type>），
 * 因此任何 createBus()（无命名空间）创建的监听器都能接收到广播事件。
 *
 * @returns {{emit: Function, on: Function, once: Function, off: Function, destroy: Function}}
 */
export function createBroadcastBus() {
  return createBus();
}
