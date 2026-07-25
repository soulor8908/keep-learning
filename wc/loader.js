/**
 * ESM + importmap 物料加载器
 *
 * 职责（只做这些）：动态 import(url)、modCache 去重、CSS 引用计数、错误降级 + 重试、懒加载预热。
 * 依赖隔离交给 importmap scopes，本文件不做版本检查、不做运行时依赖补齐。
 *
 * 生产语义：一个容器一个物料（同容器重复挂载自动取消旧实例，防竞态覆盖）；
 * 卸载自动清理物料经 on() 注册的全局监听（防泄漏）；支持加载超时与错误上报钩子。
 */

const modCache = new Map();   // url → Promise<Module>
const cssRefs = new Map();    // url → { count, el, promise }
const sessions = new WeakMap(); // container → 当前挂载会话

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

// ─── 超时：import() 在弱网可能挂起，超时后走错误降级而不是永远空白。
// 超时只是"放弃等待"，无法中止浏览器模块加载；底层 import 成功后仍进 modCache，相当于预热。
function withTimeout(promise, ms, label) {
  if (!ms) return promise;
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} 加载超时 (${ms}ms)`)), ms); })
  ]);
}

// ─── 会话清理（幂等：pending 与 mounted 阶段都可能触发） ───
function cleanupSession(session) {
  for (const off of session.listeners.splice(0)) {
    try { off(); } catch { /* 物料自己实现的 off 不保证安全，忽略 */ }
  }
  if (session.innerApi) {
    try { session.innerApi.unmount?.(); } catch (e) { console.warn('[widget] unmount 异常:', e); }
    session.innerApi = null;
  }
  if (session.cssLoaded) {
    unloadStyle(session.css);
    session.cssLoaded = false;
  }
}

function cancelSession(session) {
  if (session.cancelled) return;
  session.cancelled = true;
  cleanupSession(session);
}

// ─── 错误降级（DOM 构建 + textContent，杜绝 innerHTML 拼接错误消息带来的注入风险） ───
function renderError(container, message, onRetry) {
  container.textContent = '';
  const box = document.createElement('div');
  box.className = 'widget-error';
  box.style.cssText = 'padding:12px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;color:#b91c1c;font-size:13px';
  const msg = document.createElement('div');
  msg.textContent = message;
  box.appendChild(msg);
  if (onRetry) {
    const btn = document.createElement('button');
    btn.className = 'widget-error__retry';
    btn.textContent = '重试';
    btn.style.cssText = 'margin-top:10px;padding:5px 16px;border:1px solid #3b82f6;border-radius:4px;background:#3b82f6;color:#fff;cursor:pointer';
    btn.addEventListener('click', () => { if (document.contains(container)) onRetry(); });
    box.appendChild(btn);
  }
  container.appendChild(box);
}

// ─── 核心 API ───

/**
 * 加载并挂载 ESM 物料。同一容器重复调用会自动取消/卸载旧物料（一个容器一个物料）。
 * @param {HTMLElement} container
 * @param {{ name?: string, url: string, css?: string, props?: object, context?: object,
 *           cssIntegrity?: string, timeout?: number, onError?: (err: Error, info: object) => void }} widget
 *   timeout：加载超时毫秒数（默认 30000，0 表示不限制）；onError：失败上报钩子（监控用）
 * @returns {Promise<{ unmount: () => void, update: (props: object) => boolean }>}
 *   update 返回 true 表示已热更新，false 表示物料不支持 update（调用方应重挂载）
 */
export async function mountWidget(container, widget) {
  const {
    name = 'widget', url, css, props = {}, context = {},
    cssIntegrity, timeout = 30000, onError
  } = widget;

  // 一个容器一个物料：取消旧会话（进行中的挂载中止、已挂载的实例卸载）
  const prev = sessions.get(container);
  if (prev) cancelSession(prev);

  const session = { cancelled: false, listeners: [], innerApi: null, cssLoaded: false, css };
  sessions.set(container, session);
  container.classList.add('widget-loading');

  // 跨物料通信：优先保留调用方传入的 emit/on（WidgetHost 需双通道转发给基座 Vue），
  // 缺省时退化为 window 广播。on 统一包装追踪解绑函数，卸载时自动清理。
  const emit = props.emit || ((type, payload) => window.dispatchEvent(new CustomEvent(`widget:${type}`, { detail: payload })));
  const baseOn = props.on || ((type, handler) => {
    const fn = (e) => handler(e.detail);
    window.addEventListener(`widget:${type}`, fn);
    return () => window.removeEventListener(`widget:${type}`, fn);
  });
  const on = (type, handler) => {
    const off = baseOn(type, handler);
    session.listeners.push(off);
    return off;
  };
  const mergeProps = (p) => ({ ...p, emit: p.emit || emit, on });
  session.latestProps = mergeProps({ ...props, context });

  const api = {
    unmount() { cancelSession(session); },
    update(nextProps) {
      session.latestProps = mergeProps(nextProps);
      if (!session.innerApi) return true; // 挂载中：完成时使用最新 props
      if (typeof session.innerApi.update === 'function') {
        session.innerApi.update(session.latestProps);
        return true;
      }
      return false; // 物料不支持热更新，由调用方决定重挂载
    }
  };

  try {
    // 并行：动态 import 物料 ESM + 注入 CSS。物料内部 bare import 由 importmap scopes 解析。
    const cssP = loadStyle(css, cssIntegrity ? { integrity: cssIntegrity } : {});
    if (css) {
      // 取消可能发生在 CSS 在途期间：加载完成时若会话已取消，立即平衡引用计数
      cssP.then(() => { session.cancelled ? unloadStyle(css) : (session.cssLoaded = true); }, () => {});
    }
    const [mod] = await withTimeout(Promise.all([loadModule(url), cssP]), timeout, `物料 ${name}`);
    if (session.cancelled) return api;

    // 物料默认导出 { mount, unmount, __widget_meta__ }
    const widgetMod = mod.default || mod;
    if (!widgetMod || typeof widgetMod.mount !== 'function') {
      throw new Error(`物料 ${name} 未导出 mount 方法`);
    }

    const innerApi = await widgetMod.mount(container, session.latestProps);
    if (session.cancelled) { // mount resolve 前被取消：立即反向卸载，防僵尸实例
      try { innerApi?.unmount?.(); } catch (e) { console.warn('[widget] unmount 异常:', e); }
      return api;
    }
    session.innerApi = innerApi;
  } catch (err) {
    if (!session.cancelled) {
      console.error(`[widget] ${name} 失败:`, err);
      try { onError?.(err, { name, url, container }); } catch { /* 上报钩子不阻断主流程 */ }
      renderError(container, err.message, () => mountWidget(container, widget));
    }
  } finally {
    container.classList.remove('widget-loading');
  }
  return api;
}

/** 卸载物料（等价于 api.unmount()） */
export function unmountWidget(api) {
  if (api?.unmount) api.unmount();
}

/** 取消/卸载容器上的当前物料（含进行中的挂载），用于基座组件销毁时 api 尚未 resolve 的场景。 */
export function unmountContainer(container) {
  const session = sessions.get(container);
  if (session) cancelSession(session);
}

// ─── 懒加载预热 ───

/**
 * 预加载物料 ESM 模块（不挂载）。
 * import 物料时浏览器会顺带拉取 importmap 解析出的依赖，因此预热物料即预热其依赖。
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
