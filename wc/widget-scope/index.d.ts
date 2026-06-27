/**
 * @module widget-scope
 *
 * 轻量 widgetScope 软隔离对象。
 *
 * 目标：每个物料包装层创建一个 widgetScope 对象，物料通过 props 接收，
 * 而非直接访问 window/document。形成"软隔离"——不用 Shadow DOM / iframe，
 * 但通过受控 API 表面限制物料对全局环境的直接依赖。
 *
 * 软隔离能解决什么：
 * - 物料不再 window.xxx 直接读写 → 避免全局变量污染、误改基座状态
 * - 事件总线按物料名命名空间隔离 → 避免物料间事件名冲突
 * - 上下文只读快照 → 避免物料反向修改基座上下文
 * - 受控的日志/请求/i18n → 统一注入鉴权、locale、前缀，便于治理
 * - 多 Host 场景：每个 Host 的 scope 互不影响（createWidgetScope 工厂）
 *
 * 用法（基座 / wrapper 层创建并注入）：
 *   import { createWidgetScope } from 'wc/widget-scope';
 *   const scope = createWidgetScope({ name: 'bi-sales-panel', version: '1.0.0', host: 'dashboard-vue2' });
 *   // 作为 prop 传给物料组件：<Component :scope="scope" :config="config" />
 *
 * 物料内部使用：
 *   const user = await scope.context.get('user');
 *   const off = await scope.context.onChange('user', u => refresh(u));
 *   scope.bus.emit('resize', { width: 100 });
 *   scope.log.info('mounted');
 *   await scope.t('title');
 */

/// <reference lib="es2020" />
/// <reference lib="dom" />

/** widgetScope 元信息（只读，创建时 Object.freeze） */
export interface WidgetScopeMeta {
  /** 物料名（Custom Element 名），用作 bus 命名空间与日志前缀 */
  readonly name: string;
  /** 物料版本，未传则为空字符串 */
  readonly version: string;
  /** 宿主标识（如 'dashboard-vue2'），用于多 Host 区分 */
  readonly host: string;
  /** 身份标记：true 表示这是一个 widgetScope 实例 */
  readonly __isWidgetScope: true;
}

/** 上下文变化回调：接收 (newValue, partial) */
export type ScopeContextChangeCallback = (
  newValue: any,
  partial?: Record<string, any>
) => void;

/** 只读上下文访问（同步，与全局 getContext/onContextChange 行为一致） */
export interface WidgetScopeContext {
  /**
   * 获取上下文值（只读快照，同步返回）
   * @param key 不传返回整个上下文快照
   */
  get(key?: string): any;
  /**
   * 订阅上下文变化
   * @param key 上下文 key
   * @param cb 回调，接收新值
   * @returns 取消订阅函数（同步返回）
   */
  onChange(key: string, cb: ScopeContextChangeCallback): () => void;
}

/** bus 派发选项（透传到底层 createBus 的 CustomEvent） */
export interface ScopeBusEmitOptions {
  /** 是否冒泡，默认 true */
  bubbles?: boolean;
  /** 是否穿透 Shadow DOM，默认 true */
  composed?: boolean;
}

/** 事件回调：接收 (payload, event) */
export type ScopeBusHandler = (payload: any, event?: CustomEvent) => void;

/** 命名空间事件总线便捷方法（同步语义） */
export interface WidgetScopeBus {
  /**
   * 派发事件（同步）。底层 bus 抛错会被吞掉并记 error 日志，不影响物料渲染。
   */
  emit(type: string, payload?: any, options?: ScopeBusEmitOptions): void;
  /**
   * 监听事件（同步注册）
   * @returns 取消订阅函数；底层 bus 异常时返回 no-op
   */
  on(type: string, cb: ScopeBusHandler): () => void;
  /**
   * 监听一次事件
   * @returns 取消订阅函数；底层 bus 异常时返回 no-op
   */
  once(type: string, cb: ScopeBusHandler): () => void;
  /**
   * 取消监听事件（与 widget-bus.off 对齐）
   */
  off(type: string, cb: ScopeBusHandler): void;
}

/** 受控日志（自动加物料名前缀，便于排查） */
export interface WidgetScopeLog {
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  /** debug 默认关闭，可通过 localStorage['widget-scope-debug']='true' 开启 */
  debug(...args: any[]): void;
}

/** 请求拦截器：可在 fetch 前修改 options（如注入鉴权头），可返回 Promise */
export type RequestInterceptor = (
  options: RequestInit,
  meta: WidgetScopeMeta
) => void | Promise<void>;

/**
 * 受控 fetch 封装。
 * - 调用前依次应用注入的拦截器（如添加 Authorization）
 * - 物料统一走 scope.request，避免裸调 fetch 漏带 token
 * - 环境无 fetch 时抛错
 */
export interface WidgetScopeRequest {
  (url: string, options?: RequestInit): Promise<Response>;
  /** 注入请求拦截器，返回移除该拦截器的函数 */
  addInterceptor(fn: RequestInterceptor): () => void;
}

/** 子物料配置（scope.loader 用，仅需资源定位字段） */
export interface ScopeChildWidget {
  /** Custom Element 名称（必填） */
  name: string;
  /** JS 文件 URL */
  js?: string;
  /** CSS 文件 URL */
  css?: string;
  /** 物料依赖的 Vue 主版本：'2' | '3' | 'none' */
  vueVersion?: '2' | '3' | 'none';
  /** 物料版本 */
  version?: string;
  /** 物料展示配置 */
  config?: any;
}

/** 嵌套物料加载器（带循环依赖检测） */
export interface WidgetScopeLoader {
  /**
   * 加载子物料资源（JS/CSS），不挂载
   * @throws 循环加载时抛错（child.name === 自身 / 在祖先链中）
   */
  loadWidget(widget: ScopeChildWidget): Promise<void>;
  /**
   * 加载并挂载子物料到指定容器
   * @returns 挂载的物料元素
   */
  mountWidget(container: HTMLElement, widget: ScopeChildWidget): Promise<HTMLElement>;
  /**
   * 卸载子物料元素
   */
  unmountWidget(element: HTMLElement): Promise<void>;
}

/** widgetScope 软隔离对象（创建时 Object.freeze，物料通过 props 接收） */
export interface WidgetScope {
  /** 环境元信息（只读，冻结） */
  readonly meta: WidgetScopeMeta;
  /** 只读上下文访问 */
  readonly context: WidgetScopeContext;
  /** 命名空间事件总线（同步） */
  readonly bus: WidgetScopeBus;
  /** 受控日志 */
  readonly log: WidgetScopeLog;
  /** i18n 翻译（同步，共享基座 locale 状态），失败时返回原 key */
  readonly t: (key: string, params?: Record<string, any>) => string;
  /** 受控 fetch 封装（可选注入鉴权头） */
  readonly request: WidgetScopeRequest;
  /** 嵌套物料加载器（带循环依赖检测） */
  readonly loader: WidgetScopeLoader;
  /** 显式声明：scope 不提供 window/document 直接访问（软隔离约束） */
  readonly __noGlobalAccess: true;
}

/** createWidgetScope 选项 */
export interface CreateWidgetScopeOptions {
  /** 物料名（Custom Element 名），必填 */
  name: string;
  /** 物料版本 */
  version?: string;
  /** 宿主标识（如 'dashboard-vue2'），用于多 Host 区分 */
  host?: string;
  /** 自定义上下文实例（多 Host 场景），不传用全局 widget-context 模块 */
  contextInstance?: {
    get?(key?: string): any;
    onChange?(key: string, cb: ScopeContextChangeCallback): () => void;
  };
  /** 自定义 bus 实例，不传则按 name 创建命名空间 bus */
  busInstance?: {
    emit?(type: string, payload?: any, options?: ScopeBusEmitOptions): void;
    on?(type: string, cb: ScopeBusHandler): () => void;
    once?(type: string, cb: ScopeBusHandler): () => void;
  };
  /** 显式传入的祖先链（多 Host 场景），用于嵌套加载循环依赖检测 */
  ancestors?: Iterable<string>;
}

/**
 * 创建一个物料的 widgetScope 软隔离对象
 * @param opts 创建选项，opts.name 必填
 * @returns 冻结的 widgetScope 对象
 * @throws 当 opts.name 缺失时抛错
 */
export function createWidgetScope(opts?: CreateWidgetScopeOptions): WidgetScope;

/**
 * 判断一个对象是否为 widgetScope 实例。
 *
 * 身份判据统一收敛到 meta.__isWidgetScope === true：meta 在创建时即冻结，
 * 会随解构/Object.assign/展开等合理拷贝自然传递，避免顶层 __noGlobalAccess
 * 丢失导致的误判。
 */
export function isWidgetScope(obj: any): obj is WidgetScope;

export default createWidgetScope;
