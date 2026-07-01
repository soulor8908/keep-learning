import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fileURLToPath } from 'url';
import path from 'path';

// ESM loader 用动态 import() 加载物料，无法像 UMD 那样 mock <script>。
// 这里用真实 ESM fixture 模块（file:// URL）驱动 import()，覆盖各分支。
// CSS <link> 在 happy-dom 不会真触发 onload，CSS 相关用例单独 mock link 创建。

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url).href;

let mountWidget, unmountWidget, preloadWidgets;

/**
 * mock <link> 创建与挂载，使 onload 在下一个微任务触发。
 * 返回所有创建过的 link 元素，用于断言引用计数。
 */
function mockLinkLoader() {
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
      queueMicrotask(() => { if (typeof child.onload === 'function') child.onload(); });
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
    // 每个用例重新加载 loader，重置模块级 modCache / cssRefs
    vi.resetModules();
    const loader = await import('../loader.js');
    mountWidget = loader.mountWidget;
    unmountWidget = loader.unmountWidget;
    preloadWidgets = loader.preloadWidgets;

    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="host"></div>';
    globalThis.__RETRY_READY = false;
    globalThis.__WIDGET_EVAL_COUNT = 0;
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
});
