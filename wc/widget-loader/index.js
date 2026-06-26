/**
 * 基座通用物料加载器
 * 支持按 URL 异步加载 JS/CSS，注册 Custom Element，并提供错误隔离
 *
 * 版本契约（Step 2）：加载物料前先做公共依赖版本校验，
 * 不兼容的物料直接拒绝加载并抛出明确错误，避免晦涩的 runtime error。
 *
 * 国际化（Step 4）：错误信息通过 wc/i18n 的 t() 翻译，随基座语言切换。
 */

import { t } from '../i18n/index.js';
import { injectContext } from '../widget-context/index.js';

// ─── camelCase → kebab-case（与 wrapper 端 camelToKebab 一致）───
// 用于把 widget.props 中的 camelCase prop 名转换为 kebab-case attribute 名，
// 保持 host↔widget 的属性名映射一致。
function camelToKebab(str) {
  return String(str).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// ─── 公共依赖版本契约 ───
// 基座承诺提供的运行时版本与兼容范围；物料按 vueVersion 声明自身依赖。
// 导出供基座读取实际承诺版本，避免硬编码导致版本不一致
export const SUPPORTED_DEPS = {
  vue2: { version: '2.6.14', compatibleRange: '^2.6.0', globalVar: 'Vue2' },
  vue3: { version: '3.4.21', compatibleRange: '^3.0.0', globalVar: 'Vue3' }
};

// ─── 轻量 semver 实现（避免引入外部依赖）───
// 支持 ^、~、>=、>、<=、<、= 与精确版本、||（或范围）、*（通配符）、预发布版本。
function parseVersion(v) {
  const clean = String(v).trim().replace(/^[v=]+/, '');
  // 分离主版本与预发布（如 1.0.0-beta.1）与 build metadata（如 +sha）
  const [main, prerelease] = clean.split(/[-+]/);
  const parts = main.split('.');
  return {
    major: parseInt(parts[0], 10) || 0,
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0,
    // 预发布标识：undefined 表示正式版，非空字符串表示预发布（比较时正式版 > 预发布）
    prerelease: prerelease || undefined
  };
}

function compareVersion(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // 预发布比较：无预发布（正式版）> 有预发布
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (a.prerelease && b.prerelease) {
    return a.prerelease < b.prerelease ? -1 : a.prerelease > b.prerelease ? 1 : 0;
  }
  return 0;
}

// 判断单个范围片段（不含 ||）是否满足
// 支持空格分隔的 AND 复合范围，如 ">=2.6.0 <3.0.0"（两个条件都需满足）
function satisfiesSingle(version, range) {
  const trimmed = String(range).trim();
  // 通配符 * 或空范围：匹配任意版本
  if (trimmed === '' || trimmed === '*') return true;

  // 空格分隔的多个比较器（AND 语义）：如 ">=2.6.0 <3.0.0"
  // 注意：每个比较器自身不含空格（op 与版本间无空格），故按空格切分安全
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    return parts.every(part => satisfiesSingle(version, part));
  }

  const m = trimmed.match(/^([\^~>=<]*)\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(.*)$/);
  if (!m) return true; // 无法解析的范围，放行
  const op = m[1] || '';
  const req = {
    major: parseInt(m[2], 10) || 0,
    minor: parseInt(m[3], 10) || 0,
    patch: parseInt(m[4], 10) || 0,
    prerelease: m[6] || undefined
  };
  // 四段版本（如 1.0.0.0）视为 1.0.0，忽略第四段
  const v = parseVersion(version);

  switch (op) {
    case '^':
      // >= req 且 < (major+1).0.0；0.x 收紧到同 minor 且 patch >= req.patch；0.0.x 收紧到同 patch
      if (compareVersion(v, req) < 0) return false;
      if (req.major === 0) {
        if (req.minor === 0) {
          return v.major === 0 && v.minor === 0 && v.patch === req.patch;
        }
        return v.major === 0 && v.minor === req.minor;
      }
      return v.major === req.major;
    case '~':
      // >= req 且 < (major).(minor+1).0
      if (compareVersion(v, req) < 0) return false;
      return v.major === req.major && v.minor === req.minor;
    case '>=':
      return compareVersion(v, req) >= 0;
    case '>':
      return compareVersion(v, req) > 0;
    case '<=':
      return compareVersion(v, req) <= 0;
    case '<':
      return compareVersion(v, req) < 0;
    case '=':
    case '':
    default:
      return compareVersion(v, req) === 0;
  }
}

export function satisfies(version, range) {
  const r = String(range).trim();
  // 支持 || 或范围：任一片段满足即可
  if (r.includes('||')) {
    return r.split('||').some(part => satisfiesSingle(version, part));
  }
  return satisfiesSingle(version, r);
}

/**
 * 物料依赖版本校验
 * @param {Object} widget
 * @param {string} widget.name
 * @param {('2'|'3'|'none')} [widget.vueVersion='2'] 物料依赖的 Vue 主版本；
 *   'none' 表示原生 H5 物料，不依赖任何 Vue 运行时，跳过 Vue 校验
 * @throws {Error} code='DEP_VERSION_MISMATCH'，message 含逐条不兼容原因
 */
export function checkDependencies(widget) {
  const { name, vueVersion = '2' } = widget;
  const errors = [];

  // 1. Vue 运行时校验：按物料声明的 vueVersion 选择对应全局变量
  //    vueVersion='none' 表示原生 H5 物料，不依赖 Vue，跳过校验
  if (vueVersion !== 'none') {
    const vueKey = vueVersion === '3' ? 'vue3' : 'vue2';
    const vueDep = SUPPORTED_DEPS[vueKey];
    const vueRuntime = typeof window !== 'undefined' ? window[vueDep.globalVar] : undefined;
    if (!vueRuntime) {
      errors.push(
        t('loader.dep_missing', { name, dep: `Vue${vueVersion}`, range: vueDep.compatibleRange, globalVar: vueDep.globalVar })
      );
    } else if (vueRuntime.version && !satisfies(vueRuntime.version, vueDep.compatibleRange)) {
      errors.push(
        t('loader.dep_version', { name, dep: `Vue${vueVersion}`, range: vueDep.compatibleRange, actual: vueRuntime.version })
      );
    }
  }

  if (errors.length) {
    const err = new Error(
      `[widget-loader] ${t('loader.version_mismatch', { name })}\n  - ${errors.join('\n  - ')}`
    );
    err.code = 'DEP_VERSION_MISMATCH';
    err.details = errors;
    throw err;
  }
}

function isDebug() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('widget-loader-debug') === 'true';
  } catch {
    return false;
  }
}

function log(...args) {
  if (isDebug()) {
    console.log('[widget-loader]', ...args);
  }
}

// ─── 错误码枚举 ───
// 基座可根据 err.code 做差异化降级（如超时重试、404 直接弃用）
export const WidgetError = {
  LOAD_TIMEOUT: 'LOAD_TIMEOUT',         // 资源加载超时
  SCRIPT_ERROR: 'SCRIPT_ERROR',         // JS 脚本加载/执行失败
  CSS_ERROR: 'CSS_ERROR',               // CSS 样式加载失败
  VERSION_MISMATCH: 'DEP_VERSION_MISMATCH', // 公共依赖版本不兼容
  NOT_FOUND: 'NOT_FOUND',               // 物料未找到（name/js 缺失）
  ELEMENT_TIMEOUT: 'ELEMENT_TIMEOUT',   // Custom Element 注册超时
  PROPS_ERROR: 'PROPS_ERROR'            // props 序列化失败（如循环引用）
};

function createError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// 资源加载默认超时：CDN 抖动/网络挂起时避免 Promise 永不 settle
const DEFAULT_LOAD_TIMEOUT = 15000;

// 降级占位默认样式（只注入一次）。基座可通过覆盖 .widget-error-placeholder /
// .widget-error-retry 类实现主题化，无需改 loader 源码。
let fallbackStyleInjected = false;
function injectFallbackStyles() {
  if (fallbackStyleInjected) return;
  if (typeof document === 'undefined') return;
  fallbackStyleInjected = true;
  const style = document.createElement('style');
  style.setAttribute('data-widget-loader', 'fallback');
  style.textContent = `
    .widget-error-placeholder {
      padding: 12px 16px;
      border: 1px solid #fecaca;
      border-radius: 6px;
      background: #fef2f2;
      color: #b91c1c;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .widget-error-retry {
      margin-top: 10px;
      padding: 5px 16px;
      font-size: 13px;
      border: 1px solid #3b82f6;
      border-radius: 4px;
      background: #3b82f6;
      color: #fff;
      cursor: pointer;
      line-height: 1.4;
    }
    .widget-error-retry:hover { opacity: 0.9; }
  `;
  document.head.appendChild(style);
}

/**
 * 渲染降级占位（含"点击重试"按钮）
 * 样式通过注入的样式表 + CSS 类提供，基座可覆盖类名实现主题化。
 * @param {HTMLElement} container
 * @param {string} message 错误信息
 * @param {Object} widget 物料配置（重试时复用）
 * @param {Function|null} [onRetry] 重试回调；为 null 时不渲染按钮（如版本不兼容这种确定性错误）
 * @returns {HTMLElement} 占位节点
 */
function renderFallback(container, message, widget, onRetry) {
  // 移除该容器内已有的降级占位，避免多次失败时堆叠多个占位（N8）
  const existingFallbacks = container.querySelectorAll('.widget-error-placeholder');
  existingFallbacks.forEach(node => container.removeChild(node));

  injectFallbackStyles();
  const errorNode = document.createElement('div');
  errorNode.className = 'widget-error-placeholder';
  errorNode.setAttribute('data-widget-fallback', widget.name || '');

  const msg = document.createElement('div');
  msg.textContent = message;
  errorNode.appendChild(msg);

  if (typeof onRetry === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'widget-error-retry';
    btn.textContent = t('loader.retry');
    btn.addEventListener('click', () => {
      // 移除占位，触发只针对该物料的重新加载，不影响看板其它区域
      if (errorNode.parentNode === container) {
        container.removeChild(errorNode);
      }
      onRetry();
    });
    errorNode.appendChild(btn);
  }

  container.appendChild(errorNode);
  return errorNode;
}

// ─── WidgetLoader：支持多 Host 状态隔离的物料加载器实例 ───
// 每个实例持有独立的 loadedResources / definedElements / widgetResources /
// mountedWidgets / globalErrorListenerInstalled / lifecycleHooks，
// 避免同页多 Host（iframe 嵌套、微前端）共享状态导致 A Host 的加载记录干扰 B Host。
// 模块级默认导出仍可用（委托到下方 defaultLoader 单例），保持向后兼容。
class WidgetLoader {
  constructor(opts = {}) {
    // 多 Host 标识：用于区分实例的生命周期事件 payload（修复 N8）。
    // 微前端/iframe 嵌套场景下，基座可 createWidgetLoader({ hostId }) 创建独立实例，
    // 订阅 onWidgetLifecycle 时通过 payload.hostId 区分事件来源。
    this.hostId = opts.hostId || '';
    this.loadedResources = new Map();
    this.definedElements = new Set();
    // 物料名 -> { js, css }：记录每个物料加载的资源 URL，供 unloadWidget 清理
    this.widgetResources = new Map();

    // ─── 错误边界（Step 3）：单点失败不影响整体 ───
    // 跟踪已挂载物料，全局监听运行时错误并归因到对应物料，
    // 命中后用降级占位替换崩溃物料，避免整个看板白屏。
    // key 用 DOM 元素实例，同一物料多实例互不覆盖。
    // 用 Map 而非 WeakMap：错误归因需 for...of 遍历所有已挂载物料，
    // WeakMap 不可迭代；元素生命周期由 loader 管理（unmountWidget/unloadWidget
    // 显式 delete），不会内存泄漏。
    this.mountedWidgets = new Map(); // element -> { container, widget, failed }
    this.globalErrorListenerInstalled = false;

    // ─── 生命周期钩子 ───
    // 基座可订阅物料 loading/loaded/error/unmount 事件，统一监控看板状态
    this.lifecycleHooks = { loading: [], loaded: [], error: [], unmount: [] };
  }

  /**
   * 加载 JS 脚本（带自动重试 + 指数退避，修复 P2-20）
   *
   * 重试策略：仅对真正的加载失败（SCRIPT_ERROR）重试，超时（LOAD_TIMEOUT）不重试
   * （超时可能底层仍在加载，重试会重复创建 <script> 并可能加剧拥塞）。
   * 退避：backoff * 2^attempt（如 1000ms → 2000ms → 4000ms）。
   *
   * 竞态修复（单次加载内）：将"真实加载结果"与"超时"分离。
   * - loadPromise 由 onload/onerror 决定，缓存它：即使超时后脚本最终加载成功，
   *   后续调用复用已 resolve 的 loadPromise，不会重复创建 <script> 标签。
   * - 调用方拿到的是 Promise.race(loadPromise, timeout)：超时只 reject 给调用方，
   *   不移除 script 节点（可能仍在加载）、不删除缓存（避免重复加载）。
   * - 真正的 onerror 失败才清理缓存，允许重试。
   *
   * @param {string} url
   * @param {number} [timeout=DEFAULT_LOAD_TIMEOUT] 超时毫秒，超时后 reject（不清理节点/缓存）
   * @param {{retries?: number, backoff?: number}} [opts] retries=3 重试次数，backoff=1000 退避基数(ms)
   * @returns {Promise<void>}
   */
  loadScript(url, timeout = DEFAULT_LOAD_TIMEOUT, opts = {}) {
    const maxRetries = opts.retries != null ? opts.retries : 3;
    const backoffBase = opts.backoff != null ? opts.backoff : 1000;
    const attempt = (n) => this._loadScriptOnce(url, timeout).catch(err => {
      if (err && err.code === WidgetError.SCRIPT_ERROR && n < maxRetries) {
        const delay = backoffBase * Math.pow(2, n);
        log(`script load failed (attempt ${n + 1}/${maxRetries + 1}), retry in ${delay}ms:`, url, err.message);
        return new Promise(r => setTimeout(r, delay)).then(() => attempt(n + 1));
      }
      throw err;
    });
    return attempt(0);
  }

  _loadScriptOnce(url, timeout = DEFAULT_LOAD_TIMEOUT) {
    if (this.loadedResources.has(url)) {
      log('script cached:', url);
      return this.loadedResources.get(url);
    }

    log('loading script:', url);
    const loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      // 设置 crossOrigin 以获取跨域资源的详细错误信息（如 HTTP 状态码）
      // CDN 需配置 CORS 头，否则资源加载会被拒绝；同源资源不受影响
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        log('script loaded:', url);
        resolve();
      };
      script.onerror = () => {
        // 真正的加载失败：移除节点，允许后续重试
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(createError(`Failed to load script: ${url}`, WidgetError.SCRIPT_ERROR));
      };
      document.head.appendChild(script);
    });

    // 真正失败时清理缓存，允许重试（仅当缓存仍指向当前 promise）
    loadPromise.catch(() => {
      if (this.loadedResources.get(url) === loadPromise) {
        this.loadedResources.delete(url);
      }
    });

    // 缓存真实加载结果：即使超时后脚本最终加载成功，后续调用复用此 promise
    this.loadedResources.set(url, loadPromise);

    // 调用方拿到 race 结果：超时只 reject 给调用方，不清理 script 节点与缓存
    // 真实加载提前完成时清理 timer，避免高频加载场景下 timer 堆积（N4）
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(createError(`Timeout loading script: ${url}`, WidgetError.LOAD_TIMEOUT)), timeout);
    });
    const racePromise = Promise.race([loadPromise, timeoutPromise]);
    // 无论成功还是失败，都清理 timer（失败时 loadPromise.catch 已处理缓存）
    loadPromise.then(() => clearTimeout(timer), () => clearTimeout(timer));
    return racePromise;
  }

  /**
   * 加载 CSS 样式（带自动重试 + 指数退避，修复 P2-20）
   *
   * 重试策略同 loadScript：仅对 CSS_ERROR 重试，LOAD_TIMEOUT 不重试。
   *
   * 竞态修复：将真实加载结果与超时分离，避免超时误删已加载样式导致下次重复加载。
   *
   * @param {string} url
   * @param {number} [timeout=DEFAULT_LOAD_TIMEOUT] 超时毫秒
   * @param {{retries?: number, backoff?: number}} [opts] retries=3 重试次数，backoff=1000 退避基数(ms)
   * @returns {Promise<void>}
   */
  loadStyle(url, timeout = DEFAULT_LOAD_TIMEOUT, opts = {}) {
    if (!url) {
      return Promise.resolve();
    }
    const maxRetries = opts.retries != null ? opts.retries : 3;
    const backoffBase = opts.backoff != null ? opts.backoff : 1000;
    const attempt = (n) => this._loadStyleOnce(url, timeout).catch(err => {
      if (err && err.code === WidgetError.CSS_ERROR && n < maxRetries) {
        const delay = backoffBase * Math.pow(2, n);
        log(`style load failed (attempt ${n + 1}/${maxRetries + 1}), retry in ${delay}ms:`, url, err.message);
        return new Promise(r => setTimeout(r, delay)).then(() => attempt(n + 1));
      }
      throw err;
    });
    return attempt(0);
  }

  _loadStyleOnce(url, timeout = DEFAULT_LOAD_TIMEOUT) {
    if (this.loadedResources.has(url)) {
      log('style cached:', url);
      return this.loadedResources.get(url);
    }

    log('loading style:', url);
    const loadPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      // 设置 crossOrigin 以获取跨域资源的详细错误信息（同 loadScript）
      link.crossOrigin = 'anonymous';
      link.onload = () => {
        log('style loaded:', url);
        resolve();
      };
      link.onerror = () => {
        if (link.parentNode) link.parentNode.removeChild(link);
        reject(createError(`Failed to load style: ${url}`, WidgetError.CSS_ERROR));
      };
      document.head.appendChild(link);
    });

    loadPromise.catch(() => {
      if (this.loadedResources.get(url) === loadPromise) {
        this.loadedResources.delete(url);
      }
    });

    this.loadedResources.set(url, loadPromise);

    // 真实加载提前完成时清理 timer，避免高频加载场景下 timer 堆积（N4）
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(createError(`Timeout loading style: ${url}`, WidgetError.LOAD_TIMEOUT)), timeout);
    });
    const racePromise = Promise.race([loadPromise, timeoutPromise]);
    loadPromise.then(() => clearTimeout(timer), () => clearTimeout(timer));
    return racePromise;
  }

  /**
   * 等待 Custom Element 注册完成
   * 优先使用原生 customElements.whenDefined（基于内部注册回调，无 CPU 开销），
   * 降级到轮询（针对不支持 whenDefined 的旧浏览器）。
   * @param {string} name
   * @param {number} timeout
   * @returns {Promise<void>}
   */
  waitForCustomElement(name, timeout = 5000) {
    // 优先使用原生 whenDefined API
    if (typeof customElements.whenDefined === 'function') {
      const whenDefinedPromise = customElements.whenDefined(name);
      // 真实注册提前完成时清理 timer，避免 timer 堆积（N4）
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(createError(`Timeout waiting for custom element: ${name}`, WidgetError.ELEMENT_TIMEOUT)), timeout);
      });
      const racePromise = Promise.race([whenDefinedPromise, timeoutPromise]);
      whenDefinedPromise.then(() => clearTimeout(timer));
      return racePromise;
    }

    // 降级：轮询 customElements.get（旧浏览器兼容）
    let timer;
    const promise = new Promise((resolve, reject) => {
      if (customElements.get(name)) {
        log('custom element already defined:', name);
        resolve();
        return;
      }

      log('waiting for custom element (polling):', name);
      const start = Date.now();
      timer = setInterval(() => {
        if (customElements.get(name)) {
          clearInterval(timer);
          timer = null;
          log('custom element defined:', name, `(${Date.now() - start}ms)`);
          resolve();
          return;
        }
        if (Date.now() - start > timeout) {
          clearInterval(timer);
          timer = null;
          reject(createError(`Timeout waiting for custom element: ${name}`, WidgetError.ELEMENT_TIMEOUT));
        }
      }, 50);
    });
    promise.cancel = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    return promise;
  }

  /**
   * 加载单个物料
   * @param {Object} widget
   * @param {string} widget.name Custom Element 名称
   * @param {string} widget.js JS 文件 URL
   * @param {string} [widget.css] CSS 文件 URL
   * @returns {Promise<void>}
   */
  async loadWidget(widget) {
    const { name, js, css } = widget;

    if (!name || !js) {
      throw createError('widget name and js URL are required', WidgetError.NOT_FOUND);
    }

    if (this.definedElements.has(name)) {
      log('widget already loaded:', name);
      return;
    }

    // 版本契约校验：不兼容直接拒绝加载，给出明确提示而非晦涩的 runtime error
    checkDependencies(widget);

    log('start loading widget:', name, { js, css });
    try {
      await Promise.all([this.loadScript(js), this.loadStyle(css)]);
      await this.waitForCustomElement(name);
      this.definedElements.add(name);
      // 记录资源 URL，供 unloadWidget 清理
      this.widgetResources.set(name, { js, css });
      log('widget loaded:', name);
    } catch (error) {
      console.error(`[widget-loader] load widget "${name}" failed:`, error);
      throw error;
    }
  }

  /**
   * 批量加载物料
   * @param {Array<Object>} widgets
   * @param {object} [opts] 批量加载选项
   * @param {number} [opts.concurrency=6] 最大并发数，避免高频加载场景下请求堆积
   * @returns {Promise<Array<{name: string, success: boolean, error?: Error}>>}
   */
  async loadWidgets(widgets, opts = {}) {
    const { concurrency = 6 } = opts;
    const results = [];

    // 并发控制：分批执行，每批最多 concurrency 个
    for (let i = 0; i < widgets.length; i += concurrency) {
      const batch = widgets.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async widget => {
          try {
            await this.loadWidget(widget);
            return { name: widget.name, success: true };
          } catch (error) {
            return { name: widget.name, success: false, error };
          }
        })
      );
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * 预加载单个物料（只加载资源，不挂载到 DOM）
   *
   * 适用场景：看板进入编辑态时提前加载所有可选物料，用户选择时即时挂载。
   * 与 loadWidget 的区别：preloadWidget 不抛错（失败只记日志），不影响主流程。
   *
   * @param {Object} widget 物料配置 { name, js, css, vueVersion? }
   * @returns {Promise<void>}
   */
  async preloadWidget(widget) {
    try {
      await this.loadWidget(widget);
      log('widget preloaded:', widget.name);
    } catch (error) {
      // 预加载失败不抛错，只记日志，不影响主流程
      console.warn(`[widget-loader] preload "${widget.name}" failed:`, error.message);
    }
  }

  /**
   * 批量预加载物料（利用浏览器空闲时段，不阻塞主线程）
   *
   * 策略：
   * 1. 优先使用 requestIdleCallback 在浏览器空闲时段分批加载
   * 2. 不支持 requestIdleCallback 时降级为 setTimeout(0)
   * 3. 并发控制：每批最多 concurrency 个，避免请求堆积
   *
   * @param {Array<Object>} widgets 物料列表
   * @param {object} [opts]
   * @param {number} [opts.concurrency=3] 预加载并发数（低于 loadWidgets，避免抢占主流程带宽）
   * @param {number} [opts.timeout=30000] 预加载总超时，超时后未加载的跳过
   * @returns {Promise<Array<{name: string, success: boolean}>>}
   */
  preloadWidgets(widgets, opts = {}) {
    const { concurrency = 3, timeout = 30000 } = opts;
    const results = [];
    const startTime = Date.now();
    const hasRIC = typeof requestIdleCallback === 'function';
    const ric = hasRIC
      ? (fn) => requestIdleCallback(fn)
      : (fn) => setTimeout(() => fn({ timeRemaining: () => 0, didTimeout: false }), 0);

    return new Promise((resolve) => {
      let index = 0;

      const processBatch = (deadline) => {
        // 超时检查：未加载的标记为跳过并记录原因，便于基座排查（修复 N7）
        if (Date.now() - startTime > timeout) {
          while (index < widgets.length) {
            results.push({ name: widgets[index].name, success: false, reason: 'preload_timeout' });
            index++;
          }
          resolve(results);
          return;
        }

        if (index >= widgets.length) {
          resolve(results);
          return;
        }

        // 利用 idle 时间片：剩余预算不足且未超时 → 让出主线程重新调度，
        // 避免一次性处理过多批次构成长任务阻塞主线程（修复 N7）。
        // 仅在使用原生 requestIdleCallback 时生效；setTimeout 降级路径
        // timeRemaining 恒为 0，跳过此判断以每轮处理一批（与原行为一致，避免空转）。
        if (hasRIC && deadline && typeof deadline.timeRemaining === 'function'
            && deadline.timeRemaining() <= 0 && !deadline.didTimeout) {
          ric(processBatch);
          return;
        }

        const batch = widgets.slice(index, index + concurrency);
        index += batch.length;

        Promise.all(
          batch.map(widget =>
            this.preloadWidget(widget).then(() => {
              results.push({ name: widget.name, success: true });
            })
          )
        ).then(() => {
          // 下一批在空闲时段执行
          ric(processBatch);
        });
      };

      // 首批在空闲时段执行
      ric(processBatch);
    });
  }

  emitLifecycle(event, payload) {
    // 统一在 payload 上附加 hostId，基座订阅者可据此区分多 Host 实例的事件来源（修复 N8）
    const enriched = { ...payload, hostId: this.hostId };
    (this.lifecycleHooks[event] || []).forEach(cb => {
      try { cb(enriched); } catch (e) { console.error('[widget-loader] lifecycle hook error:', e); }
    });
  }

  /**
   * 订阅物料生命周期事件
   * @param {'loading'|'loaded'|'error'|'unmount'} event
   * @param {Function} cb 回调，参数为 { name, element?, container, error? }
   * @returns {Function} 取消订阅
   */
  onWidgetLifecycle(event, cb) {
    if (!this.lifecycleHooks[event]) return () => {};
    this.lifecycleHooks[event].push(cb);
    return () => {
      const idx = this.lifecycleHooks[event].indexOf(cb);
      if (idx >= 0) this.lifecycleHooks[event].splice(idx, 1);
    };
  }

  markWidgetFailed(element, error) {
    const entry = this.mountedWidgets.get(element);
    if (!entry || entry.failed) return; // 已降级则不重复处理
    entry.failed = true;
    const { container, widget } = entry;
    const name = widget.name;
    // 移除崩溃的物料元素，避免残留破坏节点影响布局
    if (element && element.parentNode === container) {
      container.removeChild(element);
    }
    this.emitLifecycle('error', { name, error, container });
    const reason = (error && error.message) ? error.message : String(error);
    const message = `[widget-loader] ${t('loader.runtime_crash', { name })}\n${reason}`;
    // 运行时崩溃重试：脚本已加载（loadWidget 会短路），重新创建元素实例挂载
    const onRetry = () => {
      this.mountedWidgets.delete(element); // 清除 failed 标记，允许错误边界重新归因
      this.mountWithFallback(container, widget);
    };
    renderFallback(container, message, widget, onRetry);
    console.error(`[widget-loader] 物料 "${name}" 运行时崩溃:`, error);
  }

  attributeErrorToWidget(event) {
    // 1. 资源错误（img/script 加载失败）：target 是元素，看落在哪个物料里
    const target = event.target;
    if (target && target instanceof Element) {
      for (const [element, entry] of this.mountedWidgets) {
        if (!entry.failed && element.contains(target)) {
          return element;
        }
      }
    }
    // 2. JS 运行时错误：按 filename / message / 堆栈匹配物料 JS URL 或物料名
    const source = [
      event.filename,
      event.message,
      (event.error && event.error.stack) || ''
    ].filter(Boolean).join('\n');
    if (source) {
      for (const [element, entry] of this.mountedWidgets) {
        if (entry.failed) continue;
        const jsUrl = entry.widget.js || '';
        const name = entry.widget.name || '';
        if (jsUrl && source.includes(jsUrl)) return element;
        if (name && source.includes(name)) return element;
      }
    }
    return null;
  }

  ensureGlobalErrorListener() {
    if (this.globalErrorListenerInstalled) return;
    this.globalErrorListenerInstalled = true;
    // 捕获阶段监听 error：资源错误 target=元素，JS 错误 target=window，都能收到
    window.addEventListener('error', (event) => {
      const element = this.attributeErrorToWidget(event);
      if (element) {
        const error = event.error || new Error(event.message || 'widget runtime error');
        this.markWidgetFailed(element, error);
        // 已降级处理，抑制浏览器默认报错，避免干扰基座
        event.preventDefault();
      }
    }, true);
    // 未捕获的 Promise rejection：按堆栈归因
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const stack = (reason && reason.stack) || String(reason || '');
      for (const [element, entry] of this.mountedWidgets) {
        if (entry.failed) continue;
        const jsUrl = entry.widget.js || '';
        const name = entry.widget.name || '';
        if ((jsUrl && stack.includes(jsUrl)) || (name && stack.includes(name))) {
          this.markWidgetFailed(
            element,
            reason instanceof Error ? reason : new Error(String(reason))
          );
          // 已归因并降级，阻止控制台未处理 rejection 告警
          event.preventDefault();
          break;
        }
      }
    });
  }

  /**
   * 渲染物料到指定容器
   * @param {HTMLElement} container
   * @param {Object} widget
   * @param {string} widget.name
   * @param {Object} [widget.props] 逐项属性映射，按 kebab-case 拆为独立 attribute，
   *   供物料包装层按声明类型解析并注入业务组件原有 props（无需 config 属性）
   * @returns {HTMLElement}
   */
  renderWidget(container, widget) {
    const { name, props } = widget;
    const element = document.createElement(name);
    // ─── 逐项 props：按 kebab-case 写为独立 attribute（与 wrapper observedAttributes 对齐）───
    // 序列化规则与 wrapper parseAttrValue 互逆：
    //   - boolean true  → setAttribute(attr, '')           （presence 语义，wrapper 解析为 true）
    //   - boolean false → setAttribute(attr, 'false')      （显式 false，wrapper 解析为 false；
    //                                                       不能用 removeAttribute，否则 wrapper 端
    //                                                       _collectProps 会跳过该 prop，导致 Vue
    //                                                       回退到 prop 默认值，宿主显式传入的
    //                                                       false 丢失——尤其当默认值为 true 时）
    //   - null/undefined → removeAttribute(attr)           （表示"未设置"，由 Vue 应用 prop 默认值）
    //   - string → 原样写入（wrapper 端 JSON.parse 失败时回退为原始字符串，故普通字符串无歧义）
    //   - number/object/array → JSON.stringify（含循环引用时抛错，转为 PROPS_ERROR）
    if (props && typeof props === 'object') {
      for (const [propName, value] of Object.entries(props)) {
        // scope 由 loader/wrapper 内部维护，不允许从 props 覆盖
        if (propName === 'scope') continue;
        const attrName = camelToKebab(propName);
        if (value == null) {
          // null / undefined：表示未设置，移除 attribute 让 Vue 应用默认值
          element.removeAttribute(attrName);
        } else if (value === true) {
          element.setAttribute(attrName, '');
        } else if (value === false) {
          // 显式 false：写入字符串 "false"，wrapper parseAttrValue(Boolean) 解析为 false
          element.setAttribute(attrName, 'false');
        } else {
          try {
            element.setAttribute(attrName, typeof value === 'string' ? value : JSON.stringify(value));
          } catch (e) {
            throw createError(
              `[widget-loader] ${t('loader.props_serialize_failed', { name })}: props.${propName}: ${e.message}`,
              WidgetError.PROPS_ERROR
            );
          }
        }
      }
    }
    // ─── 自动注入全局上下文（基座无需手动调 injectContext）───
    // 物料组件可通过 element._wcContext 或 scope.context.get() 读取上下文。
    // injectContext 失败（如 widget-context 模块异常）不阻断挂载，仅告警。
    try {
      injectContext(element);
    } catch (ctxErr) {
      log('injectContext skipped:', ctxErr && ctxErr.message);
    }
    try {
      container.appendChild(element); // 同步触发 connectedCallback
    } catch (error) {
      // 非 dead code：appendChild 会同步执行 custom element 的 connectedCallback，
      // 其同步抛出的异常会传播到此处的 catch（非吞掉）。此时元素已插入容器，
      // 必须移除半挂载元素后向上抛出——上游 mountWidget/mountWithFallback 的降级
      // 路径（renderFallback）只清理 .widget-error-placeholder，不会移除崩溃的
      // 物料元素本身，故此处清理不可省略。
      if (element.parentNode === container) {
        container.removeChild(element);
      }
      throw error;
    }
    return element;
  }

  /**
   * 执行一次"加载 + 渲染 + 注册到错误边界"
   * 不处理降级，失败直接抛出，由调用方决定如何降级/重试。
   * @param {HTMLElement} container
   * @param {Object} widget
   * @returns {Promise<HTMLElement>}
   */
  async attemptMount(container, widget) {
    this.emitLifecycle('loading', { name: widget.name, container });
    await this.loadWidget(widget);
    const element = this.renderWidget(container, widget);
    // 注册到错误边界：运行时崩溃时自动降级，单点失败不影响整体
    // key 用元素实例，同一物料多实例互不覆盖
    this.mountedWidgets.set(element, { container, widget, failed: false });
    this.ensureGlobalErrorListener();
    this.emitLifecycle('loaded', { name: widget.name, element, container });
    return element;
  }

  /**
   * 带降级 + 重试的挂载（重试路径复用）
   * 失败时渲染降级占位并附带"点击重试"按钮，点击后只重新加载该物料。
   * @param {HTMLElement} container
   * @param {Object} widget
   */
  mountWithFallback(container, widget) {
    log('mounting widget:', widget.name);
    this.attemptMount(container, widget)
      .then(() => log('widget mounted:', widget.name))
      .catch(error => {
        this.emitLifecycle('error', { name: widget.name, error, container });
        const message = `[widget-loader] ${t('loader.load_failed', { name: widget.name })}\n${error.message || error}`;
        // 网络/运行时类失败可重试；点击后再次走 mountWithFallback
        renderFallback(container, message, widget, () =>
          this.mountWithFallback(container, widget)
        );
        console.error(`[widget-loader] 物料 "${widget.name}" 加载失败:`, error);
      });
  }

  /**
   * 加载并渲染物料（带错误边界、降级占位与重试）
   * - 加载/版本校验失败：渲染降级占位；非版本不兼容错误附带"点击重试"
   * - 挂载同步抛错：移除崩溃元素并渲染降级占位（可重试）
   * - 运行时崩溃（setTimeout/Promise/事件回调）：全局监听归因后自动降级（可重试）
   * - 重试只重新加载该物料，不影响看板其它区域
   * @param {HTMLElement} container
   * @param {Object} widget
   * @returns {Promise<HTMLElement>}
   */
  async mountWidget(container, widget) {
    log('mounting widget:', widget.name);
    try {
      return await this.attemptMount(container, widget);
    } catch (error) {
      this.emitLifecycle('error', { name: widget.name, error, container });
      const isVersionMismatch = error.code === WidgetError.VERSION_MISMATCH;
      const message = isVersionMismatch
        ? error.message
        : `[widget-loader] ${t('loader.mount_failed', { name: widget.name })}\n${error.message || error}`;
      // 版本不兼容是确定性错误，重试无意义，不渲染重试按钮；其余失败可重试
      const onRetry = isVersionMismatch
        ? null
        : () => this.mountWithFallback(container, widget);
      renderFallback(container, message, widget, onRetry);
      throw error;
    }
  }

  /**
   * 卸载物料：移除 DOM 元素并清理错误边界追踪，触发 unmount 生命周期
   * @param {HTMLElement} element mountWidget 返回的物料元素
   */
  unmountWidget(element) {
    if (!element) return;
    const entry = this.mountedWidgets.get(element);
    if (entry) {
      this.emitLifecycle('unmount', { name: entry.widget.name, element, container: entry.container });
      this.mountedWidgets.delete(element);
    }
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  /**
   * 卸载并回收物料资源：移除 JS/CSS 标签、清理缓存与已定义元素记录，
   * 使该物料可被重新加载（用于热更新、版本切换、A/B 测试）。
   *
   * 注意：customElements.define 不可撤销，重新加载同名物料时若定义已存在
   * 浏览器会抛错；此处仅清理 definedElements 记录，使 loadWidget 不再短路。
   * 若需真正重新注册同名 Custom Element，需刷新页面或使用不同名称。
   *
   * @param {string} name 物料名（Custom Element 名）
   */
  unloadWidget(name) {
    if (!name) return;
    const resources = this.widgetResources.get(name);
    if (resources) {
      // 移除 <script> / <link> 标签
      // 遍历所有标签比较 src/href，而非用 querySelectorAll(URL)，
      // 避免 URL 含 " 或 ] 等特殊字符时 CSS 选择器语法错误
      if (resources.js) {
        Array.from(document.querySelectorAll('script')).forEach(s => {
          if (s.src === resources.js || s.getAttribute('src') === resources.js) {
            if (s.parentNode) s.parentNode.removeChild(s);
          }
        });
        this.loadedResources.delete(resources.js);
      }
      if (resources.css) {
        Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach(l => {
          if (l.href === resources.css || l.getAttribute('href') === resources.css) {
            if (l.parentNode) l.parentNode.removeChild(l);
          }
        });
        this.loadedResources.delete(resources.css);
      }
      this.widgetResources.delete(name);
    }
    this.definedElements.delete(name);
    log('widget unloaded:', name);
  }
}

// 默认单例：模块级导出委托到该实例，保持向后兼容
const defaultLoader = new WidgetLoader();

// 工厂：为多 Host 场景（iframe 嵌套、微前端）创建独立状态的加载器实例
const createWidgetLoader = (opts = {}) => new WidgetLoader(opts);

// ─── 向后兼容的模块级导出（委托到默认单例）───
export const loadWidget = (widget) => defaultLoader.loadWidget(widget);
export const loadWidgets = (widgets, opts) => defaultLoader.loadWidgets(widgets, opts);
export const preloadWidget = (widget) => defaultLoader.preloadWidget(widget);
export const preloadWidgets = (widgets, opts) => defaultLoader.preloadWidgets(widgets, opts);
export const mountWidget = (container, widget) => defaultLoader.mountWidget(container, widget);
export const unmountWidget = (element) => defaultLoader.unmountWidget(element);
export const unloadWidget = (name) => defaultLoader.unloadWidget(name);
export const renderWidget = (container, widget) => defaultLoader.renderWidget(container, widget);
export const onWidgetLifecycle = (event, cb) => defaultLoader.onWidgetLifecycle(event, cb);

// ─── UI 组件级按需加载（与 docs/elementui-on-demand-loading.md 4.x 一致）───
// IIFE bundle 全局挂载约定（由 ui-bundle-builder 产出，本模块仅按约定读取）：
//   element-ui    → window.__UI_ELEMENT_UI__[componentName]
//   element-plus  → window.__UI_ELEMENT_PLUS__[componentName]
const UI_GLOBAL_VARS = {
  'element-ui': '__UI_ELEMENT_UI__',
  'element-plus': '__UI_ELEMENT_PLUS__'
};

// lib 与 vueVersion 的合法映射
const LIB_VUE_MAP = {
  'element-ui': '2',
  'element-plus': '3'
};

/**
 * 默认 UI 组件资源 URL 解析器
 * @param {string} cdnBase
 * @param {string} lib 'element-ui' | 'element-plus'
 * @param {string} version 如 '2.15.0'（不含 ^）
 * @param {string} component 去前缀组件名，如 'button'
 * @param {'js'|'css'} type
 * @returns {string}
 */
export function defaultResolveUiResource(cdnBase, lib, version, component, type) {
  const ext = type === 'css' ? 'css' : 'js';
  const base = cdnBase.replace(/\/$/, '');
  return `${base}/ui/${lib}@${version}/${component}.${ext}`;
}

/**
 * 默认全量包资源 URL 解析器（降级用）
 */
export function defaultResolveFullResource(cdnBase, lib, version, type) {
  const ext = type === 'css' ? 'css' : 'js';
  const base = cdnBase.replace(/\/$/, '');
  return `${base}/ui/${lib}@${version}/full.${ext}`;
}

/**
 * 把已加载的 UI 组件注册到对应 Vue 运行时
 * @param {string} lib
 * @param {string} componentName 去前缀组件名，如 'button'
 * @param {object} VueRuntime Vue2/Vue3 运行时（含 component 方法）
 */
function registerUiComponent(lib, componentName, VueRuntime) {
  if (!VueRuntime || typeof VueRuntime.component !== 'function') return;
  const globalVar = UI_GLOBAL_VARS[lib];
  const registry = (typeof window !== 'undefined' && window[globalVar]) || {};
  const comp = registry[componentName];
  if (!comp) return;
  // 注册时加回 el- 前缀，与物料模板 <el-xxx> 用法一致
  VueRuntime.component(`el-${componentName}`, comp);
}

/**
 * 预加载一批物料的 UI 组件依赖
 *
 * 流程（详见 docs/elementui-on-demand-loading.md 4.2）：
 * 1. 收集每个 widget.schema.uiDependencies，按 lib 分组合并 components 去重
 * 2. 校验 lib 与 widget.vueVersion 匹配，不匹配抛 UI_DEP_LIB_MISMATCH
 * 3. full:true 直接加载全量包；否则 per-component 并行加载（复用 loadedResources 去重）
 * 4. 单组件失败重试 1 次，仍失败记录但不阻断整体
 * 5. 加载成功后注册到对应 Vue 运行时
 *
 * @param {Array} widgets 物料配置数组，每项可含 schema.uiDependencies 与 vueVersion
 * @param {Object} options
 * @param {string} options.cdnBase CDN 基址
 * @param {Function} [options.resolveUiResource] 自定义资源解析器 (lib,version,component,type)=>url
 * @param {Function} [options.resolveFullResource] 自定义全量包解析器
 * @param {object} [options.Vue2Runtime] Vue2 运行时，默认 window.Vue2
 * @param {object} [options.Vue3Runtime] Vue3 运行时，默认 window.Vue3
 * @returns {Promise<{loaded:string[], failed:Array}>} loaded 为成功注册的组件全名列表，failed 含 {lib,component,reason}
 */
export async function preloadUiDependencies(widgets, options = {}) {
  const {
    cdnBase,
    resolveUiResource = defaultResolveUiResource,
    resolveFullResource = defaultResolveFullResource,
    Vue2Runtime = (typeof window !== 'undefined' ? window.Vue2 : undefined),
    Vue3Runtime = (typeof window !== 'undefined' ? window.Vue3 : undefined)
  } = options;

  if (!cdnBase) throw new Error('[widget-loader] preloadUiDependencies: options.cdnBase is required');

  const runtimeByLib = {
    'element-ui': Vue2Runtime,
    'element-plus': Vue3Runtime
  };

  // ─── 1. 收集 + 校验 ───
  // 按 lib 分组：{ lib: { version, full, components:Set, widgets:[] } }
  const groups = {};
  for (const widget of widgets || []) {
    const ui = widget && widget.schema && widget.schema.uiDependencies;
    if (!ui) continue; // 无 uiDependencies 的 widget 跳过
    const lib = ui.lib;
    if (!LIB_VUE_MAP[lib]) {
      throw createUiError(`Unknown uiDependencies.lib: ${lib}`, 'UI_DEP_LIB_MISMATCH');
    }
    // 校验 lib 与 vueVersion 匹配（vueVersion 默认 '2'，与 checkDependencies 一致）
    const vv = widget.vueVersion || '2';
    if (LIB_VUE_MAP[lib] !== vv) {
      throw createUiError(
        `Widget ${widget.name} vueVersion=${vv} but uiDependencies.lib=${lib} (expected vueVersion=${LIB_VUE_MAP[lib]})`,
        'UI_DEP_LIB_MISMATCH'
      );
    }
    // vueVersion='none' 不应有 uiDependencies
    if (vv === 'none') {
      throw createUiError(
        `Widget ${widget.name} vueVersion='none' but declares uiDependencies`,
        'UI_DEP_LIB_MISMATCH'
      );
    }

    if (!groups[lib]) {
      groups[lib] = { version: stripRange(ui.version), full: !!ui.full, components: new Set(), styles: new Set() };
    }
    // full 一旦为 true，整组走全量包
    if (ui.full) groups[lib].full = true;
    if (ui.components) ui.components.forEach(c => groups[lib].components.add(c));
    if (ui.styles) ui.styles.forEach(s => groups[lib].styles.add(s));
  }

  const loaded = [];
  const failed = [];

  // ─── 2. 加载 + 注册 ───
  for (const lib of Object.keys(groups)) {
    const g = groups[lib];
    const runtime = runtimeByLib[lib];

    if (g.full) {
      // 全量包短路：只加载 full.js + full.css
      const urls = [
        resolveFullResource(cdnBase, lib, g.version, 'js'),
        resolveFullResource(cdnBase, lib, g.version, 'css')
      ];
      try {
        await Promise.all(urls.map(u => loadUiResource(u, defaultLoader)));
        // 全量包加载后假定所有组件可用，不逐个注册（由全量包自身注册到 Vue）
        loaded.push(`${lib}:full`);
      } catch (e) {
        failed.push({ lib, component: 'full', reason: e.message });
      }
      continue;
    }

    // per-component：base 样式 + 每个组件的 js/css
    // 先加载 base.css（styles 集合）
    const baseCssUrls = Array.from(g.styles)
      .filter(s => s !== 'base' || true) // base 始终加载
      .map(s => s === 'base'
        ? resolveUiResource(cdnBase, lib, g.version, 'base', 'css')
        : resolveUiResource(cdnBase, lib, g.version, s, 'css'));

    const tasks = [];
    for (const comp of g.components) {
      const jsUrl = resolveUiResource(cdnBase, lib, g.version, comp, 'js');
      const cssUrl = resolveUiResource(cdnBase, lib, g.version, comp, 'css');
      // 单组件：js 失败重试 1 次，css 失败不阻断（样式缺失只影响美观）
      tasks.push(
        loadUiResourceWithRetry(jsUrl, defaultLoader, 1)
          .then(() => {
            registerUiComponent(lib, comp, runtime);
            loaded.push(`${lib}:${comp}`);
          })
          .catch(e => {
            failed.push({ lib, component: comp, reason: e.message });
          })
      );
      // css 失败只记录不阻断主流程
      tasks.push(loadUiResourceWithRetry(cssUrl, defaultLoader, 1).catch(() => {}));
    }

    // base css 并行加载，失败不阻断
    baseCssUrls.forEach(u => tasks.push(loadUiResourceWithRetry(u, defaultLoader, 1).catch(() => {})));

    await Promise.all(tasks);
  }

  return { loaded, failed };
}

// 去掉 semver range 前缀（^、~、>= 等）取纯版本号，用于拼 URL
function stripRange(version) {
  if (!version) return version;
  return String(version).replace(/^[\^~>=<]*\s*/, '').trim();
}

// 复用 loader 的 loadedResources Map 做去重加载
function loadUiResource(url, loader) {
  // loadScript/loadStyle 内部已做 loadedResources 去重，直接委托
  const ext = url.endsWith('.css') ? 'css' : 'js';
  return ext === 'css' ? loader.loadStyle(url) : loader.loadScript(url);
}

// 带重试的资源加载：失败后重试 maxRetry 次（loadScript 失败时已 delete 缓存，可重新加载）
async function loadUiResourceWithRetry(url, loader, maxRetry) {
  try {
    return await loadUiResource(url, loader);
  } catch (firstErr) {
    if (maxRetry <= 0) throw firstErr;
    try {
      return await loadUiResource(url, loader);
    } catch (secondErr) {
      throw secondErr;
    }
  }
}

function createUiError(message, code) {
  const err = new Error(`[widget-loader] ${message}`);
  err.code = code;
  return err;
}

export { WidgetLoader, createWidgetLoader };
