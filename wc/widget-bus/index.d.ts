/**
 * @module widget-bus
 *
 * 跨技术栈全局消息总线。
 * 基于原生 CustomEvent + window.dispatchEvent，可被 Vue2/Vue3/原生 JS 共同使用。
 *
 * 命名空间隔离：默认全局总线 'bi-widget-bus'，所有页面共享。
 * 若同一页面存在多个 Host 实例（如 iframe 内嵌、微前端嵌套），可通过
 * createBus(namespace) 创建独立命名空间的总线，避免 A 基座的事件被 B 基座监听。
 *
 * 用法：
 *   import { createBus } from 'wc/widget-bus';
 *   const bus = createBus('dashboard-vue2');
 *   const off = bus.on('resize', (payload, event) => { ... });
 *   bus.emit('resize', { width: 100 });
 *   off(); // 取消订阅
 */

/// <reference lib="es2020" />
/// <reference lib="dom" />

/** 派发事件选项（透传到 CustomEvent 构造） */
export interface BusEmitOptions {
  /** 是否冒泡，默认 true */
  bubbles?: boolean;
  /** 是否穿透 Shadow DOM，默认 true */
  composed?: boolean;
}

/** 事件回调：接收 (payload, event)；单个 handler 抛异常不会阻断其他同类型监听器 */
export type BusHandler = (payload: any, event: CustomEvent) => void;

/** 命名空间隔离的消息总线实例 */
export interface Bus {
  /**
   * 派发消息（同步，基于 window.dispatchEvent）
   * @param type 消息类型
   * @param payload 消息载荷
   * @param options 派发选项
   */
  emit(type: string, payload?: any, options?: BusEmitOptions): void;
  /**
   * 监听消息
   * @param handler 回调，接收 (payload, event)
   * @returns 取消监听函数
   */
  on(type: string, handler: BusHandler): () => void;
  /**
   * 监听一次消息，触发后自动取消
   * @returns 取消监听函数
   */
  once(type: string, handler: BusHandler): () => void;
  /**
   * 按类型与原 handler 取消订阅。
   * 对 on/once 注册的 handler 都能正确移除（once 内部透传了原 handler）。
   * @param handler on/once 注册时传入的原 handler
   */
  off(type: string, handler: BusHandler): void;
}

/**
 * 创建带命名空间隔离的消息总线
 * @param namespace 命名空间标识（如 hostId），省略则用全局总线 'bi-widget-bus'
 * @returns 隔离的总线实例
 */
export function createBus(namespace?: string): Bus;

/**
 * 创建内部广播 bus（无命名空间，全局通道）
 *
 * 用途：widget-context / i18n 等内部模块通过此 bus 广播变化事件（如 context-change、
 * locale-change），替代依赖 window.widgetBus 全局变量。不暴露到 window，不依赖全局变量。
 *
 * 每次调用返回新的 bus 实例，各实例通过 DOM CustomEvent 共享全局通道（bi-widget-bus:<type>），
 * 因此任何 createBus()（无命名空间）创建的监听器都能接收到广播事件。
 */
export function createBroadcastBus(): Bus;
