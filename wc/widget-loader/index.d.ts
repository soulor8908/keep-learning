/**
 * @module widget-loader
 *
 * 基座通用物料加载器。
 * 支持按 URL 异步加载 JS/CSS，注册 Custom Element，并提供错误隔离、
 * 版本契约校验、降级占位与重试。
 *
 * - 版本契约（Step 2）：加载物料前先做公共依赖版本校验，不兼容的物料直接
 *   拒绝加载并抛出明确错误，避免晦涩的 runtime error。
 * - 错误边界（Step 3）：单点失败不影响整体，全局监听运行时错误并归因到
 *   对应物料，命中后用降级占位替换崩溃物料。
 * - 国际化（Step 4）：错误信息通过 wc/i18n 的 t() 翻译，随基座语言切换。
 * - 多 Host 隔离：createWidgetLoader(opts) 创建独立状态实例，避免同页多 Host
 *   共享 loadedResources / mountedWidgets / lifecycleHooks 导致互相干扰。
 */

/// <reference lib="es2020" />
/// <reference lib="dom" />

/** 物料依赖的 Vue 主版本；'none' 表示原生 H5 物料，不依赖任何 Vue 运行时 */
export type VueVersion = '2' | '3' | 'none';

/** UI 组件库标识（按需加载用） */
export type UiLib = 'element-ui' | 'element-plus';

/** 物料 schema 中的 UI 组件依赖声明 */
export interface WidgetUiDependencies {
  lib: UiLib;
  /** semver 范围或纯版本号，用于拼 CDN URL */
  version?: string;
  /** true 时加载全量包而非逐组件 */
  full?: boolean;
  /** 去前缀组件名列表，如 ['button', 'dialog'] */
  components?: string[];
  /** 样式标识列表，如 ['base'] */
  styles?: string[];
}

/** 物料配置 */
export interface Widget {
  /** Custom Element 名称（必填） */
  name: string;
  /** JS 文件 URL（loadWidget 必填） */
  js?: string;
  /** CSS 文件 URL */
  css?: string;
  /** 物料展示配置（renderWidget/mountWidget 时序列化到 config 属性） */
  config?: any;
  /** 物料依赖的 Vue 主版本，默认 '2'；'none' 表示原生 H5 物料 */
  vueVersion?: VueVersion;
  /** 物料版本 */
  version?: string;
  /** 物料 schema（preloadUiDependencies 用于读取 uiDependencies） */
  schema?: {
    uiDependencies?: WidgetUiDependencies;
  };
}

/** 公共依赖版本契约项 */
export interface SupportedDep {
  /** 基座承诺提供的运行时版本 */
  version: string;
  /** 兼容范围（semver） */
  compatibleRange: string;
  /** 物料侧读取运行时的全局变量名 */
  globalVar: 'Vue2' | 'Vue3';
}

/** 基座承诺提供的运行时版本与兼容范围；物料按 vueVersion 声明自身依赖 */
export const SUPPORTED_DEPS: {
  vue2: SupportedDep;
  vue3: SupportedDep;
};

/** 物料加载器错误码枚举（基座可据此做差异化降级） */
export const WidgetError: {
  readonly LOAD_TIMEOUT: 'LOAD_TIMEOUT';
  readonly SCRIPT_ERROR: 'SCRIPT_ERROR';
  readonly CSS_ERROR: 'CSS_ERROR';
  readonly VERSION_MISMATCH: 'DEP_VERSION_MISMATCH';
  readonly NOT_FOUND: 'NOT_FOUND';
  readonly ELEMENT_TIMEOUT: 'ELEMENT_TIMEOUT';
  readonly CONFIG_ERROR: 'CONFIG_ERROR';
};

/** 物料加载错误（带 code 字段，便于基座差异化降级） */
export interface WidgetLoaderError extends Error {
  /** 错误码，取自 WidgetError 枚举 */
  code?: string;
  /** 版本不兼容时的逐条原因（VERSION_MISMATCH） */
  details?: string[];
}

/**
 * semver 范围匹配：判断 version 是否满足 range。
 * 支持 ^、~、>=、>、<=、<、=、精确版本、空格分隔的 AND 复合范围、
 * ||（或范围）、*（通配符）与预发布版本。
 */
export function satisfies(version: string, range: string): boolean;

/**
 * 物料依赖版本校验。
 * vueVersion='none' 跳过 Vue 校验；否则按对应全局变量（window.Vue2/Vue3）
 * 校验版本是否落在 compatibleRange 内。
 * @param widget 物料配置，vueVersion 默认 '2'
 * @throws {WidgetLoaderError} code='DEP_VERSION_MISMATCH'，message 含逐条不兼容原因
 */
export function checkDependencies(widget: Widget): void;

/** 物料生命周期事件类型 */
export type WidgetLifecycleEvent = 'loading' | 'loaded' | 'error' | 'unmount';

/** 生命周期事件 payload（emitLifecycle 会自动附加 hostId） */
export interface WidgetLifecyclePayload {
  /** 物料名 */
  name: string;
  /** 物料元素（loaded/unmount 时存在） */
  element?: HTMLElement;
  /** 挂载容器 */
  container: HTMLElement;
  /** 错误对象（error 事件存在） */
  error?: Error;
  /** 多 Host 标识，由 emitLifecycle 自动附加，基座可据此区分事件来源 */
  hostId?: string;
}

/** 生命周期回调 */
export type WidgetLifecycleCallback = (payload: WidgetLifecyclePayload) => void;

/** loadScript / loadStyle 的重试选项 */
export interface LoadRetryOptions {
  /** 重试次数，默认 3（仅对 SCRIPT_ERROR / CSS_ERROR 重试，超时不重试） */
  retries?: number;
  /** 退避基数（ms），默认 1000；实际退避 = backoff * 2^attempt */
  backoff?: number;
}

/** 批量加载 / 预加载结果项 */
export interface LoadWidgetResult {
  name: string;
  success: boolean;
  /** loadWidgets 失败时携带的错误对象 */
  error?: Error;
  /** preloadWidgets 超时跳过时携带的原因（如 'preload_timeout'） */
  reason?: string;
}

/** loadWidgets 批量加载选项 */
export interface LoadWidgetsOptions {
  /** 最大并发数，默认 6，避免高频加载场景下请求堆积 */
  concurrency?: number;
}

/** preloadWidgets 批量预加载选项 */
export interface PreloadWidgetsOptions {
  /** 预加载并发数，默认 3（低于 loadWidgets，避免抢占主流程带宽） */
  concurrency?: number;
  /** 预加载总超时（ms），默认 30000，超时后未加载的跳过 */
  timeout?: number;
}

/** WidgetLoader 构造选项 */
export interface WidgetLoaderOptions {
  /** 多 Host 标识，用于区分实例的生命周期事件来源 */
  hostId?: string;
}

/** Vue 运行时最小契约（用于 UI 组件注册与版本读取） */
export interface VueRuntimeLike {
  /** 注册全局组件 */
  component(name: string, comp: any): void;
  /** 运行时版本号（用于版本契约校验） */
  version?: string;
}

/**
 * 物料加载器实例（支持多 Host 状态隔离）。
 *
 * 每个实例持有独立的 loadedResources / definedElements / widgetResources /
 * mountedWidgets / lifecycleHooks，避免同页多 Host（iframe 嵌套、微前端）
 * 共享状态导致 A Host 的加载记录干扰 B Host。
 */
export class WidgetLoader {
  /** 多 Host 标识（构造时传入，附加到生命周期事件 payload） */
  hostId: string;

  constructor(opts?: WidgetLoaderOptions);

  /**
   * 加载 JS 脚本（带自动重试 + 指数退避）。
   * 仅对 SCRIPT_ERROR 重试，LOAD_TIMEOUT 不重试（避免重复创建 <script>）。
   * 真实加载结果与超时分离：超时只 reject 给调用方，不移除 script 节点、
   * 不删除缓存；真正的 onerror 失败才清理缓存，允许重试。
   * @param url 脚本 URL
   * @param timeout 超时毫秒，默认 15000
   */
  loadScript(url: string, timeout?: number, opts?: LoadRetryOptions): Promise<void>;

  /**
   * 加载 CSS 样式（带自动重试 + 指数退避）。策略同 loadScript。
   * @param url 样式 URL；为空时直接 resolve
   */
  loadStyle(url: string, timeout?: number, opts?: LoadRetryOptions): Promise<void>;

  /**
   * 等待 Custom Element 注册完成。
   * 优先 customElements.whenDefined（无 CPU 开销），降级轮询 customElements.get。
   * @param name Custom Element 名
   * @param timeout 超时毫秒，默认 5000，超时抛 ELEMENT_TIMEOUT
   */
  waitForCustomElement(name: string, timeout?: number): Promise<void>;

  /**
   * 加载单个物料（JS/CSS + 等待 Custom Element 注册）。
   * 已加载（definedElements 命中）时短路返回。加载前先做版本契约校验。
   * @throws {WidgetLoaderError} name/js 缺失（NOT_FOUND）或版本不兼容（VERSION_MISMATCH）
   */
  loadWidget(widget: Widget): Promise<void>;

  /**
   * 批量加载物料（并发控制，分批执行）。
   * @returns 每项含 { name, success, error? }，单物料失败不阻断其余
   */
  loadWidgets(
    widgets: Widget[],
    opts?: LoadWidgetsOptions
  ): Promise<LoadWidgetResult[]>;

  /**
   * 预加载单个物料（只加载资源，不挂载到 DOM）。
   * 失败只记日志不抛错，不影响主流程。
   */
  preloadWidget(widget: Widget): Promise<void>;

  /**
   * 批量预加载物料（利用浏览器空闲时段，不阻塞主线程）。
   * 优先 requestIdleCallback，降级 setTimeout(0)；超时未加载的标记跳过。
   * @returns 每项含 { name, success, reason? }
   */
  preloadWidgets(
    widgets: Widget[],
    opts?: PreloadWidgetsOptions
  ): Promise<LoadWidgetResult[]>;

  /** 派发生命周期事件（自动在 payload 上附加 hostId） */
  emitLifecycle(event: WidgetLifecycleEvent, payload: WidgetLifecyclePayload): void;

  /**
   * 订阅物料生命周期事件
   * @param event 'loading' | 'loaded' | 'error' | 'unmount'
   * @param cb 回调，参数为 payload
   * @returns 取消订阅函数；未知 event 返回 no-op
   */
  onWidgetLifecycle(
    event: WidgetLifecycleEvent,
    cb: WidgetLifecycleCallback
  ): () => void;

  /**
   * 标记物料运行时崩溃并降级：移除崩溃元素、派发 error 事件、渲染降级占位
   * （附带"点击重试"按钮，重试只重新加载该物料）。
   */
  markWidgetFailed(element: HTMLElement, error: Error): void;

  /**
   * 渲染物料到指定容器（同步，触发 connectedCallback）。
   * config 含循环引用时序列化失败抛 CONFIG_ERROR；自动注入全局上下文。
   * @returns 创建并挂载的物料元素
   */
  renderWidget(container: HTMLElement, widget: Widget): HTMLElement;

  /**
   * 执行一次"加载 + 渲染 + 注册到错误边界"，不处理降级，失败直接抛出。
   * @returns 挂载的物料元素
   */
  attemptMount(container: HTMLElement, widget: Widget): Promise<HTMLElement>;

  /** 带降级 + 重试的挂载（失败渲染降级占位 + 重试按钮，不抛错给调用方） */
  mountWithFallback(container: HTMLElement, widget: Widget): void;

  /**
   * 加载并渲染物料（带错误边界、降级占位与重试）。
   * - 加载/版本校验失败：渲染降级占位；非版本不兼容错误附带"点击重试"
   * - 挂载同步抛错：移除崩溃元素并渲染降级占位（可重试）
   * - 运行时崩溃：全局监听归因后自动降级（可重试）
   * @returns 挂载的物料元素
   */
  mountWidget(container: HTMLElement, widget: Widget): Promise<HTMLElement>;

  /** 卸载物料：移除 DOM 元素并清理错误边界追踪，触发 unmount 生命周期 */
  unmountWidget(element: HTMLElement): void;

  /**
   * 卸载并回收物料资源：移除 JS/CSS 标签、清理缓存与已定义元素记录，
   * 使该物料可被重新加载（用于热更新、版本切换、A/B 测试）。
   * 注意：customElements.define 不可撤销，重新注册同名元素需刷新页面或换名。
   */
  unloadWidget(name: string): void;
}

/** 工厂：为多 Host 场景（iframe 嵌套、微前端）创建独立状态的加载器实例 */
export function createWidgetLoader(opts?: WidgetLoaderOptions): WidgetLoader;

// ─── 向后兼容的模块级导出（委托到默认单例 defaultLoader）───

/** 加载单个物料（委托默认单例） */
export function loadWidget(widget: Widget): Promise<void>;
/** 批量加载物料（委托默认单例） */
export function loadWidgets(
  widgets: Widget[],
  opts?: LoadWidgetsOptions
): Promise<LoadWidgetResult[]>;
/** 预加载单个物料（委托默认单例） */
export function preloadWidget(widget: Widget): Promise<void>;
/** 批量预加载物料（委托默认单例） */
export function preloadWidgets(
  widgets: Widget[],
  opts?: PreloadWidgetsOptions
): Promise<LoadWidgetResult[]>;
/** 加载并渲染物料（委托默认单例） */
export function mountWidget(container: HTMLElement, widget: Widget): Promise<HTMLElement>;
/** 卸载物料元素（委托默认单例） */
export function unmountWidget(element: HTMLElement): void;
/** 卸载并回收物料资源（委托默认单例） */
export function unloadWidget(name: string): void;
/** 渲染物料到指定容器（委托默认单例） */
export function renderWidget(container: HTMLElement, widget: Widget): HTMLElement;
/** 订阅物料生命周期事件（委托默认单例） */
export function onWidgetLifecycle(
  event: WidgetLifecycleEvent,
  cb: WidgetLifecycleCallback
): () => void;

// ─── UI 组件级按需加载 ───

/** 默认 UI 组件资源 URL 解析器：${cdnBase}/ui/${lib}@${version}/${component}.${ext} */
export function defaultResolveUiResource(
  cdnBase: string,
  lib: UiLib,
  version: string,
  component: string,
  type: 'js' | 'css'
): string;

/** 默认全量包资源 URL 解析器（降级用）：${cdnBase}/ui/${lib}@${version}/full.${ext} */
export function defaultResolveFullResource(
  cdnBase: string,
  lib: UiLib,
  version: string,
  type: 'js' | 'css'
): string;

/** preloadUiDependencies 选项 */
export interface PreloadUiDependenciesOptions {
  /** CDN 基址（必填） */
  cdnBase: string;
  /** 自定义资源解析器，默认 defaultResolveUiResource */
  resolveUiResource?: typeof defaultResolveUiResource;
  /** 自定义全量包解析器，默认 defaultResolveFullResource */
  resolveFullResource?: typeof defaultResolveFullResource;
  /** Vue2 运行时，默认 window.Vue2 */
  Vue2Runtime?: VueRuntimeLike;
  /** Vue3 运行时，默认 window.Vue3 */
  Vue3Runtime?: VueRuntimeLike;
}

/** preloadUiDependencies 结果 */
export interface PreloadUiDependenciesResult {
  /** 成功注册的组件全名列表（如 'element-ui:button'、'element-ui:full'） */
  loaded: string[];
  /** 失败项 */
  failed: Array<{ lib: UiLib; component: string; reason: string }>;
}

/**
 * 预加载一批物料的 UI 组件依赖。
 *
 * 流程：
 * 1. 收集每个 widget.schema.uiDependencies，按 lib 分组合并 components 去重
 * 2. 校验 lib 与 widget.vueVersion 匹配，不匹配抛 UI_DEP_LIB_MISMATCH
 * 3. full:true 直接加载全量包；否则 per-component 并行加载（复用 loadedResources 去重）
 * 4. 单组件失败重试 1 次，仍失败记录但不阻断整体
 * 5. 加载成功后注册到对应 Vue 运行时（加回 el- 前缀）
 *
 * @param widgets 物料配置数组，每项可含 schema.uiDependencies 与 vueVersion
 * @param options cdnBase 必填
 * @throws cdnBase 缺失或 lib/vueVersion 不匹配时抛错
 */
export function preloadUiDependencies(
  widgets: Widget[],
  options: PreloadUiDependenciesOptions
): Promise<PreloadUiDependenciesResult>;
