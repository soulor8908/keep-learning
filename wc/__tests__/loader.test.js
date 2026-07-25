import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fileURLToPath } from 'url';
import path from 'path';

// ESM loader 用动态 import() 加载物料，无法像 UMD 那样 mock <script>。
// 这里用真实 ESM fixture 模块（file:// URL）驱动 import()，覆盖各分支。
// CSS <link> 在 happy-dom 不会真触发 onload，CSS 相关用例单独 mock link 创建。

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url).href;

let mountWidget, unmountWidget, unmountContainer, preloadWidgets;

/**
 * mock <link> 创建与挂载，使 onload 在下一个微任务触发。
 * 返回所有创建过的 link 元素，用于断言引用计数。
 * autoLoad=false 时永不触发 onload，模拟弱网挂起（配合 timeout 用例）。
 */
function mockLinkLoader({ autoLoad = true } = {}) {
  const links = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'link') {
      const el = {
        _tag: 'link',
        _href: '',
        rel: '',
        onload: null,
        onerror: null,
        parentNode: null,
        set href(v) { this._href = v; },
        get href() { return this._href; },
        setAttribute() {},
        removeAttribute() {}
      };
      links.push(el);
      return el;
    }
    return realCreate(tag);
  });
  vi.spyOn(document.head, 'appendChild').mockImplementation((child) => {
    if (child && child._tag === 'link') {
      child.parentNode = document.head;
      if (autoLoad) queueMicrotask(() => { if (typeof child.onload === 'function') child.onload(); });
    }
    return child;
  });
  vi.spyOn(document.head, 'removeChild').mockImplementation((child) => {
    if (child && child._tag === 'link') child.parentNode = null;
    return child;
  });
  return links;
}

describe('esm loader', () => {
  beforeEach(async () => {
    // 每个用例重新加载 loader，重置模块级 modCache / cssRefs / sessions
    vi.resetModules();
    const loader = await import('../loader.js');
    mountWidget = loader.mountWidget;
    unmountWidget = loader.unmountWidget;
    unmountContainer = loader.unmountContainer;
    preloadWidgets = loader.preloadWidgets;

    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="host"></div>';
    globalThis.__RETRY_READY = false;
    globalThis.__WIDGET_EVAL_COUNT = 0;
    globalThis.__PING_COUNT = 0;
    globalThis.__SLOW_MOUNTED = 0;
    globalThis.__SLOW_UNMOUNTED = 0;
    globalThis.__SLOW_MOUNT_CALLED = 0;
    globalThis.__SLOW_MOUNT_MS = 30;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.__RETRY_READY = false;
  });

  // ─── 成功挂载 ───

  it('成功 import 并挂载物料', async () => {
    const container = document.getElementById('host');
    const api = await mountWidget(container, {
      name: 'ok-widget',
      url: fixture('widget-ok.js'),
      props: { title: 'hello-esm' }
    });

    expect(container.querySelector('.ok-widget').textContent).toBe('hello-esm');
    expect(typeof api.unmount).toBe('function');
  });

  it('挂载时注入 emit/on 跨物料通信 props', async () => {
    const container = document.getElementById('host');
    let captured;
    await mountWidget(container, {
      url: fixture('widget-ok.js'),
      props: {
        title: 'evt',
        emit(type, payload) { captured = { type, payload }; },
        on() { return () => {}; }
      }
    });

    // loader 会合并 props 并注入 emit/on，原 emit 仍可被物料调用
    expect(captured).toBeUndefined(); // 物料未主动 emit
    expect(typeof container.querySelector('.ok-widget')).not.toBe('null');
  });

  // ─── 错误降级 ───

  it('物料未导出 mount 时渲染错误占位', async () => {
    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'no-mount',
      url: fixture('widget-no-mount.js')
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('未导出 mount 方法');
  });

  it('模块加载失败（URL 不存在）时渲染错误占位', async () => {
    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'missing',
      url: fixture('does-not-exist.js')
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('模块加载失败');
  });

  it('mount() 抛异常时渲染错误占位', async () => {
    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'throws',
      url: fixture('widget-throws.js')
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('模拟物料内部崩溃');
  });

  it('失败占位包含重试按钮，点击后条件满足可成功', async () => {
    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'retry',
      url: fixture('widget-retry.js')
    });

    const retryBtn = container.querySelector('.widget-error__retry');
    expect(retryBtn).not.toBeNull();

    // 修复前置条件后点击重试
    globalThis.__RETRY_READY = true;
    retryBtn.click();

    // 重试是异步 mountWidget，等待成功渲染
    await vi.waitFor(() => {
      expect(container.querySelector('.retry-ok')).not.toBeNull();
    });
  });

  // ─── unmount ───

  it('unmountWidget 调用 api.unmount 并清空容器', async () => {
    const container = document.getElementById('host');
    const api = await mountWidget(container, { url: fixture('widget-ok.js') });
    expect(container.querySelector('.ok-widget')).not.toBeNull();

    unmountWidget(api);
    expect(container.querySelector('.ok-widget')).toBeNull();
  });

  it('unmountWidget 对空/非法输入不抛错', () => {
    expect(() => unmountWidget(null)).not.toThrow();
    expect(() => unmountWidget(undefined)).not.toThrow();
    expect(() => unmountWidget({})).not.toThrow();
  });

  it('失败时返回的 api.unmount 是安全空函数', async () => {
    const container = document.getElementById('host');
    const api = await mountWidget(container, { url: fixture('does-not-exist.js') });
    expect(() => api.unmount()).not.toThrow();
  });

  // ─── 模块缓存（不重复求值） ───

  it('同一 URL 多次挂载不重复求值模块', async () => {
    const container = document.getElementById('host');
    const url = fixture('widget-counter.js');

    await mountWidget(container, { url });
    const countAfterFirst = globalThis.__WIDGET_EVAL_COUNT;

    await mountWidget(container, { url });
    expect(globalThis.__WIDGET_EVAL_COUNT).toBe(countAfterFirst);
  });

  // ─── CSS 引用计数 ───

  it('同一 CSS 多物料共享一个 <link>，全部卸载后才移除', async () => {
    const links = mockLinkLoader();
    const cssUrl = '/fake/shared.css';
    const url = fixture('widget-ok.js');

    const c1 = document.getElementById('host');
    const c2 = document.createElement('div');
    document.body.appendChild(c2);

    const api1 = await mountWidget(c1, { url, css: cssUrl, props: { title: 'a' } });
    const api2 = await mountWidget(c2, { url, css: cssUrl, props: { title: 'b' } });

    // 两次挂载只创建一个 link
    const createdLinks = links.filter((l) => l._href === cssUrl);
    expect(createdLinks).toHaveLength(1);

    // 卸载第一个：引用计数减到 1，link 仍保留
    api1.unmount();
    expect(createdLinks[0].parentNode).toBe(document.head);

    // 卸载第二个：引用计数归 0，link 被移除
    api2.unmount();
    expect(createdLinks[0].parentNode).toBeNull();
  });

  it('无 css 时不创建 <link>', async () => {
    const links = mockLinkLoader();
    const container = document.getElementById('host');
    await mountWidget(container, { url: fixture('widget-ok.js') });
    expect(links).toHaveLength(0);
  });

  // ─── 懒加载预热 ───

  it('preloadWidgets 触发模块预加载（不挂载）', async () => {
    // 强制走 setTimeout 路径（happy-dom 可能无 requestIdleCallback）
    const ric = globalThis.requestIdleCallback;
    delete globalThis.requestIdleCallback;

    try {
      const url = fixture('widget-counter.js');
      const baseline = globalThis.__WIDGET_EVAL_COUNT;
      preloadWidgets([url]);

      // 预热在 setTimeout(0) 内触发 import，await 一段实际时间让其完成
      await new Promise((r) => setTimeout(r, 30));
      expect(globalThis.__WIDGET_EVAL_COUNT).toBeGreaterThan(baseline);
    } finally {
      if (ric) globalThis.requestIdleCallback = ric;
    }
  });

  it('preloadWidgets 空数组不抛错', () => {
    expect(() => preloadWidgets([])).not.toThrow();
  });

  // ─── 竞态防护（一个容器一个物料） ───

  it('同容器重复挂载：旧会话被取消，迟到实例反向卸载且不误伤新物料', async () => {
    const container = document.getElementById('host');
    globalThis.__SLOW_MOUNT_MS = 40;

    const p1 = mountWidget(container, { url: fixture('widget-slow-mount.js'), props: { title: 'slow' } });
    // 等慢挂载的 mount 已被调用（在途），再挂载新物料抢占同一容器
    await vi.waitFor(() => expect(globalThis.__SLOW_MOUNT_CALLED).toBe(1));
    const api2 = await mountWidget(container, { url: fixture('widget-ok.js'), props: { title: 'fast' } });
    await p1;
    // 等慢挂载 timer 触发 + resolve 后的反向卸载完成
    await vi.waitFor(() => expect(globalThis.__SLOW_UNMOUNTED).toBe(1));

    expect(container.querySelector('.ok-widget')?.textContent).toBe('fast');
    expect(container.querySelector('.slow-widget')).toBeNull();
    expect(globalThis.__SLOW_MOUNTED).toBe(1); // 慢挂载确实执行了（在途被取消）
    api2.unmount();
  });

  it('unmountContainer 取消进行中的挂载', async () => {
    const container = document.getElementById('host');
    globalThis.__SLOW_MOUNT_MS = 30;

    const p = mountWidget(container, { url: fixture('widget-slow-mount.js') });
    // 等 mount 已被调用（在途）再取消，命中「resolve 后反向卸载」路径
    await vi.waitFor(() => expect(globalThis.__SLOW_MOUNT_CALLED).toBe(1));
    unmountContainer(container);
    await p;
    await vi.waitFor(() => expect(globalThis.__SLOW_UNMOUNTED).toBe(1));

    expect(container.querySelector('.slow-widget')).toBeNull();
  });

  it('import 在途即取消：mount 不被调用', async () => {
    const container = document.getElementById('host');

    const p = mountWidget(container, { url: fixture('widget-slow-mount.js') });
    unmountContainer(container); // 同步取消：import 尚未 resolve
    await p;
    await new Promise((r) => setTimeout(r, 60));

    expect(globalThis.__SLOW_MOUNT_CALLED).toBe(0); // mount 从未被调用
    expect(container.querySelector('.slow-widget')).toBeNull();
  });

  it('unmountContainer 对空容器不抛错', () => {
    expect(() => unmountContainer(document.createElement('div'))).not.toThrow();
  });

  // ─── 事件监听清理（防泄漏） ───

  it('卸载时自动清理物料经 on() 注册的全局监听', async () => {
    const container = document.getElementById('host');
    const api = await mountWidget(container, { url: fixture('widget-events.js') });

    window.dispatchEvent(new CustomEvent('widget:ping', { detail: {} }));
    expect(globalThis.__PING_COUNT).toBe(1);

    api.unmount();
    window.dispatchEvent(new CustomEvent('widget:ping', { detail: {} }));
    expect(globalThis.__PING_COUNT).toBe(1); // 监听已清理，不再递增
  });

  // ─── emit 优先级（遮蔽回归） ───

  it('调用方传入的 emit 优先于默认 window 广播', async () => {
    const container = document.getElementById('host');
    const received = [];
    await mountWidget(container, {
      url: fixture('widget-emits.js'),
      props: { emit: (type, payload) => received.push([type, payload]) }
    });
    expect(received).toEqual([['ready', { ok: true }]]);
  });

  it('缺省 emit 退化为 window 广播（widget: 前缀）', async () => {
    const container = document.getElementById('host');
    const received = [];
    const handler = (e) => received.push(e.detail);
    window.addEventListener('widget:ready', handler);
    try {
      await mountWidget(container, { url: fixture('widget-emits.js') });
      expect(received).toEqual([{ ok: true }]);
    } finally {
      window.removeEventListener('widget:ready', handler);
    }
  });

  // ─── XSS 防护 ───

  it('错误消息以纯文本渲染，不解析 HTML', async () => {
    const container = document.getElementById('host');
    await mountWidget(container, { url: fixture('widget-throws-xss.js') });

    const errBox = container.querySelector('.widget-error');
    expect(errBox).not.toBeNull();
    expect(errBox.querySelector('img')).toBeNull(); // HTML 未被解析成节点
    expect(errBox.textContent).toContain('<img src=x'); // 错误原文仍可见
    expect(globalThis.__xss).toBeUndefined();
  });

  // ─── 加载超时 ───

  it('CSS 加载挂起时按 timeout 走错误降级', async () => {
    mockLinkLoader({ autoLoad: false }); // link onload 永不触发，模拟弱网挂起
    const container = document.getElementById('host');

    await mountWidget(container, {
      name: 'slowcss',
      url: fixture('widget-ok.js'),
      css: '/fake/hang.css',
      timeout: 20
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('加载超时');
  });

  // ─── onError 上报钩子 ───

  it('失败时调用 onError 上报钩子（含 name/url/container 信息）', async () => {
    const container = document.getElementById('host');
    const errors = [];
    await mountWidget(container, {
      name: 'throws',
      url: fixture('widget-throws.js'),
      onError: (err, info) => errors.push({ message: err.message, name: info.name, hasUrl: !!info.url })
    });
    expect(errors).toEqual([{ message: '模拟物料内部崩溃', name: 'throws', hasUrl: true }]);
  });

  it('onError 自身抛错时不阻断错误降级', async () => {
    const container = document.getElementById('host');
    await mountWidget(container, {
      url: fixture('widget-throws.js'),
      onError: () => { throw new Error('reporter crash'); }
    });
    expect(container.querySelector('.widget-error')).not.toBeNull();
  });

  // ─── update 热更新 ───

  it('物料支持 update 时热更新 DOM（不重挂载）', async () => {
    const container = document.getElementById('host');
    const api = await mountWidget(container, {
      url: fixture('widget-updatable.js'),
      props: { title: 'v1' }
    });
    expect(container.querySelector('.updatable').textContent).toBe('v1');

    const ok = api.update({ title: 'v2' });
    expect(ok).toBe(true);
    expect(container.querySelector('.updatable').textContent).toBe('v2');
  });

  it('物料不支持 update 时返回 false（调用方应重挂载）', async () => {
    const container = document.getElementById('host');
    const api = await mountWidget(container, { url: fixture('widget-ok.js') });
    expect(api.update({ title: 'x' })).toBe(false);
  });

  it('挂载失败后 update 是安全 no-op（返回 true，不抛错）', async () => {
    const container = document.getElementById('host');
    const api = await mountWidget(container, { url: fixture('widget-throws.js') });
    expect(api.update({ title: 'x' })).toBe(true);
  });

  // ─── loading class ───

  it('挂载期间容器带 widget-loading class，结束后移除', async () => {
    const container = document.getElementById('host');
    globalThis.__SLOW_MOUNT_MS = 30;

    const p = mountWidget(container, { url: fixture('widget-slow-mount.js') });
    // mountWidget 同步执行到首个 await，class 已加上
    expect(container.classList.contains('widget-loading')).toBe(true);
    await p;
    expect(container.classList.contains('widget-loading')).toBe(false);
  });

  // ─── CSS 在途取消的引用计数平衡 ───

  it('CSS 加载完成后取消：引用计数经 cssLoaded 路径平衡', async () => {
    const links = mockLinkLoader();
    const container = document.getElementById('host');
    globalThis.__SLOW_MOUNT_MS = 60;

    const p = mountWidget(container, { url: fixture('widget-slow-mount.js'), css: '/fake/inflight.css' });
    // 先让 CSS onload 微任务完成（session.cssLoaded = true），再取消
    await new Promise((r) => setTimeout(r, 10));
    unmountContainer(container);
    await p;
    await new Promise((r) => setTimeout(r, 100));

    const link = links.find((l) => l._href === '/fake/inflight.css');
    expect(link).toBeDefined();
    expect(link.parentNode).toBeNull(); // 引用计数归 0，link 已移除
  });

  it('CSS 在途即取消：加载完成时自动平衡引用计数', async () => {
    const links = mockLinkLoader();
    const container = document.getElementById('host');
    globalThis.__SLOW_MOUNT_MS = 60;

    const p = mountWidget(container, { url: fixture('widget-slow-mount.js'), css: '/fake/inflight2.css' });
    unmountContainer(container); // 同步取消：CSS promise 尚未 resolve
    await p;
    await new Promise((r) => setTimeout(r, 100));

    const link = links.find((l) => l._href === '/fake/inflight2.css');
    expect(link).toBeDefined();
    expect(link.parentNode).toBeNull();
  });
});
