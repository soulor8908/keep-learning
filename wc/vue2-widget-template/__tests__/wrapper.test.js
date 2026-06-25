// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, 'fixtures/test-component.cjs');

// Vue2 运行时通过本地 stub 提供：wc/vue2-widget-template/node_modules/vue/index.js
// （root package.json 未安装 vue，vi.mock 无法拦截 Vite 对裸模块的预解析，
//  因此用本地 stub 让 `import Vue from 'vue'` 可解析；stub 即 mock）。
// stub 在 $mount 时打 _mounted 标记、$destroy 时打 _destroyed，供断言使用。

vi.mock('../../widget-scope/index.js', () => ({
  createWidgetScope: vi.fn(({ name }) => ({ name, __mockScope: true }))
}));

let parseConfig, createWidgetWrapper;
let counter = 0;

beforeAll(async () => {
  // 设置环境变量，避免 wrapper 顶层 throw；指向 fixture 供 require 分支使用
  process.env.WIDGET_NAME = 'bi-vue2-autoreg-fixture';
  process.env.WIDGET_COMPONENT = FIXTURE;
  const mod = await import('../widget-wrapper.js');
  parseConfig = mod.parseConfig;
  createWidgetWrapper = mod.createWidgetWrapper;
});

function uniqueTag() {
  return `bi-vue2-test-${++counter}`;
}

function makeWrapper(Component) {
  const tag = uniqueTag();
  const Widget = createWidgetWrapper(Component || { name: 'Comp' }, tag);
  customElements.define(tag, Widget);
  return { tag, Widget };
}

function mount(tag, config) {
  const el = document.createElement(tag);
  if (config !== undefined) el.setAttribute('config', JSON.stringify(config));
  document.body.appendChild(el);
  return el;
}

describe('wc/vue2-widget-template', () => {
  describe('parseConfig 纯函数', () => {
    it('合法 JSON 返回对象', () => {
      expect(parseConfig('{"a":1}')).toEqual({ a: 1 });
    });

    it('非法 JSON 返回 {} 不抛错', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(parseConfig('not-json{{{')).toEqual({});
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('空值（null/undefined/空串）返回 {}', () => {
      expect(parseConfig(null)).toEqual({});
      expect(parseConfig(undefined)).toEqual({});
      expect(parseConfig('')).toEqual({});
    });

    it('保留嵌套对象结构', () => {
      expect(parseConfig('{"a":{"b":[1,2]}}')).toEqual({ a: { b: [1, 2] } });
    });
  });

  describe('createWidgetWrapper 生命周期', () => {
    it('connectedCallback 创建 Vue 实例并 $mount', () => {
      const { tag } = makeWrapper();
      const el = mount(tag, { a: 1 });
      expect(el.vm).toBeTruthy();
      expect(el.vm._mounted).toBe(true);
      expect(el.vm.widgetConfig).toEqual({ a: 1 });
      el.remove();
    });

    it('connectedCallback 把 scope 注入到 Vue data', () => {
      const { tag } = makeWrapper();
      const el = mount(tag, {});
      expect(el.vm.widgetScope).toBeTruthy();
      expect(el.vm.widgetScope.__mockScope).toBe(true);
      el.remove();
    });

    it('attributeChangedCallback 更新 widgetConfig 触发重渲染', () => {
      const { tag } = makeWrapper();
      const el = mount(tag, { v: 1 });
      expect(el.vm.widgetConfig).toEqual({ v: 1 });
      el.setAttribute('config', JSON.stringify({ v: 2 }));
      expect(el.vm.widgetConfig).toEqual({ v: 2 });
      el.remove();
    });

    it('config 非法 JSON 时 attributeChangedCallback 兜底为 {}', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { tag } = makeWrapper();
      const el = mount(tag, { v: 1 });
      el.setAttribute('config', 'broken-json{{{');
      expect(el.vm.widgetConfig).toEqual({});
      errSpy.mockRestore();
      el.remove();
    });

    it('disconnectedCallback 调用 $destroy 并清理引用', () => {
      const { tag } = makeWrapper();
      const el = mount(tag, {});
      const vm = el.vm;
      el.remove();
      expect(vm._destroyed).toBe(true);
      expect(el.vm).toBeNull();
      expect(el._scope).toBeNull();
      expect(el._widgetScope).toBeNull();
    });

    it('observedAttributes 包含 config', () => {
      const { Widget } = makeWrapper();
      expect(Widget.observedAttributes).toEqual(['config']);
    });

    it('多个实例互不影响（独立 vm 与 scope）', () => {
      const { tag } = makeWrapper();
      const el1 = mount(tag, { id: 1 });
      const el2 = mount(tag, { id: 2 });
      expect(el1.vm).not.toBe(el2.vm);
      expect(el1.vm.widgetConfig).toEqual({ id: 1 });
      expect(el2.vm.widgetConfig).toEqual({ id: 2 });
      el1.remove();
      el2.remove();
    });
  });
});
