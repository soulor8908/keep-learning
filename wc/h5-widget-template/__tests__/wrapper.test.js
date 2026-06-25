// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createH5Widget } from '../widget-wrapper.js';

// h5 widget-wrapper.js 通过 module.exports 导出 createH5Widget（CJS），
// vitest CJS interop 提供 named import。createMinimalScope 未导出，
// 通过 createH5Widget 实例的 getScope() 间接验证（不侵入未导出的内部函数）。
describe('wc/h5-widget-template', () => {
  let originalFetch;
  let tagCounter = 0;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // 注意：tagCounter 不重置——customElements 注册表跨用例持久，
    // 重置会导致重复 define 同名标签报错。每个用例都取下一个唯一序号。
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 生成唯一 custom element 标签名，避免重复 define 报错
  function uniqueTag() {
    return `bi-h5-test-${++tagCounter}`;
  }

  function defineWidget(opts = {}) {
    const tag = uniqueTag();
    const render = opts.render || (() => `<div class="h5-widget">default</div>`);
    const Widget = createH5Widget({ name: tag, render, ...opts });
    customElements.define(tag, Widget);
    return { tag, Widget };
  }

  function mount(tag, config) {
    const el = document.createElement(tag);
    if (config !== undefined) el.setAttribute('config', JSON.stringify(config));
    document.body.appendChild(el); // 触发 connectedCallback
    return el;
  }

  describe('createMinimalScope（经 getScope 间接验证）', () => {
    it('meta 含 name / __isWidgetScope / __minimal', () => {
      const { tag } = defineWidget({ render: () => '' });
      const el = mount(tag, {});
      const scope = el.getScope();
      expect(scope.meta.name).toBe(tag);
      expect(scope.meta.__isWidgetScope).toBe(true);
      expect(scope.meta.__minimal).toBe(true);
      el.remove();
    });

    it('scope 被冻结（只读）', () => {
      const { tag } = defineWidget({ render: () => '' });
      const el = mount(tag, {});
      const scope = el.getScope();
      expect(Object.isFrozen(scope)).toBe(true);
      expect(Object.isFrozen(scope.meta)).toBe(true);
      el.remove();
    });

    it('fetch 不可用时 request reject（兜底）', async () => {
      const { tag } = defineWidget({ render: () => '' });
      const el = mount(tag, {});
      const scope = el.getScope();
      // 临时移除全局 fetch
      delete globalThis.fetch;
      await expect(scope.request('http://x')).rejects.toThrow(/fetch unavailable/);
      el.remove();
    });

    it('fetch 可用时 request 转发到 globalThis.fetch', async () => {
      const { tag } = defineWidget({ render: () => '' });
      const el = mount(tag, {});
      const scope = el.getScope();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = fetchMock;
      await scope.request('http://x', { method: 'GET' });
      expect(fetchMock).toHaveBeenCalledWith('http://x', { method: 'GET' });
      el.remove();
    });

    it('opts.scope 注入时优先于内建 minimal scope', () => {
      const customScope = { meta: { name: 'custom', __isWidgetScope: true }, custom: true };
      const { tag } = defineWidget({ render: () => '', scope: customScope });
      const el = mount(tag, {});
      expect(el.getScope()).toBe(customScope);
      el.remove();
    });
  });

  describe('生命周期：render + onMount + onUnmount cleanup', () => {
    it('connectedCallback 调用 render 并写入 innerHTML', () => {
      const render = vi.fn(() => '<div class="card">hi</div>');
      const { tag } = defineWidget({ render });
      const el = mount(tag, { x: 1 });
      expect(render).toHaveBeenCalledWith({ x: 1 }, expect.anything());
      expect(el.innerHTML).toContain('hi');
      el.remove();
    });

    it('connectedCallback 调用 onMount 并注入 scope', () => {
      const onMount = vi.fn(() => () => {}); // 返回 cleanup
      const { tag } = defineWidget({ onMount });
      const el = mount(tag, { a: 1 });
      expect(onMount).toHaveBeenCalledTimes(1);
      const [elArg, cfgArg, scopeArg] = onMount.mock.calls[0];
      expect(elArg).toBe(el);
      expect(cfgArg).toEqual({ a: 1 });
      expect(scopeArg.meta.__isWidgetScope).toBe(true);
      el.remove();
    });

    it('disconnectedCallback 调用 onUnmount 与 onMount 返回的 cleanup', () => {
      const cleanup = vi.fn();
      const onMount = vi.fn(() => cleanup);
      const onUnmount = vi.fn();
      const { tag } = defineWidget({ onMount, onUnmount });
      const el = mount(tag, {});
      el.remove();
      expect(onUnmount).toHaveBeenCalledTimes(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('disconnectedCallback 后 scope/config 清空', () => {
      const { tag } = defineWidget();
      const el = mount(tag, { v: 1 });
      el.remove();
      expect(el.getScope()).toBeNull();
      expect(el.getConfig()).toEqual({});
    });
  });

  describe('config 变化与解析容错', () => {
    it('config 变化触发 onConfigChange 并重渲染', () => {
      const render = vi.fn(() => '<div></div>');
      const onConfigChange = vi.fn();
      const { tag } = defineWidget({ render, onConfigChange });
      const el = mount(tag, { v: 1 });
      render.mockClear();
      el.setAttribute('config', JSON.stringify({ v: 2 }));
      expect(onConfigChange).toHaveBeenCalledWith(el, { v: 2 }, { v: 1 }, expect.anything());
      expect(render).toHaveBeenCalled(); // 重渲染
      el.remove();
    });

    it('config 非法 JSON 不抛错（返回 {}）', () => {
      const render = vi.fn(() => '');
      const { tag } = defineWidget({ render });
      const el = document.createElement(tag);
      el.setAttribute('config', 'not-valid-json{{{');
      document.body.appendChild(el);
      expect(render).toHaveBeenCalledWith({}, expect.anything());
      el.remove();
    });

    it('config 空值解析为 {}', () => {
      const render = vi.fn(() => '');
      const { tag } = defineWidget({ render });
      const el = mount(tag); // 不设置 config
      expect(render).toHaveBeenCalledWith({}, expect.anything());
      el.remove();
    });

    it('getConfig 返回只读快照（修改不影响内部）', () => {
      const { tag } = defineWidget();
      const el = mount(tag, { v: 1 });
      const cfg = el.getConfig();
      cfg.v = 999;
      expect(el.getConfig().v).toBe(1); // 内部未受影响
      el.remove();
    });

    it('相同 config 值不触发 onConfigChange（值未变跳过）', () => {
      const render = vi.fn(() => '');
      const onConfigChange = vi.fn();
      const { tag } = defineWidget({ render, onConfigChange });
      const el = mount(tag, { v: 1 });
      // 初始 setAttribute 会触发一次 onConfigChange（oldValue=null），记录当前调用数
      const callsBefore = onConfigChange.mock.calls.length;
      el.setAttribute('config', JSON.stringify({ v: 1 })); // 相同 JSON 字符串
      expect(onConfigChange.mock.calls.length).toBe(callsBefore); // 未增加
      el.remove();
    });
  });

  describe('参数校验', () => {
    it('缺 name 抛错', () => {
      expect(() => createH5Widget({ render: () => '' })).toThrow(/name.*render.*必须/);
    });

    it('缺 render 抛错', () => {
      expect(() => createH5Widget({ name: 'bi-x' })).toThrow(/name.*render.*必须/);
    });

    it('render 非函数抛错', () => {
      expect(() => createH5Widget({ name: 'bi-x', render: 'not-fn' })).toThrow(/name.*render.*必须/);
    });
  });
});
