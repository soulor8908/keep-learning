/**
 * 轻量物料加载器
 * - UMD 脚本加载 + URL 缓存
 * - 简化的依赖检查
 * - 错误降级占位
 *
 * 设计原则：不处理 SSR、不实现 semver、不做并发控制。
 * 依赖隔离完全交给物料打包时的 external + globals 完成。
 */

// ─── URL 级缓存 ───
const cache = new Map();

// ─── CSS 引用计数：url → { count, link } ───
const cssRefs = new Map();

/**
 * 将第三方依赖名映射到全局变量名
 * @param {string} dep
 * @returns {string}
 */
function depToGlobal(dep) {
  if (dep === 'lodash') return '_';
  if (dep === 'element-ui') return 'ELEMENT';
  if (dep === 'element-plus') return 'ElementPlus';
  return dep;
}

/**
 * 检查物料运行所需依赖
 * @param {{ name: string, vueVersion?: string, runtimeDeps?: string[] }} widget
 */
function checkDeps(widget) {
  const { name, vueVersion = '2', runtimeDeps = [] } = widget;
  const errors = [];

  if (vueVersion === '2' && typeof window.Vue2 === 'undefined') {
    errors.push('Vue2 运行时未加载（window.Vue2 不存在）');
  }
  if (vueVersion === '3' && typeof window.Vue3 === 'undefined') {
    errors.push('Vue3 运行时未加载（window.Vue3 不存在）');
  }

  for (const dep of runtimeDeps) {
    const g = depToGlobal(dep);
    if (typeof window[g] === 'undefined') {
      errors.push(`${dep} 运行时未加载（window.${g} 不存在）`);
    }
  }

  if (errors.length > 0) {
    const err = new Error(`物料 ${name} 依赖缺失：\n  - ${errors.join('\n  - ')}`);
    err.code = 'DEP_MISSING';
    throw err;
  }
}

/**
 * 通过 <script> 加载 UMD JS
 * @param {string} url
 * @returns {Promise<void>}
 */
function loadScript(url) {
  if (cache.has(url)) return cache.get(url);

  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`JS 加载失败: ${url}`));
    document.head.appendChild(s);
  });

  cache.set(url, p);
  return p;
}

/**
 * 通过 <link> 加载 CSS，支持引用计数
 * @param {string} [url]
 * @returns {Promise<void>}
 */
function loadStyle(url) {
  if (!url) return Promise.resolve();
  if (cache.has(url)) return cache.get(url);

  const p = new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    l.onload = () => resolve();
    l.onerror = () => reject(new Error(`CSS 加载失败: ${url}`));
    document.head.appendChild(l);

    // 记录引用
    const ref = cssRefs.get(url) || { count: 0, link: l };
    ref.count++;
    ref.link = l;
    cssRefs.set(url, ref);
  });

  cache.set(url, p);
  return p;
}

/**
 * 释放 CSS 引用，计数归零时移除 <link> 标签
 * @param {string} [url]
 */
function unloadStyle(url) {
  if (!url) return;
  const ref = cssRefs.get(url);
  if (!ref) return;
  ref.count--;
  if (ref.count <= 0 && ref.link && ref.link.parentNode) {
    ref.link.parentNode.removeChild(ref.link);
    cssRefs.delete(url);
    cache.delete(url);
  }
}

/**
 * 渲染错误占位
 * @param {HTMLElement} container
 * @param {string} message
 * @param {Function} [onRetry]
 */
function renderError(container, message, onRetry) {
  const retryHtml = onRetry
    ? `<button class="widget-error__retry" style="margin-top:10px;padding:5px 16px;border:1px solid #3b82f6;border-radius:4px;background:#3b82f6;color:#fff;cursor:pointer">重试</button>`
    : '';

  container.innerHTML = `
    <div class="widget-error" style="padding:12px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;color:#b91c1c;font-size:13px">
      <div>${message}</div>
      ${retryHtml}
    </div>
  `;

  if (onRetry) {
    const btn = container.querySelector('.widget-error__retry');
    if (btn) {
      btn.addEventListener('click', () => {
        container.innerHTML = '';
        onRetry();
      });
    }
  }
}

/**
 * 加载并挂载物料
 *
 * @param {HTMLElement} container
 * @param {{
 *   name: string,
 *   js: string,
 *   css?: string,
 *   vueVersion?: string,
 *   runtimeDeps?: string[],
 *   props?: object,
 *   retryable?: boolean
 * }} widget
 * @returns {Promise<{ unmount: Function }>}
 */
export async function mountWidget(container, widget) {
  try {
    checkDeps(widget);
    await Promise.all([loadScript(widget.js), loadStyle(widget.css)]);

    const mod = window[widget.name];
    if (!mod || typeof mod.mount !== 'function') {
      throw new Error(`物料 ${widget.name} 未导出 mount 方法`);
    }

    const innerApi = await mod.mount(container, widget.props || {});

    // 增强 unmount：先清理 CSS，再调用物料自身的 unmount
    const cssUrl = widget.css;
    return {
      unmount() {
        unloadStyle(cssUrl);
        if (innerApi && typeof innerApi.unmount === 'function') {
          innerApi.unmount();
        }
      }
    };
  } catch (err) {
    console.error(`[widget] ${widget.name} 加载失败:`, err);
    renderError(
      container,
      err.message,
      widget.retryable !== false ? () => mountWidget(container, widget) : null
    );
    return { unmount: () => {} };
  }
}

/**
 * 卸载物料
 * @param {{ unmount?: Function }} api
 */
export function unmountWidget(api) {
  if (api && typeof api.unmount === 'function') {
    api.unmount();
  }
}
