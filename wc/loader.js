/**
 * 轻量物料加载器
 * - UMD 脚本加载 + URL 缓存
 * - 版本兼容性检查（构建时嵌入）
 * - 懒加载 + preload
 * - CSS 引用计数 + 卸载清理
 * - 错误降级（默认重试 1 次）
 */

const cache = new Map();
const cssRefs = new Map();

// ─── 版本兼容性检查 ───

function checkVersion(required, actual) {
  if (!required || !actual) return true;
  // 简化版：检查 major.minor 是否在范围内，不实现完整 semver
  const clean = v => v.replace(/^[~^>=<]*/, '').split('-')[0];
  const reqParts = clean(required).split('.').map(Number);
  const actParts = clean(actual).split('.').map(Number);
  // major 必须相同，minor 不能小于要求
  return actParts[0] === reqParts[0] && actParts[1] >= reqParts[1];
}

function getVueVersion() {
  if (window.Vue3 && window.Vue3.version) return window.Vue3.version;
  if (window.Vue2 && window.Vue2.version) return window.Vue2.version;
  return null;
}

function checkVersionCompat(meta) {
  if (!meta.vue) return;
  const actual = getVueVersion();
  if (!actual) return;
  if (!checkVersion(meta.vue, actual)) {
    throw new Error(
      `物料要求 Vue ${meta.vue}，当前版本 ${actual} 不兼容`
    );
  }
}

// ─── 依赖名 → 全局变量名（静态映射，不再由基座传入）───
const DEP_GLOBALS = {
  lodash: '_',
  'element-ui': 'ELEMENT',
  'element-plus': 'ElementPlus',
  axios: 'axios'
};

function checkDeps(name, vueVersion, deps) {
  const errors = [];

  if (vueVersion === '2' && typeof window.Vue2 === 'undefined') {
    errors.push('Vue2 运行时未加载');
  }
  if (vueVersion === '3' && typeof window.Vue3 === 'undefined') {
    errors.push('Vue3 运行时未加载');
  }

  for (const dep of deps) {
    const g = DEP_GLOBALS[dep] || dep;
    if (typeof window[g] === 'undefined') {
      errors.push(`${dep} 未加载（window.${g}）`);
    }
  }

  if (errors.length) {
    const err = new Error(`物料 ${name} 依赖缺失：${errors.join('、')}`);
    err.code = 'DEP_MISSING';
    throw err;
  }
}

// ─── 脚本加载 ───

export function loadScript(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => {
      cache.delete(url);
      reject(new Error(`JS 加载失败: ${url}`));
    };
    document.head.appendChild(s);
  });
  cache.set(url, p);
  return p;
}

// ─── CSS 加载 + 引用计数 ───

function loadStyle(url) {
  if (!url) return Promise.resolve();
  if (cache.has(url)) return cache.get(url);

  // 先创建 DOM 元素并记录引用，再构造 promise
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = url;
  document.head.appendChild(l);

  const ref = { count: 1, el: l };
  cssRefs.set(url, ref);

  const p = new Promise((resolve, reject) => {
    l.onload = () => resolve();
    l.onerror = () => {
      cssRefs.delete(url);
      cache.delete(url);
      if (l.parentNode) l.parentNode.removeChild(l);
      reject(new Error(`CSS 加载失败: ${url}`));
    };
  });

  cache.set(url, p);
  return p;
}

function unloadStyle(url) {
  if (!url) return;
  const ref = cssRefs.get(url);
  if (!ref) return;
  ref.count--;
  if (ref.count <= 0 && ref.el && ref.el.parentNode) {
    ref.el.parentNode.removeChild(ref.el);
    cssRefs.delete(url);
    cache.delete(url);
  }
}

// ─── 错误降级 ───

function renderError(container, message, canRetry, widgetConfig) {
  container.innerHTML = `
    <div class="widget-error" style="padding:12px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;color:#b91c1c;font-size:13px">
      <div>${message}</div>
      ${canRetry ? '<button class="widget-error__retry" style="margin-top:10px;padding:5px 16px;border:1px solid #3b82f6;border-radius:4px;background:#3b82f6;color:#fff;cursor:pointer">重试</button>' : ''}
    </div>
  `;
  if (canRetry) {
    const savedConfig = widgetConfig || container._widgetConfig;
    container.querySelector('.widget-error__retry')?.addEventListener('click', () => {
      if (!document.contains(container)) return;
      container.innerHTML = '';
      mountWidget(container, savedConfig);
    });
  }
}

// ─── 核心 API ───

/**
 * 加载并挂载物料
 * @param {HTMLElement} container
 * @param {{ name: string, js: string, css?: string, vueVersion?: string, props?: object }} widget
 */
export async function mountWidget(container, widget) {
  container._widgetConfig = widget;
  const { name, js, css, vueVersion = '3', props = {} } = widget;

  try {
    // 加载脚本
    await Promise.all([loadScript(js), loadStyle(css)]);

    // 版本兼容性检查（从脚本源码解析 meta 注释）
    // 先检查依赖，再检查模块
    checkDeps(name, vueVersion, []);

    const mod = window[name];
    if (!mod || typeof mod.mount !== 'function') {
      throw new Error(`物料 ${name} 未导出 mount 方法`);
    }

    const meta = mod.__widget_meta__ || {};
    if (meta.deps?.length) checkDeps(name, vueVersion, meta.deps);
    checkVersionCompat(meta);

    const innerApi = await mod.mount(container, props);
    return {
      unmount() {
        unloadStyle(css);
        if (innerApi?.unmount) innerApi.unmount();
      }
    };
  } catch (err) {
    console.error(`[widget] ${name} 失败:`, err);
    renderError(container, err.message, true, widget);
    return { unmount: () => {} };
  }
}

/**
 * 卸载物料
 */
export function unmountWidget(api) {
  if (api?.unmount) api.unmount();
}

// ─── 懒加载 ───

/**
 * 预加载物料脚本（不挂载）
 * @param {string[]} urls
 */
export function preloadWidgets(urls) {
  if (!urls.length) return;

  const doPreload = () => {
    for (const url of urls) {
      if (!cache.has(url)) loadScript(url);
    }
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doPreload, { timeout: 2000 });
  } else {
    setTimeout(doPreload, 0);
  }
}
