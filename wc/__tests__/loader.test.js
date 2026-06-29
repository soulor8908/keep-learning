import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 用 vi.resetModules + 动态 import 隔离每个用例的模块级 cache / cssRefs，
// 否则跨用例共享 cache 会导致后续用例拿到的 Promise 不再触发 scriptHandlers。
let mountWidget, unmountWidget, ensureRuntimes;

/**
 * 拦截 <script> / <link> 创建，避免测试真的发起网络请求。
 * @param {object} [options]
 * @param {boolean} [options.failJs] 是否模拟所有 JS 加载失败
 * @param {string[]} [options.failUrls] 指定失败的 URL 列表（精确匹配）
 * @param {Record<string, () => void>} [options.scriptHandlers] URL → 加载时模拟 UMD 设置全局变量
 * @param {string[]} [options.appended] 收集所有 appendChild 的 URL（src/href），用于断言加载顺序
 */
function mockResourceLoader(options = {}) {
  const { failJs = false, failUrls = [], scriptHandlers = {}, appended = null } = options;

  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'script') {
      return {
        _tag: 'script',
        _src: '',
        onload: null,
        onerror: null,
        set src(v) { this._src = v; },
        get src() { return this._src; }
      };
    }
    if (tag === 'link') {
      return {
        _tag: 'link',
        _href: '',
        onload: null,
        onerror: null,
        set href(v) { this._href = v; },
        get href() { return this._href; }
      };
    }
    return null;
  });

  vi.spyOn(document.head, 'appendChild').mockImplementation((child) => {
    // 用 queueMicrotask 延迟触发 onload/onerror：
    // loadStyle 在 appendChild 之后才设置 onload，同步调用会拿到 null。
    if (child && child._tag === 'script') {
      const url = child._src;
      if (appended) appended.push(url);
      const shouldFail = failJs || failUrls.includes(url);
      queueMicrotask(() => {
        if (shouldFail) {
          if (typeof child.onerror === 'function') child.onerror();
        } else {
          // 模拟 UMD 加载完成后挂全局变量
          const handler = scriptHandlers[url];
          if (handler) handler();
          if (typeof child.onload === 'function') child.onload();
        }
      });
    } else if (child && child._tag === 'link') {
      if (appended) appended.push(child._href);
      queueMicrotask(() => {
        if (typeof child.onload === 'function') child.onload();
      });
    }
    return child;
  });
}

describe('loader', () => {
  beforeEach(async () => {
    vi.resetModules();
    const loader = await import('../loader.js');
    mountWidget = loader.mountWidget;
    unmountWidget = loader.unmountWidget;
    ensureRuntimes = loader.ensureRuntimes;

    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="host"></div>';
    delete window.biTestWidget;
    delete window.Vue2;
    delete window.Vue3;
    delete window.ELEMENT;
    delete window.ElementPlus;
    delete window.__WIDGET_RUNTIME_URLS__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 既有用例（保证不回归） ───

  it('依赖缺失时渲染错误占位', async () => {
    mockResourceLoader();
    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biTestWidget',
      js: '/widget-deps.js',
      vueVersion: '2'
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('Vue2 运行时未加载');
  });

  it('成功加载并挂载物料', async () => {
    mockResourceLoader();
    window.Vue3 = {};
    window.biTestWidget = {
      mount(container, props) {
        container.innerHTML = `<div class="test-widget">${props.title}</div>`;
        return { unmount: vi.fn() };
      }
    };

    const container = document.getElementById('host');
    const api = await mountWidget(container, {
      name: 'biTestWidget',
      js: '/widget-ok.js',
      vueVersion: '3',
      props: { title: 'hello' }
    });

    expect(container.querySelector('.test-widget').textContent).toBe('hello');
    expect(api.unmount).toBeTypeOf('function');
  });

  it('UMD 未导出 mount 时渲染错误占位', async () => {
    mockResourceLoader();
    window.Vue3 = {};
    window.biTestWidget = {};

    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biTestWidget',
      js: '/widget-no-mount.js',
      vueVersion: '3'
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('未导出 mount 方法');
  });

  it('JS 加载失败时渲染错误占位', async () => {
    mockResourceLoader({ failJs: true });
    window.Vue3 = {};

    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biTestWidget',
      js: '/widget-fail.js',
      vueVersion: '3'
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('JS 加载失败');
  });

  it('unmountWidget 调用返回的 unmount', () => {
    const unmount = vi.fn();
    unmountWidget({ unmount });
    expect(unmount).toHaveBeenCalledOnce();
  });

  it('无 unmount 时 unmountWidget 不报错', () => {
    expect(() => unmountWidget({})).not.toThrow();
    expect(() => unmountWidget(null)).not.toThrow();
  });

  // ─── ensureRuntimes：按需加载运行时 ───

  it('ensureRuntimes 跳过已存在的全局变量', async () => {
    window.Vue3 = { version: '3.4.21' };
    const appended = [];
    mockResourceLoader({
      appended,
      scriptHandlers: {
        '/runtime/vue3.js': () => { window.Vue3 = { version: '3.4.21' }; }
      }
    });

    await ensureRuntimes({ vue3: true });

    // Vue3 已存在，不应再次加载 /runtime/vue3.js
    expect(appended).not.toContain('/runtime/vue3.js');
  });

  it('ensureRuntimes 按需加载 Vue3 全局变量', async () => {
    mockResourceLoader({
      scriptHandlers: {
        '/runtime/vue3.js': () => { window.Vue3 = { version: '3.4.21' }; }
      }
    });

    await ensureRuntimes({ vue3: true });

    expect(window.Vue3).toBeDefined();
    expect(window.Vue3.version).toBe('3.4.21');
  });

  it('ensureRuntimes 解析前置依赖（element-plus 需要 vue3）', async () => {
    const loadOrder = [];
    mockResourceLoader({
      scriptHandlers: {
        '/runtime/vue3.js':          () => { window.Vue3 = {}; loadOrder.push('vue3'); },
        '/runtime/element-plus.js':  () => { window.ElementPlus = {}; loadOrder.push('element-plus'); }
      }
    });

    await ensureRuntimes({ elementPlus: true });

    // vue3 必须先于 element-plus 加载
    expect(loadOrder).toEqual(['vue3', 'element-plus']);
    expect(window.Vue3).toBeDefined();
    expect(window.ElementPlus).toBeDefined();
  });

  it('ensureRuntimes 支持 window.__WIDGET_RUNTIME_URLS__ 覆盖默认 URL', async () => {
    window.__WIDGET_RUNTIME_URLS__ = {
      vue3: { js: '/custom/vue3.js', globalVar: 'Vue3' }
    };
    mockResourceLoader({
      scriptHandlers: {
        '/custom/vue3.js': () => { window.Vue3 = {}; }
      }
    });

    await ensureRuntimes({ vue3: true });

    expect(window.Vue3).toBeDefined();
  });

  // ─── mountWidget 集成 ensureRuntimes ───

  it('mountWidget 按需加载 Vue3 + element-plus 后再挂载物料', async () => {
    const loadOrder = [];
    mockResourceLoader({
      scriptHandlers: {
        '/runtime/vue3.js':          () => { window.Vue3 = {}; loadOrder.push('vue3'); },
        '/runtime/element-plus.js':  () => { window.ElementPlus = {}; loadOrder.push('element-plus'); },
        '/widgets/finance-panel.js':  () => {
          window.biFinancePanel = {
            __widget_meta__: { deps: ['element-plus'] },
            mount(c, p) { c.innerHTML = `<div class="fp">${p.title}</div>`; return { unmount: vi.fn() }; }
          };
          loadOrder.push('widget');
        }
      }
    });

    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biFinancePanel',
      js: '/widgets/finance-panel.js',
      vueVersion: '3',
      runtimeDeps: ['element-plus'],
      props: { title: 'finance' }
    });

    // 物料 UMD 必须最后加载（运行时已就绪）
    expect(loadOrder).toEqual(['vue3', 'element-plus', 'widget']);
    expect(container.querySelector('.fp').textContent).toBe('finance');
  });

  it('mountWidget 不重复加载已存在的 Vue3 运行时', async () => {
    window.Vue3 = {}; // host 已注入
    const appended = [];
    mockResourceLoader({
      appended,
      scriptHandlers: {
        '/widgets/user-panel.js': () => {
          window.biUserPanel = { mount(c) { c.innerHTML = '<div class="up">ok</div>'; return { unmount: vi.fn() }; }};
        }
      }
    });

    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biUserPanel',
      js: '/widgets/user-panel.js',
      vueVersion: '3'
    });

    expect(appended).not.toContain('/runtime/vue3.js');
    expect(container.querySelector('.up')).not.toBeNull();
  });

  it('H5 物料（vueVersion=none）不触发任何运行时加载', async () => {
    const appended = [];
    mockResourceLoader({
      appended,
      scriptHandlers: {
        '/widgets/clock-widget.js': () => {
          window.biClockWidget = { mount(c) { c.innerHTML = '<div class="cw">12:00</div>'; return { unmount: vi.fn() }; }};
        }
      }
    });

    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biClockWidget',
      js: '/widgets/clock-widget.js',
      vueVersion: 'none'
    });

    // 只应加载物料 UMD，不应加载任何 /runtime/*
    expect(appended).toEqual(['/widgets/clock-widget.js']);
    expect(container.querySelector('.cw')).not.toBeNull();
  });

  it('运行时加载失败时降级到错误占位', async () => {
    mockResourceLoader({
      failUrls: ['/runtime/vue3.js'],
      scriptHandlers: {}
    });

    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biFinancePanel',
      js: '/widgets/finance-panel.js',
      vueVersion: '3'
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('JS 加载失败');
  });
});
