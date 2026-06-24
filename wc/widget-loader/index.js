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

const loadedResources = new Map();
const definedElements = new Set();

// ─── 公共依赖版本契约 ───
// 基座承诺提供的运行时版本与兼容范围；物料按 vueVersion 声明自身依赖。
const SUPPORTED_DEPS = {
  vue2: { version: '2.6.14', compatibleRange: '^2.6.0', globalVar: 'Vue2' },
  vue3: { version: '3.4.21', compatibleRange: '^3.0.0', globalVar: 'Vue3' },
  aui:  { version: '1.8.2',  compatibleRange: '^1.8.0', globalVar: 'aui'  }
};

// ─── 轻量 semver 实现（避免引入外部依赖）───
// 支持 ^、~、>=、>、<=、<、= 与精确版本，足以覆盖 compatibleRange 场景。
function parseVersion(v) {
  const clean = String(v).trim().replace(/^[v=]+/, '');
  const [main] = clean.split(/[-+]/);
  const parts = main.split('.');
  return {
    major: parseInt(parts[0], 10) || 0,
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0
  };
}

function compareVersion(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function satisfies(version, range) {
  const m = String(range).trim().match(/^([\^~>=<]*)\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return true; // 无法解析的范围，放行
  const op = m[1] || '';
  const req = {
    major: parseInt(m[2], 10) || 0,
    minor: parseInt(m[3], 10) || 0,
    patch: parseInt(m[4], 10) || 0
  };
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

/**
 * 物料依赖版本校验
 * @param {Object} widget
 * @param {string} widget.name
 * @param {('2'|'3')} [widget.vueVersion='2'] 物料依赖的 Vue 主版本
 * @throws {Error} code='DEP_VERSION_MISMATCH'，message 含逐条不兼容原因
 */
export function checkDependencies(widget) {
  const { name, vueVersion = '2' } = widget;
  const errors = [];

  // 1. Vue 运行时校验：按物料声明的 vueVersion 选择对应全局变量
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

  // 2. aui 统一组件库版本校验
  const auiDep = SUPPORTED_DEPS.aui;
  const auiRuntime = typeof window !== 'undefined' ? window[auiDep.globalVar] : undefined;
  if (!auiRuntime) {
    errors.push(t('loader.dep_aui_missing', { name, range: auiDep.compatibleRange }));
  } else if (auiRuntime.version && !satisfies(auiRuntime.version, auiDep.compatibleRange)) {
    errors.push(t('loader.dep_aui_version', { name, range: auiDep.compatibleRange, actual: auiRuntime.version }));
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

// 资源加载默认超时：CDN 抖动/网络挂起时避免 Promise 永不 settle
const DEFAULT_LOAD_TIMEOUT = 15000;

/**
 * 加载 JS 脚本
 * @param {string} url
 * @param {number} [timeout=DEFAULT_LOAD_TIMEOUT] 超时毫秒，超时后 reject 并清理节点
 * @returns {Promise<void>}
 */
function loadScript(url, timeout = DEFAULT_LOAD_TIMEOUT) {
  if (loadedResources.has(url)) {
    log('script cached:', url);
    return loadedResources.get(url);
  }

  log('loading script:', url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (script.parentNode) script.parentNode.removeChild(script);
      loadedResources.delete(url);
      reject(new Error(`Timeout loading script: ${url}`));
    }, timeout);
    script.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log('script loaded:', url);
      resolve();
    };
    script.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      loadedResources.delete(url);
      reject(new Error(`Failed to load script: ${url}`));
    };
    document.head.appendChild(script);
  });

  loadedResources.set(url, promise);
  return promise;
}

/**
 * 加载 CSS 样式
 * @param {string} url
 * @param {number} [timeout=DEFAULT_LOAD_TIMEOUT] 超时毫秒
 * @returns {Promise<void>}
 */
function loadStyle(url, timeout = DEFAULT_LOAD_TIMEOUT) {
  if (!url) {
    return Promise.resolve();
  }
  if (loadedResources.has(url)) {
    log('style cached:', url);
    return loadedResources.get(url);
  }

  log('loading style:', url);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (link.parentNode) link.parentNode.removeChild(link);
      loadedResources.delete(url);
      reject(new Error(`Timeout loading style: ${url}`));
    }, timeout);
    link.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log('style loaded:', url);
      resolve();
    };
    link.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (link.parentNode) link.parentNode.removeChild(link);
      loadedResources.delete(url);
      reject(new Error(`Failed to load style: ${url}`));
    };
    document.head.appendChild(link);
  });

  loadedResources.set(url, promise);
  return promise;
}

/**
 * 等待 Custom Element 注册完成
 * 优先使用原生 customElements.whenDefined（基于内部注册回调，无 CPU 开销），
 * 降级到轮询（针对不支持 whenDefined 的旧浏览器）。
 * @param {string} name
 * @param {number} timeout
 * @returns {Promise<void>}
 */
function waitForCustomElement(name, timeout = 5000) {
  // 优先使用原生 whenDefined API
  if (typeof customElements.whenDefined === 'function') {
    return Promise.race([
      customElements.whenDefined(name),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout waiting for custom element: ${name}`)), timeout)
      )
    ]);
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
        reject(new Error(`Timeout waiting for custom element: ${name}`));
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
export async function loadWidget(widget) {
  const { name, js, css } = widget;

  if (!name || !js) {
    throw new Error('widget name and js URL are required');
  }

  if (definedElements.has(name)) {
    log('widget already loaded:', name);
    return;
  }

  // 版本契约校验：不兼容直接拒绝加载，给出明确提示而非晦涩的 runtime error
  checkDependencies(widget);

  log('start loading widget:', name, { js, css });
  try {
    await Promise.all([loadScript(js), loadStyle(css)]);
    await waitForCustomElement(name);
    definedElements.add(name);
    log('widget loaded:', name);
  } catch (error) {
    console.error(`[widget-loader] load widget "${name}" failed:`, error);
    throw error;
  }
}

/**
 * 批量加载物料
 * @param {Array<Object>} widgets
 * @returns {Promise<Array<{name: string, success: boolean, error?: Error}>>}
 */
export async function loadWidgets(widgets) {
  const results = await Promise.all(
    widgets.map(async widget => {
      try {
        await loadWidget(widget);
        return { name: widget.name, success: true };
      } catch (error) {
        return { name: widget.name, success: false, error };
      }
    })
  );
  return results;
}

// ─── 错误边界（Step 3）：单点失败不影响整体 ───
// 跟踪已挂载物料，全局监听运行时错误并归因到对应物料，
// 命中后用降级占位替换崩溃物料，避免整个看板白屏。
// key 用 DOM 元素实例（WeakMap），同一物料多实例互不覆盖，元素销毁后自动回收。
const mountedWidgets = new WeakMap(); // element -> { container, widget, failed }
let globalErrorListenerInstalled = false;

// ─── 生命周期钩子 ───
// 基座可订阅物料 loading/loaded/error/unmount 事件，统一监控看板状态
const lifecycleHooks = { loading: [], loaded: [], error: [], unmount: [] };

function emitLifecycle(event, payload) {
  (lifecycleHooks[event] || []).forEach(cb => {
    try { cb(payload); } catch (e) { console.error('[widget-loader] lifecycle hook error:', e); }
  });
}

/**
 * 订阅物料生命周期事件
 * @param {'loading'|'loaded'|'error'|'unmount'} event
 * @param {Function} cb 回调，参数为 { name, element?, container, error? }
 * @returns {Function} 取消订阅
 */
export function onWidgetLifecycle(event, cb) {
  if (!lifecycleHooks[event]) return () => {};
  lifecycleHooks[event].push(cb);
  return () => {
    const idx = lifecycleHooks[event].indexOf(cb);
    if (idx >= 0) lifecycleHooks[event].splice(idx, 1);
  };
}

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
  injectFallbackStyles();
  const errorNode = document.createElement('div');
  errorNode.className = 'widget-error-placeholder';

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

function markWidgetFailed(element, error) {
  const entry = mountedWidgets.get(element);
  if (!entry || entry.failed) return; // 已降级则不重复处理
  entry.failed = true;
  const { container, widget } = entry;
  const name = widget.name;
  // 移除崩溃的物料元素，避免残留破坏节点影响布局
  if (element && element.parentNode === container) {
    container.removeChild(element);
  }
  emitLifecycle('error', { name, error, container });
  const reason = (error && error.message) ? error.message : String(error);
  const message = `[widget-loader] ${t('loader.runtime_crash', { name })}\n${reason}`;
  // 运行时崩溃重试：脚本已加载（loadWidget 会短路），重新创建元素实例挂载
  const onRetry = () => {
    mountedWidgets.delete(element); // 清除 failed 标记，允许错误边界重新归因
    mountWithFallback(container, widget);
  };
  renderFallback(container, message, widget, onRetry);
  console.error(`[widget-loader] 物料 "${name}" 运行时崩溃:`, error);
}

function attributeErrorToWidget(event) {
  // 1. 资源错误（img/script 加载失败）：target 是元素，看落在哪个物料里
  const target = event.target;
  if (target && target instanceof Element) {
    for (const [element, entry] of mountedWidgets) {
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
    for (const [element, entry] of mountedWidgets) {
      if (entry.failed) continue;
      const jsUrl = entry.widget.js || '';
      const name = entry.widget.name || '';
      if (jsUrl && source.includes(jsUrl)) return element;
      if (name && source.includes(name)) return element;
    }
  }
  return null;
}

function ensureGlobalErrorListener() {
  if (globalErrorListenerInstalled) return;
  globalErrorListenerInstalled = true;
  // 捕获阶段监听 error：资源错误 target=元素，JS 错误 target=window，都能收到
  window.addEventListener('error', (event) => {
    const element = attributeErrorToWidget(event);
    if (element) {
      const error = event.error || new Error(event.message || 'widget runtime error');
      markWidgetFailed(element, error);
      // 已降级处理，抑制浏览器默认报错，避免干扰基座
      event.preventDefault();
    }
  }, true);
  // 未捕获的 Promise rejection：按堆栈归因
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const stack = (reason && reason.stack) || String(reason || '');
    for (const [element, entry] of mountedWidgets) {
      if (entry.failed) continue;
      const jsUrl = entry.widget.js || '';
      const name = entry.widget.name || '';
      if ((jsUrl && stack.includes(jsUrl)) || (name && stack.includes(name))) {
        markWidgetFailed(
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
 * @param {Object} [widget.config]
 * @returns {HTMLElement}
 */
export function renderWidget(container, widget) {
  const { name, config = {} } = widget;
  const element = document.createElement(name);
  element.setAttribute('config', JSON.stringify(config));
  try {
    container.appendChild(element); // 触发 connectedCallback
  } catch (error) {
    // connectedCallback 同步抛错：移除半挂载元素，向上抛出由 mountWidget 降级
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
async function attemptMount(container, widget) {
  emitLifecycle('loading', { name: widget.name, container });
  await loadWidget(widget);
  const element = renderWidget(container, widget);
  // 注册到错误边界：运行时崩溃时自动降级，单点失败不影响整体
  // key 用元素实例，同一物料多实例互不覆盖
  mountedWidgets.set(element, { container, widget, failed: false });
  ensureGlobalErrorListener();
  emitLifecycle('loaded', { name: widget.name, element, container });
  return element;
}

/**
 * 带降级 + 重试的挂载（重试路径复用）
 * 失败时渲染降级占位并附带"点击重试"按钮，点击后只重新加载该物料。
 * @param {HTMLElement} container
 * @param {Object} widget
 */
function mountWithFallback(container, widget) {
  log('mounting widget:', widget.name);
  attemptMount(container, widget)
    .then(() => log('widget mounted:', widget.name))
    .catch(error => {
      emitLifecycle('error', { name: widget.name, error, container });
      const message = `[widget-loader] ${t('loader.load_failed', { name: widget.name })}\n${error.message || error}`;
      // 网络/运行时类失败可重试；点击后再次走 mountWithFallback
      renderFallback(container, message, widget, () =>
        mountWithFallback(container, widget)
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
export async function mountWidget(container, widget) {
  log('mounting widget:', widget.name);
  try {
    return await attemptMount(container, widget);
  } catch (error) {
    emitLifecycle('error', { name: widget.name, error, container });
    const isVersionMismatch = error.code === 'DEP_VERSION_MISMATCH';
    const message = isVersionMismatch
      ? error.message
      : `[widget-loader] ${t('loader.mount_failed', { name: widget.name })}\n${error.message || error}`;
    // 版本不兼容是确定性错误，重试无意义，不渲染重试按钮；其余失败可重试
    const onRetry = isVersionMismatch
      ? null
      : () => mountWithFallback(container, widget);
    renderFallback(container, message, widget, onRetry);
    throw error;
  }
}

/**
 * 卸载物料：移除 DOM 元素并清理错误边界追踪，触发 unmount 生命周期
 * @param {HTMLElement} element mountWidget 返回的物料元素
 */
export function unmountWidget(element) {
  if (!element) return;
  const entry = mountedWidgets.get(element);
  if (entry) {
    emitLifecycle('unmount', { name: entry.widget.name, element, container: entry.container });
    mountedWidgets.delete(element);
  }
  if (element.parentNode) {
    element.parentNode.removeChild(element);
  }
}
