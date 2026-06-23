/**
 * 基座通用物料加载器
 * 支持按 URL 异步加载 JS/CSS，注册 Custom Element，并提供错误隔离
 */

const loadedResources = new Map();
const definedElements = new Set();

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
  container.appendChild(element);
  return element;
}

/**
 * 加载并渲染物料（带错误占位）
 * @param {HTMLElement} container
 * @param {Object} widget
 * @returns {Promise<HTMLElement>}
 */
export async function mountWidget(container, widget) {
  log('mounting widget:', widget.name);
  try {
    await loadWidget(widget);
    const element = renderWidget(container, widget);
    log('widget mounted:', widget.name);
    return element;
  } catch (error) {
    const errorNode = document.createElement('div');
    errorNode.className = 'widget-error-placeholder';
    errorNode.textContent = `物料加载失败: ${widget.name}`;
    container.appendChild(errorNode);
    throw error;
  }
}
