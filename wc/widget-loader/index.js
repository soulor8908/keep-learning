/**
 * 基座通用物料加载器
 * 支持按 URL 异步加载 JS/CSS，注册 Custom Element，并提供错误隔离
 *
 * 版本契约：加载物料前先做公共依赖版本校验，
 * 不兼容的物料直接拒绝加载并抛出明确错误，避免晦涩的 runtime error。
 *
 * 国际化：错误信息通过 wc/i18n 的 t() 翻译，随基座语言切换。
 */

import { t } from '../i18n/index.js';
import { injectContext } from '../widget-context/index.js';
import { camelToKebab } from '../shared/props.js';

// ─── 公共依赖版本契约 ───
export const SUPPORTED_DEPS = {
  vue2: { version: '2.6.14', compatibleRange: '^2.6.0', globalVar: 'Vue2' },
  vue3: { version: '3.4.21', compatibleRange: '^3.0.0', globalVar: 'Vue3' },
  lodash: { version: '4.17.21', compatibleRange: '^4.17.0', globalVar: '_' },
  axios: { version: '1.7.7', compatibleRange: '^1.0.0', globalVar: 'axios' }
};

const RUNTIME_DEP_KEYS = ['lodash', 'axios'];

// ─── 基座运行时自检 ───
let _baseReadyChecked = false;

export function ensureBaseReady() {
  if (_baseReadyChecked) return;
  _baseReadyChecked = true;
  if (typeof window === 'undefined') return;

  const required = [
    { key: '__wcI18n__', desc: 'i18n runtime (required for widget t() function, auto-mounted by wc-i18n module)' },
    { key: '__wcWidgetScope__', desc: 'soft isolation scope factory (required for widget scope, auto-mounted by wc-widget-scope module)' },
  ];
  const optional = [
    { key: 'Vue2', desc: 'Vue2 runtime (required by Vue2 widgets)' },
    { key: 'Vue3', desc: 'Vue3 runtime (required by Vue3 widgets)' },
    { key: 'ElementPlus', desc: 'ElementPlus component library (required for el-* components in Vue3 widgets)' },
    { key: 'ELEMENT', desc: 'ElementUI component library (required for el-* components in Vue2 widgets)' },
  ];

  const missing = required.filter(g => !window[g.key]);
  const optionalMissing = optional.filter(g => !window[g.key]);

  if (missing.length > 0) {
    console.warn(
      '[widget-loader] Core runtime not ready, the following required global variables are missing:\n' +
      missing.map(g => `  - window.${g.key}: ${g.desc}`).join('\n') +
      '\nPlease ensure wc-i18n and wc-widget-scope modules are loaded.'
    );
  }
  if (optionalMissing.length > 0) {
    console.warn(
      '[widget-loader] The following optional global variables are not detected (widgets of corresponding type will fail to load):\n' +
      optionalMissing.map(g => `  - window.${g.key}: ${g.desc}`).join('\n')
    );
  }
}

// ─── 轻量 semver 实现 ───
function parseVersion(v) {
  const clean = String(v).trim().replace(/^[v=]+/, '');
  const [main, prerelease] = clean.split(/[-+]/);
  const parts = main.split('.');
  return {
    major: parseInt(parts[0], 10) || 0,
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0,
    prerelease: prerelease || undefined
  };
}

function compareVersion(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (a.prerelease && b.prerelease) {
    return a.prerelease < b.prerelease ? -1 : a.prerelease > b.prerelease ? 1 : 0;
  }
  return 0;
}

function satisfiesSingle(version, range) {
  const trimmed = String(range).trim();
  if (trimmed === '' || trimmed === '*') return true;
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    return parts.every(part => satisfiesSingle(version, part));
  }
  const m = trimmed.match(/^([\^~>=<]*)\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(.*)$/);
  if (!m) return true;
  const op = m[1] || '';
  const req = {
    major: parseInt(m[2], 10) || 0,
    minor: parseInt(m[3], 10) || 0,
    patch: parseInt(m[4], 10) || 0,
    prerelease: m[6] || undefined
  };
  const v = parseVersion(version);
  switch (op) {
    case '^':
      if (compareVersion(v, req) < 0) return false;
      if (req.major === 0) {
        if (req.minor === 0) return v.major === 0 && v.minor === 0 && v.patch === req.patch;
        return v.major === 0 && v.minor === req.minor;
      }
      return v.major === req.major;
    case '~':
      if (compareVersion(v, req) < 0) return false;
      return v.major === req.major && v.minor === req.minor;
    case '>=': return compareVersion(v, req) >= 0;
    case '>': return compareVersion(v, req) > 0;
    case '<=': return compareVersion(v, req) <= 0;
    case '<': return compareVersion(v, req) < 0;
    case '=':
    case '':
    default: return compareVersion(v, req) === 0;
  }
}

export function satisfies(version, range) {
  const r = String(range).trim();
  if (r.includes('||')) {
    return r.split('||').some(part => satisfiesSingle(version, part));
  }
  return satisfiesSingle(version, r);
}

/**
 * 物料依赖版本校验
 */
export function checkDependencies(widget) {
  const { name, vueVersion = '2', runtimeDeps } = widget;
  const errors = [];

  if (widget.vueVersion === undefined) {
    console.warn(
      `[widget-loader] Widget ${name} does not declare vueVersion, defaulting to Vue2 validation. ` +
      `For Vue3 widgets, please explicitly declare vueVersion:'3'; for H5 widgets, declare vueVersion:'none'.`
    );
  }

  if (!['2', '3', 'none'].includes(vueVersion)) {
    errors.push(`Widget ${name} has invalid vueVersion="${vueVersion}", must be '2', '3' or 'none'`);
  }

  if (vueVersion !== 'none' && ['2', '3'].includes(vueVersion)) {
    const vueKey = vueVersion === '3' ? 'vue3' : 'vue2';
    const vueDep = SUPPORTED_DEPS[vueKey];
    const vueRuntime = typeof window !== 'undefined' ? window[vueDep.globalVar] : undefined;
    if (!vueRuntime) {
      errors.push(t('loader.dep_missing', { name, dep: `Vue${vueVersion}`, range: vueDep.compatibleRange, globalVar: vueDep.globalVar }));
    } else if (vueRuntime.version && !satisfies(vueRuntime.version, vueDep.compatibleRange)) {
      errors.push(t('loader.dep_version', { name, dep: `Vue${vueVersion}`, range: vueDep.compatibleRange, actual: vueRuntime.version }));
    }
  }

  if (Array.isArray(runtimeDeps)) {
    for (const depKey of runtimeDeps) {
      if (!RUNTIME_DEP_KEYS.includes(depKey)) continue;
      const dep = SUPPORTED_DEPS[depKey];
      const runtime = typeof window !== 'undefined' ? window[dep.globalVar] : undefined;
      if (!runtime) {
        errors.push(t('loader.dep_missing', { name, dep: depKey, range: dep.compatibleRange, globalVar: dep.globalVar }));
      } else {
        const actual = runtime.version || runtime.VERSION || '';
        if (actual && !satisfies(actual, dep.compatibleRange)) {
          errors.push(t('loader.dep_version', { name, dep: depKey, range: dep.compatibleRange, actual }));
        }
      }
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
export const WidgetError = {
  LOAD_TIMEOUT: 'LOAD_TIMEOUT',
  SCRIPT_ERROR: 'SCRIPT_ERROR',
  CSS_ERROR: 'CSS_ERROR',
  VERSION_MISMATCH: 'DEP_VERSION_MISMATCH',
  NOT_FOUND: 'NOT_FOUND',
  ELEMENT_TIMEOUT: 'ELEMENT_TIMEOUT',
  PROPS_ERROR: 'PROPS_ERROR',
  UI_DEP_LIB_MISMATCH: 'UI_DEP_LIB_MISMATCH'
};

function createError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const DEFAULT_LOAD_TIMEOUT = 15000;

// 降级占位样式（只注入一次）
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

function renderFallback(container, message, widget, onRetry) {
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
      if (errorNode.parentNode === container) container.removeChild(errorNode);
      onRetry();
    });
    errorNode.appendChild(btn);
  }

  container.appendChild(errorNode);
  return errorNode;
}

// ─── WidgetLoader ───
class WidgetLoader {
  constructor(opts = {}) {
    this.hostId = opts.hostId || '';
    this.loadedResources = new Map();
    this.definedElements = new Set();
    this.widgetResources = new Map();
    this.resourceNodes = new Map();
    this.mountedWidgets = new Map();
    this.globalErrorListenerInstalled = false;
    this.lifecycleHooks = { loading: [], loaded: [], error: [], unmount: [] };
  }

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
      script.crossOrigin = 'anonymous';
      script.onload = () => { log('script loaded:', url); resolve(); };
      script.onerror = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(createError(`Failed to load script: ${url}`, WidgetError.SCRIPT_ERROR));
      };
      document.head.appendChild(script);
      this.resourceNodes.set(url, script);
    });

    loadPromise.catch(() => {
      if (this.loadedResources.get(url) === loadPromise) {
        this.loadedResources.delete(url);
      }
    });

    this.loadedResources.set(url, loadPromise);

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(createError(`Timeout loading script: ${url}`, WidgetError.LOAD_TIMEOUT)), timeout);
    });
    const racePromise = Promise.race([loadPromise, timeoutPromise]);
    loadPromise.then(() => clearTimeout(timer), () => clearTimeout(timer));
    return racePromise;
  }

  loadStyle(url, timeout = DEFAULT_LOAD_TIMEOUT, opts = {}) {
    if (!url) return Promise.resolve();
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
      link.crossOrigin = 'anonymous';
      link.onload = () => { log('style loaded:', url); resolve(); };
      link.onerror = () => {
        if (link.parentNode) link.parentNode.removeChild(link);
        reject(createError(`Failed to load style: ${url}`, WidgetError.CSS_ERROR));
      };
      document.head.appendChild(link);
      this.resourceNodes.set(url, link);
    });

    loadPromise.catch(() => {
      if (this.loadedResources.get(url) === loadPromise) {
        this.loadedResources.delete(url);
      }
    });

    this.loadedResources.set(url, loadPromise);

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
   * 使用原生 customElements.whenDefined + 超时
   */
  waitForCustomElement(name, timeout = 5000) {
    const whenDefinedPromise = customElements.whenDefined(name);
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(createError(`Timeout waiting for custom element: ${name}`, WidgetError.ELEMENT_TIMEOUT)), timeout);
    });
    const racePromise = Promise.race([whenDefinedPromise, timeoutPromise]);
    whenDefinedPromise.then(() => clearTimeout(timer));
    return racePromise;
  }

  async loadWidget(widget) {
    const { name, js, css } = widget;

    if (!name || !js) {
      throw createError('widget name and js URL are required', WidgetError.NOT_FOUND);
    }

    if (this.definedElements.has(name)) {
      log('widget already loaded:', name);
      return;
    }

    log('start loading widget:', name, { js, css });
    try {
      checkDependencies(widget);
      await Promise.all([this.loadScript(js), this.loadStyle(css)]);
      await this.waitForCustomElement(name);
      this.definedElements.add(name);
      this.widgetResources.set(name, { js, css });
      log('widget loaded:', name);
    } catch (error) {
      if (!error.widgetName) error.widgetName = name;
      console.error(`[widget-loader] load widget "${name}" failed:`, error);
      throw error;
    }
  }

  async loadWidgets(widgets, opts = {}) {
    const { concurrency = 6 } = opts;
    const results = [];
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

  async preloadWidget(widget) {
    try {
      await this.loadWidget(widget);
      log('widget preloaded:', widget.name);
    } catch (error) {
      console.warn(`[widget-loader] preload "${widget.name}" failed:`, error.message);
    }
  }

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
          ric(processBatch);
        });
      };

      ric(processBatch);
    });
  }

  emitLifecycle(event, payload) {
    const enriched = { ...payload, hostId: this.hostId };
    if (typeof window !== 'undefined' && window.__wcDevtoolsBridge &&
        typeof window.__wcDevtoolsBridge.onLifecycle === 'function') {
      try { window.__wcDevtoolsBridge.onLifecycle(event, enriched); } catch (_) { /* noop */ }
    }
    (this.lifecycleHooks[event] || []).forEach(cb => {
      try { cb(enriched); } catch (e) { console.error('[widget-loader] lifecycle hook error:', e); }
    });
  }

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
    if (!entry || entry.failed) return;
    entry.failed = true;
    const { container, widget } = entry;
    const name = widget.name;
    if (element && element.parentNode === container) {
      container.removeChild(element);
    }
    this.emitLifecycle('error', { name, error, container });
    const reason = (error && error.message) ? error.message : String(error);
    const message = `[widget-loader] ${t('loader.runtime_crash', { name })}\n${reason}`;
    const onRetry = () => {
      this.mountedWidgets.delete(element);
      this.mountWithFallback(container, widget);
    };
    renderFallback(container, message, widget, onRetry);
    console.error(`[widget-loader] Widget "${name}" crashed at runtime:`, error);
    setTimeout(() => {
      const e = this.mountedWidgets.get(element);
      if (e && e.failed) this.mountedWidgets.delete(element);
    }, 5 * 60 * 1000);
  }

  attributeErrorToWidget(event) {
    const target = event.target;
    if (target && target instanceof Element) {
      for (const [element, entry] of this.mountedWidgets) {
        if (!entry.failed && element.contains(target)) return element;
      }
    }
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
    this._errorHandler = (event) => {
      const element = this.attributeErrorToWidget(event);
      if (element) {
        const error = event.error || new Error(event.message || 'widget runtime error');
        this.markWidgetFailed(element, error);
        event.preventDefault();
      }
    };
    this._rejectionHandler = (event) => {
      const reason = event.reason;
      const stack = (reason && reason.stack) || String(reason || '');
      for (const [element, entry] of this.mountedWidgets) {
        if (entry.failed) continue;
        const jsUrl = entry.widget.js || '';
        const name = entry.widget.name || '';
        if ((jsUrl && stack.includes(jsUrl)) || (name && stack.includes(name))) {
          this.markWidgetFailed(element, reason instanceof Error ? reason : new Error(String(reason)));
          event.preventDefault();
          break;
        }
      }
    };
    window.addEventListener('error', this._errorHandler, true);
    window.addEventListener('unhandledrejection', this._rejectionHandler);
  }

  /**
   * 移除全局 error / unhandledrejection 监听器。
   * 幂等：未安装时调用不抛错。所有物料卸载后自动调用。
   */
  removeGlobalErrorListener() {
    if (!this.globalErrorListenerInstalled) return;
    if (this._errorHandler) {
      window.removeEventListener('error', this._errorHandler, true);
      this._errorHandler = null;
    }
    if (this._rejectionHandler) {
      window.removeEventListener('unhandledrejection', this._rejectionHandler);
      this._rejectionHandler = null;
    }
    this.globalErrorListenerInstalled = false;
  }

  renderWidget(container, widget) {
    const { name, props } = widget;
    const element = document.createElement(name);
    if (props && typeof props === 'object') {
      for (const [propName, value] of Object.entries(props)) {
        if (propName === 'scope') continue;
        const attrName = camelToKebab(propName);
        if (value == null) {
          element.removeAttribute(attrName);
        } else if (value === true) {
          element.setAttribute(attrName, '');
        } else if (value === false) {
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
    try {
      injectContext(element);
    } catch (ctxErr) {
      log('injectContext skipped:', ctxErr && ctxErr.message);
    }
    try {
      container.appendChild(element);
    } catch (error) {
      if (element.parentNode === container) container.removeChild(element);
      throw error;
    }
    return element;
  }

  async attemptMount(container, widget) {
    ensureBaseReady();
    this.emitLifecycle('loading', { name: widget.name, container });
    await this.loadWidget(widget);
    const element = this.renderWidget(container, widget);
    this.mountedWidgets.set(element, { container, widget, failed: false });
    this.ensureGlobalErrorListener();
    this.emitLifecycle('loaded', { name: widget.name, element, container });
    return element;
  }

  mountWithFallback(container, widget) {
    log('mounting widget:', widget.name);
    this.attemptMount(container, widget)
      .then(() => log('widget mounted:', widget.name))
      .catch(error => {
        this.emitLifecycle('error', { name: widget.name, error, container });
        const message = `[widget-loader] ${t('loader.load_failed', { name: widget.name })}\n${error.message || error}`;
        renderFallback(container, message, widget, () => this.mountWithFallback(container, widget));
        console.error(`[widget-loader] Widget "${widget.name}" load failed:`, error);
      });
  }

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
      const onRetry = isVersionMismatch ? null : () => this.mountWithFallback(container, widget);
      renderFallback(container, message, widget, onRetry);
      console.error(`[widget-loader] Widget "${widget.name}" mount failed, rendered degraded placeholder:`, error);
      return null;
    }
  }

  unmountWidget(element) {
    if (!element) return;
    const entry = this.mountedWidgets.get(element);
    if (entry) {
      this.emitLifecycle('unmount', { name: entry.widget.name, element, container: entry.container });
      this.mountedWidgets.delete(element);
    }
    if (element.parentNode) element.parentNode.removeChild(element);
    // 所有物料卸载后自动移除全局错误监听器，避免泄漏
    if (this.mountedWidgets.size === 0) {
      this.removeGlobalErrorListener();
    }
  }

  unloadWidget(name) {
    if (!name) return;
    const resources = this.widgetResources.get(name);
    if (resources) {
      if (resources.js) {
        const node = this.resourceNodes.get(resources.js);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        this.resourceNodes.delete(resources.js);
        this.loadedResources.delete(resources.js);
      }
      if (resources.css) {
        const node = this.resourceNodes.get(resources.css);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        this.resourceNodes.delete(resources.css);
        this.loadedResources.delete(resources.css);
      }
      this.widgetResources.delete(name);
    }
    for (const [el, entry] of this.mountedWidgets) {
      if (entry.widget && entry.widget.name === name) {
        this.emitLifecycle('unmount', { name, element: el, container: entry.container });
        if (el && el.parentNode) el.parentNode.removeChild(el);
        this.mountedWidgets.delete(el);
      }
    }
    this.definedElements.delete(name);
    log('widget unloaded:', name);
  }
}

export { WidgetLoader };

export function createWidgetLoader(opts = {}) {
  return new WidgetLoader(opts);
}

// 便捷导出：基于默认 loader 实例的 renderWidget / mountWidget / unloadWidget / unmountWidget
// 适用于单基座场景（多基座应自行 createWidgetLoader）
const _defaultLoader = new WidgetLoader();

export function renderWidget(container, widget) {
  return _defaultLoader.renderWidget(container, widget);
}

export function mountWidget(container, widget) {
  return _defaultLoader.mountWidget(container, widget);
}

export function unloadWidget(name) {
  return _defaultLoader.unloadWidget(name);
}

export function unmountWidget(element) {
  return _defaultLoader.unmountWidget(element);
}

export function onWidgetLifecycle(event, cb) {
  return _defaultLoader.onWidgetLifecycle(event, cb);
}
