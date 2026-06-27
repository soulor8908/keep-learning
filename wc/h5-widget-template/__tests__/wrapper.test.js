// @vitest-environment happy-dom
// 扁平化 props 协议测试：H5 widget-wrapper 仅观察声明的 kebab-case prop
// attribute，_collectProps() 收集为扁平 props 对象传给 render(props, scope)；
// 不再有 config attribute / getConfig / onConfigChange，统一用 getProps /
// onPropsChange。未声明 props 时 observedAttributes 为空数组。
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

  // 扁平化 props 协议：按 attribute 名设置独立 prop（不再 setAttribute('config')）
  // - boolean true → 空串（presence 语义）
  // - false / null / undefined → 跳过（不设置）
  // - 字符串原样；其余 JSON.stringify
  function mount(tag, attrs = {}) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === true) el.setAttribute(k, '');
      else if (v === false || v == null) continue;
      else el.setAttribute(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    document.body.appendChild(el); // 触发 connectedCallback
    return el;
  }

  describe('createMinimalScope（经 getScope 间接验证）', () => {
    it('meta 含 name / __isWidgetScope / __minimal', () => {
      const { tag } = defineWidget({ render: () => '' });
      const el = mount(tag);
      const scope = el.getScope();
      expect(scope.meta.name).toBe(tag);
      expect(scope.meta.__isWidgetScope).toBe(true);
      expect(scope.meta.__minimal).toBe(true);
      el.remove();
    });

    it('scope 被冻结（只读）', () => {
      const { tag } = defineWidget({ render: () => '' });
      const el = mount(tag);
      const scope = el.getScope();
      expect(Object.isFrozen(scope)).toBe(true);
      expect(Object.isFrozen(scope.meta)).toBe(true);
      el.remove();
    });

    it('fetch 不可用时 request reject（兜底）', async () => {
      const { tag } = defineWidget({ render: () => '' });
      const el = mount(tag);
      const scope = el.getScope();
      // 临时移除全局 fetch
      delete globalThis.fetch;
      await expect(scope.request('http://x')).rejects.toThrow(/fetch unavailable/);
      el.remove();
    });

    it('fetch 可用时 request 转发到 globalThis.fetch', async () => {
      const { tag } = defineWidget({ render: () => '' });
      const el = mount(tag);
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
      const el = mount(tag);
      expect(el.getScope()).toBe(customScope);
      el.remove();
    });
  });

  describe('生命周期：render + onMount + onUnmount cleanup', () => {
    it('connectedCallback 调用 render 并写入 innerHTML', () => {
      const render = vi.fn(() => '<div class="card">hi</div>');
      const { tag } = defineWidget({ render });
      // 未声明 props 时 render 收到空对象
      const el = mount(tag);
      expect(render).toHaveBeenCalledWith({}, expect.anything());
      expect(el.innerHTML).toContain('hi');
      el.remove();
    });

    it('connectedCallback 调用 onMount 并注入 scope（第三参数）', () => {
      const onMount = vi.fn(() => () => {}); // 返回 cleanup
      const { tag } = defineWidget({ onMount });
      const el = mount(tag);
      expect(onMount).toHaveBeenCalledTimes(1);
      const [elArg, propsArg, scopeArg] = onMount.mock.calls[0];
      expect(elArg).toBe(el);
      // 扁平化 props 协议：onMount 收到 (element, props, scope)
      expect(propsArg).toEqual({});
      expect(scopeArg.meta.__isWidgetScope).toBe(true);
      el.remove();
    });

    it('disconnectedCallback 调用 onUnmount 与 onMount 返回的 cleanup', () => {
      const cleanup = vi.fn();
      const onMount = vi.fn(() => cleanup);
      const onUnmount = vi.fn();
      const { tag } = defineWidget({ onMount, onUnmount });
      const el = mount(tag);
      el.remove();
      expect(onUnmount).toHaveBeenCalledTimes(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('disconnectedCallback 后 scope/props 清空', () => {
      const { tag } = defineWidget({ props: ['title'] });
      const el = mount(tag, { title: 't' });
      el.remove();
      expect(el.getScope()).toBeNull();
      // 卸载后 getProps 返回空对象（_props 被置 null）
      expect(el.getProps()).toEqual({});
    });
  });

  // ─── props 收集与变化：扁平化 props 协议 ───
  describe('props 收集与变化（扁平化 props 协议）', () => {
    it('声明 props 后 observedAttributes 含对应 kebab attribute（不含 config）', () => {
      const { Widget } = defineWidget({
        render: () => '',
        props: ['title', 'maxCount', 'isVisible']
      });
      // 仅含声明的 kebab props，不再含 config
      expect(Widget.observedAttributes).toEqual(
        expect.arrayContaining(['title', 'max-count', 'is-visible'])
      );
      expect(Widget.observedAttributes).not.toContain('config');
    });

    it('未声明 props 时 observedAttributes 为空数组', () => {
      const { Widget } = defineWidget({ render: () => '' });
      // 扁平化 props 协议：未声明 props 时无观察属性，不再含 config
      expect(Widget.observedAttributes).toEqual([]);
    });

    it('独立 prop 收集进 props 对象传给 render（扁平，非合并进 config）', () => {
      const render = vi.fn(() => '<div></div>');
      const { tag } = defineWidget({
        render,
        props: ['title', 'maxCount', 'panelData']
      });
      const el = mount(tag, {
        title: 'hello',
        'max-count': 5,
        'panel-data': { x: 1 }
      });
      // render 收到的 props 是扁平对象，每个声明 prop 一项
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'hello', maxCount: 5, panelData: { x: 1 } }),
        expect.anything()
      );
      // 不含 config 字段
      expect(render.mock.calls[0][0]).not.toHaveProperty('config');
      el.remove();
    });

    it('getProps 返回收集后的只读快照', () => {
      const { tag } = defineWidget({
        render: () => '',
        props: ['title', 'count']
      });
      const el = mount(tag, { title: 't', count: 3 });
      const props = el.getProps();
      expect(props.title).toBe('t');
      expect(props.count).toBe(3);
      // 修改快照不影响内部状态
      props.title = 'changed';
      expect(el.getProps().title).toBe('t');
      el.remove();
    });

    it('setAttribute 触发 onPropsChange(element, newProps, oldProps, scope) 并重渲染', () => {
      const render = vi.fn(() => '<div></div>');
      const onPropsChange = vi.fn();
      const { tag } = defineWidget({
        render,
        onPropsChange,
        props: ['title']
      });
      const el = mount(tag, { title: 'a' });
      // 初始 setAttribute 在 connectedCallback 前触发一次 attributeChangedCallback
      // （oldValue=null，不跳过），清空 spy 后只观察后续显式 setAttribute 的回调
      render.mockClear();
      onPropsChange.mockClear();
      el.setAttribute('title', 'b');
      // onPropsChange 签名：(element, newProps, oldProps, scope)
      expect(onPropsChange).toHaveBeenCalledTimes(1);
      const [elArg, newPropsArg, oldPropsArg, scopeArg] = onPropsChange.mock.calls[0];
      expect(elArg).toBe(el);
      expect(newPropsArg).toEqual({ title: 'b' });
      expect(oldPropsArg).toEqual({ title: 'a' });
      expect(scopeArg.meta.__isWidgetScope).toBe(true);
      // 触发重渲染
      expect(render).toHaveBeenCalled();
      el.remove();
    });

    it('attributeChangedCallback 更新独立 prop 后 getProps 反映新值', () => {
      const render = vi.fn(() => '<div></div>');
      const { tag } = defineWidget({
        render,
        props: ['title']
      });
      const el = mount(tag, { title: 'a' });
      render.mockClear();
      el.setAttribute('title', 'b');
      expect(render).toHaveBeenCalled();
      expect(el.getProps().title).toBe('b');
      el.remove();
    });

    it('相同 prop 值不触发 onPropsChange（值未变跳过）', () => {
      const render = vi.fn(() => '');
      const onPropsChange = vi.fn();
      const { tag } = defineWidget({
        render,
        onPropsChange,
        props: ['title']
      });
      const el = mount(tag, { title: 'a' });
      // 初始 setAttribute 在 connectedCallback 前触发一次 attributeChangedCallback
      // （oldValue=null，不跳过），清空 spy 后只观察后续 setAttribute 是否触发
      onPropsChange.mockClear();
      // 设置相同值：attributeChangedCallback 内 oldValue === newValue 跳过
      el.setAttribute('title', 'a');
      expect(onPropsChange).not.toHaveBeenCalled();
      el.remove();
    });

    it('string 属性：JSON.parse 失败回退原始字符串', () => {
      const render = vi.fn(() => '');
      const { tag } = defineWidget({
        render,
        props: ['title']
      });
      const el = mount(tag, { title: 'plain-text' });
      expect(render.mock.calls[0][0].title).toBe('plain-text');
      el.remove();
    });

    it('未设置的 prop 不出现在收集的 props 中', () => {
      const render = vi.fn(() => '');
      const { tag } = defineWidget({
        render,
        props: ['title', 'count']
      });
      const el = mount(tag, { title: 'only' });
      const props = render.mock.calls[0][0];
      expect(props.title).toBe('only');
      expect(props).not.toHaveProperty('count');
      el.remove();
    });

    it('未声明的 attribute 不被 _collectProps 收集', () => {
      const render = vi.fn(() => '');
      const { tag } = defineWidget({
        render,
        props: ['title']
      });
      // 传入未声明的 attr：render 收到的 props 不含该 attr
      const el = mount(tag, { title: 't', 'unknown-attr': 'x' });
      const props = render.mock.calls[0][0];
      expect(props).toEqual({ title: 't' });
      expect(props).not.toHaveProperty('unknownAttr');
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

  describe('XSS 安全：sanitize 选项', () => {
    it('提供 sanitize 函数时 render 结果经 sanitize 处理后写入 innerHTML', () => {
      const sanitize = (html) => html.replace(/<img[^>]*>/g, '[removed]');
      const { tag } = defineWidget({
        render: () => '<div>safe</div><img onerror="alert(1)">',
        sanitize
      });
      const el = mount(tag);
      expect(el.innerHTML).toContain('<div>safe</div>');
      expect(el.innerHTML).toContain('[removed]');
      expect(el.innerHTML).not.toContain('<img');
      el.remove();
    });

    it('未提供 sanitize 时 innerHTML 原样写入（保持向后兼容）', () => {
      const { tag } = defineWidget({
        render: () => '<div class="ok">content</div>'
      });
      const el = mount(tag);
      expect(el.innerHTML).toBe('<div class="ok">content</div>');
      el.remove();
    });

    it('sanitize 收到 render 返回的完整字符串', () => {
      const received = [];
      const sanitize = (html) => { received.push(html); return html; };
      const { tag } = defineWidget({
        render: () => '<p>test</p>',
        sanitize
      });
      const el = mount(tag);
      expect(received).toEqual(['<p>test</p>']);
      el.remove();
    });
  });
});
