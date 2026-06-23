/**
 * 基座通用物料加载器
 * 支持按 URL 异步加载 JS/CSS，注册 Custom Element，并提供错误隔离
 *
 * 版本契约（Step 2）：加载物料前先做公共依赖版本校验，
 * 不兼容的物料直接拒绝加载并抛出明确错误，避免晦涩的 runtime error。
 */

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
      // >= req 且 < (major+1).0.0；0.x 收紧到同 minor
      if (compareVersion(v, req) < 0) return false;
      if (req.major === 0) {
        return v.major === 0 && v.minor === req.minor;
      }
      return v.major === req.major;
    case '~':
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
      `物料 "${name}" 依赖 Vue${vueVersion}（${vueDep.compatibleRange}），但基座未提供 ${vueDep.globalVar} 运行时`
    );
  } else if (vueRuntime.version && !satisfies(vueRuntime.version, vueDep.compatibleRange)) {
    errors.push(
      `物料 "${name}" 要求 Vue${vueVersion} ${vueDep.compatibleRange}，但基座提供 ${vueRuntime.version}`
    );
  }

  // 2. aui 统一组件库版本校验
  const auiDep = SUPPORTED_DEPS.aui;
  const auiRuntime = typeof window !== 'undefined' ? window[auiDep.globalVar] : undefined;
  if (!auiRuntime) {
    errors.push(`物料 "${name}" 依赖 aui（${auiDep.compatibleRange}），但基座未提供 aui 运行时`);
  } else if (auiRuntime.version && !satisfies(auiRuntime.version, auiDep.compatibleRange)) {
    errors.push(`物料 "${name}" 要求 aui ${auiDep.compatibleRange}，但基座提供 ${auiRuntime.version}`);
  }

  if (errors.length) {
    const err = new Error(
      `[widget-loader] 版本校验失败，已拒绝加载物料 "${name}"：\n  - ${errors.join('\n  - ')}`
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

/**
 * 加载 JS 脚本
 * @param {string} url
 * @returns {Promise<void>}
 */
function loadScript(url) {
  if (loadedResources.has(url)) {
    log('script cached:', url);
    return loadedResources.get(url);
  }

  log('loading script:', url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      log('script loaded:', url);
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });

  loadedResources.set(url, promise);
  return promise;
}

/**
 * 加载 CSS 样式
 * @param {string} url
 * @returns {Promise<void>}
 */
function loadStyle(url) {
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
    link.onload = () => {
      log('style loaded:', url);
      resolve();
    };
    link.onerror = () => reject(new Error(`Failed to load style: ${url}`));
    document.head.appendChild(link);
  });

  loadedResources.set(url, promise);
  return promise;
}

/**
 * 等待 Custom Element 注册完成
 * @param {string} name
 * @param {number} timeout
 * @returns {Promise<void>}
 */
function waitForCustomElement(name, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (customElements.get(name)) {
      log('custom element already defined:', name);
      resolve();
      return;
    }

    log('waiting for custom element:', name);
    const start = Date.now();
    const timer = setInterval(() => {
      if (customElements.get(name)) {
        clearInterval(timer);
        log('custom element defined:', name, `(${Date.now() - start}ms)`);
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        clearInterval(timer);
        reject(new Error(`Timeout waiting for custom element: ${name}`));
      }
    }, 50);
  });
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
const mountedWidgets = new Map(); // name -> { element, container, widget, failed }
let globalErrorListenerInstalled = false;

function renderFallback(container, message) {
  const errorNode = document.createElement('div');
  errorNode.className = 'widget-error-placeholder';
  errorNode.textContent = message;
  container.appendChild(errorNode);
  return errorNode;
}

function markWidgetFailed(name, error) {
  const entry = mountedWidgets.get(name);
  if (!entry || entry.failed) return; // 已降级则不重复处理
  entry.failed = true;
  const { element, container } = entry;
  // 移除崩溃的物料元素，避免残留破坏节点影响布局
  if (element && element.parentNode === container) {
    container.removeChild(element);
  }
  const reason = (error && error.message) ? error.message : String(error);
  renderFallback(
    container,
    `[widget-loader] 物料 "${name}" 运行时崩溃，已降级隔离：\n${reason}`
  );
  console.error(`[widget-loader] 物料 "${name}" 运行时崩溃:`, error);
}

function attributeErrorToWidget(event) {
  // 1. 资源错误（img/script 加载失败）：target 是元素，看落在哪个物料里
  const target = event.target;
  if (target && target instanceof Element) {
    for (const [name, entry] of mountedWidgets) {
      if (!entry.failed && entry.element && entry.element.contains(target)) {
        return name;
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
    for (const [name, entry] of mountedWidgets) {
      if (entry.failed) continue;
      const jsUrl = entry.widget.js || '';
      if (jsUrl && source.includes(jsUrl)) return name;
      if (source.includes(name)) return name;
    }
  }
  return null;
}

function ensureGlobalErrorListener() {
  if (globalErrorListenerInstalled) return;
  globalErrorListenerInstalled = true;
  // 捕获阶段监听 error：资源错误 target=元素，JS 错误 target=window，都能收到
  window.addEventListener('error', (event) => {
    const name = attributeErrorToWidget(event);
    if (name) {
      const error = event.error || new Error(event.message || 'widget runtime error');
      markWidgetFailed(name, error);
      // 已降级处理，抑制浏览器默认报错，避免干扰基座
      event.preventDefault();
    }
  }, true);
  // 未捕获的 Promise rejection：按堆栈归因
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const stack = (reason && reason.stack) || String(reason || '');
    for (const [name, entry] of mountedWidgets) {
      if (entry.failed) continue;
      const jsUrl = entry.widget.js || '';
      if ((jsUrl && stack.includes(jsUrl)) || stack.includes(name)) {
        markWidgetFailed(
          name,
          reason instanceof Error ? reason : new Error(String(reason))
        );
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
 * 加载并渲染物料（带错误边界与降级占位）
 * - 加载/版本校验失败：渲染降级占位
 * - 挂载同步抛错：移除崩溃元素并渲染降级占位
 * - 运行时崩溃（setTimeout/Promise/事件回调）：全局监听归因后自动降级
 * @param {HTMLElement} container
 * @param {Object} widget
 * @returns {Promise<HTMLElement>}
 */
export async function mountWidget(container, widget) {
  log('mounting widget:', widget.name);
  try {
    await loadWidget(widget);
    const element = renderWidget(container, widget);
    // 注册到错误边界：运行时崩溃时自动降级，单点失败不影响整体
    mountedWidgets.set(widget.name, { element, container, widget, failed: false });
    ensureGlobalErrorListener();
    log('widget mounted:', widget.name);
    return element;
  } catch (error) {
    const message = error.code === 'DEP_VERSION_MISMATCH'
      ? error.message
      : `[widget-loader] 物料 "${widget.name}" 挂载失败，已降级：\n${error.message || error}`;
    renderFallback(container, message);
    throw error;
  }
}
