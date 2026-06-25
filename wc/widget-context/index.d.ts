/**
 * @module widget-context
 *
 * 全局上下文注入 + 状态共享模块。
 *
 * 物料通过 config attribute 只能接收展示配置，无法获取基座的用户信息、权限、
 * 全局筛选条件等上下文。本模块提供：
 * - 全局上下文存储（user/permissions/theme/tenant 等基座级共享数据）
 * - 上下文注入：mountWidget 时自动将上下文注入到物料元素
 * - 状态订阅：物料可订阅上下文变化，实时响应基座状态更新
 * - 与 widget-bus 集成：上下文变化时通过 bus 广播 'context-change' 事件
 *
 * 设计要点：
 * - 跨技术栈通用：不依赖 Vue provide/inject（无法跨 Vue 应用边界）
 * - 响应式更新：上下文变化时通过事件通知所有订阅者
 * - 只读快照：物料获取的是上下文快照，不能直接修改（避免双向耦合）
 * - 命名空间隔离：多 Host 场景可用 createContext() 创建独立上下文
 *
 * 用法（基座）：
 *   import { setContext, getContext } from 'wc/widget-context';
 *   setContext({ user: { id: '1', name: '张三' }, permissions: ['read'] });
 *
 * 用法（物料）：
 *   import { getContext, onContextChange } from 'wc/widget-context';
 *   const { user } = getContext();
 *   onContextChange('user', (newUser) => { /* 更新物料 *\/ });
 */

/// <reference lib="es2020" />
/// <reference lib="dom" />

/** setContext / ContextInstance.set 选项 */
export interface SetContextOptions {
  /** 是否通过 widget-bus 广播 'context-change' 事件，默认 true */
  broadcast?: boolean;
  /** 启用深度相等判定：内容相同则不触发（即使引用不同），默认 false */
  deep?: boolean;
}

/** 上下文变化回调：接收 (newValue, partial) */
export type ContextChangeCallback = (
  newValue: any,
  partial?: Record<string, any>
) => void;

/** 独立上下文实例（多 Host 场景，由 createContext 创建，API 与全局版本一致） */
export interface ContextInstance {
  /** 设置上下文片段（合并模式，仅变化的 key 触发回调） */
  set(partial: Record<string, any>, opts?: SetContextOptions): void;
  /** 获取上下文：传 key 返回对应值；不传返回整个上下文浅拷贝 */
  get(): Record<string, any>;
  get<T = any>(key: string): T;
  /** 订阅指定 key 的变化，返回取消订阅函数 */
  onChange(key: string, callback: ContextChangeCallback): () => void;
  /** 清除指定 key 的上下文，并通知订阅者值为 undefined */
  clear(key: string): void;
}

/**
 * 设置全局上下文（合并模式）。
 * 默认浅比较：仅引用变化才触发；deep=true 时用深度相等判定。
 * @param partial 要更新的上下文片段，如 { user: {...} }
 * @param opts 默认 broadcast=true, deep=false
 */
export function setContext(
  partial: Record<string, any>,
  opts?: SetContextOptions
): void;

/**
 * 获取全局上下文（只读快照）。
 * 不传 key 返回整个上下文对象的浅拷贝（避免物料直接修改内部状态）；
 * 传 key 返回该 key 对应的值。
 */
export function getContext(): Record<string, any>;
export function getContext<T = any>(key: string): T;

/**
 * 订阅全局上下文变化
 * @param key 要订阅的上下文 key（如 'user'、'permissions'）
 * @param callback 回调，接收 (newValue, partial)
 * @returns 取消订阅函数；store 不可用时返回 no-op
 */
export function onContextChange(
  key: string,
  callback: ContextChangeCallback
): () => void;

/**
 * 清除指定 key 的全局上下文，并通知订阅者值为 undefined
 */
export function clearContext(key: string): void;

/**
 * 创建独立的上下文实例（多 Host 场景，如 iframe/微前端隔离）。
 * 与全局上下文互不影响，API 与全局版本一致。
 * @returns 独立上下文实例
 */
export function createContext(): ContextInstance;

/**
 * 将全局上下文注入到物料元素。
 * - 注入到 data-context 属性（供 attributeChangedCallback 读取）
 * - 同时挂载到 element._wcContext（供 JS 直接读取）
 *
 * 序列化策略：优先普通 JSON.stringify（快）；循环引用等导致失败时降级为
 * 去环序列化，保证 data-context 携带可用数据而非整体缺失。
 *
 * @param element 物料 DOM 元素
 * @param keys 要注入的上下文 key 列表，不传则注入全部
 */
export function injectContext(element: HTMLElement, keys?: string[]): void;
