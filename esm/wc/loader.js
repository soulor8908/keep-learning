/**
 * ESM + importmap 物料加载器
 *
 * 与 UMD 版本（wc/loader.js）的根本差异：
 * - UMD：external + globals → window.Vue2/Vue3；loader 用 <script> 注入并从 window[name] 取模块
 * - ESM：external + importmap scopes → 浏览器原生模块解析；loader 用 import(url) 直接拿模块命名空间
 *
 * 因此本加载器不再需要：
 * - loadScript（<script> 标签注入）→ 改为动态 import()
 * - ensureRuntimes（按需注入 window 全局变量）→ importmap + 浏览器模块图自动解析、自动按需
 * - checkDeps / checkVersionCompat（运行时依赖与版本检查）→ 缺依赖 import() 直接抛错被降级捕获；
 *   版本由 importmap 单一来源钉死，运行时无需再校验
 * - window[name] 查找 → import() 直接返回模块命名空间
 *
 * 保留：CSS <link> 引用计数、错误降级 + 重试、懒加载预热。
 */

const modCache = new Map();  // url → Promise<Module>
const cssRefs = new Map();   // url → { count, el, promise }

// ─── 动态 import + 缓存 ───
// 浏览器对同一 URL 的模块自带去重，这里再缓存一层 Promise，便于 preload 共享。
function loadModule(url) {
  if (modCache.has(url)) return modCache.get(url);
  // @vite-ignore：避免 Vite dev 试图静态分析运行时才确定的 URL
  const p = import(/* @vite-ignore */ url).catch((e) => {
    modCache.delete(url);
    throw new Error(`模块加载失败: ${url} (${e?.message || e})`);
  });
  modCache.set(url, p);
  return p;
}

// ─── CSS 加载 + 引用计数 ───
function loadStyle(url, options = {}) {
  if (!url) return Promise.resolve();
  const existing = cssRefs.get(url);
  if (existing) {
    existing.count++;
    return existing.promise;
  }

  const { integrity } = options;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = url;
  if (integrity) {
    l.integrity = integrity;
    l.crossOrigin = 'anonymous';
  }
  document.head.appendChild(l);

  const promise = new Promise((resolve, reject) => {
    l.onload = () => resolve();
    l.onerror = () => {
      cssRefs.delete(url);
      if (l.parentNode) l.parentNode.removeChild(l);
      reject(new Error(`CSS 加载失败: ${url}`));
    };
  });

  cssRefs.set(url, { count: 1, el: l, promise });
  return promise;
}

function unloadStyle(url) {
  if (!url) return;
  const ref = cssRefs.get(url);
  if (!ref) return;
  ref.count--;
  if (ref.count <= 0) {
    if (ref.el?.parentNode) ref.el.parentNode.removeChild(ref.el);
    cssRefs.delete(url);
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
    const saved = widgetConfig || container._widgetConfig;
    container.querySelector('.widget-error__retry')?.addEventListener('click', () => {
      if (!document.contains(container)) return;
      container.innerHTML = '';
      mountWidget(container, saved);
    });
  }
}

// ─── 核心 API ───

/**
 * 加载并挂载 ESM 物料
 * @param {HTMLElement} container
 * @param {{ name?: string, url: string, css?: string, props?: object, context?: object, cssIntegrity?: string }} widget
 */
export async function mountWidget(container, widget) {
  container._widgetConfig = widget;
  const { name = 'widget', url, css, props = {}, context = {}, cssIntegrity } = widget;

  // ─── 跨物料通信 pub/sub ───
  const widgetProps = {
    ...props,
    context,
    emit(type, payload) {
      window.dispatchEvent(new CustomEvent(`widget:${type}`, { detail: payload }));
    },
    on(type, handler) {
      const fn = (e) => handler(e.detail);
      window.addEventListener(`widget:${type}`, fn);
      return () => window.removeEventListener(`widget:${type}`, fn);
    }
  };

  try {
    // 并行：动态 import 物料 ESM + 注入 CSS
    // 物料内部的 bare import（vue / element-ui / element-plus）由 <script type="importmap"> 的 scopes 解析，
    // /widgets/vue2/* → Vue2，/widgets/vue3/* → Vue3，天然隔离。
    const [mod] = await Promise.all([
      loadModule(url),
      loadStyle(css, cssIntegrity ? { integrity: cssIntegrity } : {})
    ]);

    // 物料默认导出 { mount, unmount, __widget_meta__ }
    const widgetMod = mod.default || mod;
    if (!widgetMod || typeof widgetMod.mount !== 'function') {
      throw new Error(`物料 ${name} 未导出 mount 方法`);
    }

    const innerApi = await widgetMod.mount(container, widgetProps);
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

// ─── 懒加载预热 ───

/**
 * 预加载物料 ESM 模块（不挂载）
 * 浏览器会在 import 物料时顺带把 importmap 解析出的依赖一并拉取，因此预热物料即预热其依赖。
 * @param {string[]} urls
 */
export function preloadWidgets(urls) {
  if (!urls.length) return;

  const doPreload = () => {
    for (const u of urls) {
      if (!modCache.has(u)) loadModule(u);
    }
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doPreload, { timeout: 2000 });
  } else {
    setTimeout(doPreload, 0);
  }
}
