// @vitest-environment happy-dom
// 扁平化 props 协议测试：vue2 widget-wrapper 把声明的 kebab-case prop
// attribute 收集为 widgetProps（reactive data），render 注入 {...widgetProps, scope}。
// 不再有 parseConfig / widgetConfig / config attribute。未声明 props 时
// observedAttributes 为空数组。
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, 'fixtures/test-component.cjs');

vi.mock('../../widget-scope/index.js', () => ({
  createWidgetScope: vi.fn(({ name }) => ({ name, __mockScope: true }))
}));

let createWidgetWrapper;
let counter = 0;

beforeAll(async () => {
  // 设置环境变量，避免 wrapper 顶层 throw；指向 fixture 供 require 分支使用
  process.env.WIDGET_NAME = 'bi-vue2-autoreg-fixture';
  process.env.WIDGET_COMPONENT = FIXTURE;
  const mod = await import('../widget-wrapper.js');
  createWidgetWrapper = mod.createWidgetWrapper;
});

afterEach(() => {
  document.body.innerHTML = '';
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

// 扁平化 props 协议：按 attribute 名设置独立 prop（不再 setAttribute('config')）
function mount(tag, attrs = {}) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) el.setAttribute(k, '');
    else if (v === false || v == null) continue;
    else el.setAttribute(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  document.body.appendChild(el);
  return el;
}

describe('wc/vue2-widget-template', () => {
  describe('createWidgetWrapper 生命周期', () => {
    it('connectedCallback 创建 Vue 实例并 $mount，widgetProps 初始为收集结果', () => {
      // 无声明 props 的组件：widgetProps 收集为空对象
      const { tag } = makeWrapper();
      const el = mount(tag);
      expect(el.vm).toBeTruthy();
      expect(el.vm._mounted).toBe(true);
      // 扁平化 props 协议：widgetProps 而非 widgetConfig
      expect(el.vm.widgetProps).toEqual({});
      el.remove();
    });

    it('connectedCallback 把 scope 注入到 Vue data（widgetScope）', () => {
      const { tag } = makeWrapper();
      const el = mount(tag);
      expect(el.vm.widgetScope).toBeTruthy();
      expect(el.vm.widgetScope.__mockScope).toBe(true);
      el.remove();
    });

    it('disconnectedCallback 调用 $destroy 并清理引用', () => {
      const { tag } = makeWrapper();
      const el = mount(tag);
      const vm = el.vm;
      el.remove();
      expect(vm._destroyed).toBe(true);
      expect(el.vm).toBeNull();
      expect(el._scope).toBeNull();
      expect(el._widgetScope).toBeNull();
    });

    it('未声明 props 时 observedAttributes 为空数组', () => {
      const { Widget } = makeWrapper();
      // 扁平化 props 协议：未声明 props 时无观察属性，不再含 config
      expect(Widget.observedAttributes).toEqual([]);
    });

    it('声明 props 后 observedAttributes 含 kebab attribute（不含 config/scope）', () => {
      const Comp = {
        name: 'Comp',
        props: { title: String, maxCount: Number, scope: Object },
        template: '<div></div>'
      };
      const { Widget } = makeWrapper(Comp);
      expect(Widget.observedAttributes).toEqual(
        expect.arrayContaining(['title', 'max-count'])
      );
      // 不再含 config；scope 由框架注入，不观察
      expect(Widget.observedAttributes).not.toContain('config');
      expect(Widget.observedAttributes).not.toContain('scope');
    });

    it('attributeChangedCallback 更新声明 prop 触发 widgetProps 替换', () => {
      const Comp = {
        name: 'Comp',
        props: { title: String, scope: Object },
        template: '<div></div>'
      };
      const { tag } = makeWrapper(Comp);
      const el = mount(tag, { title: 'a' });
      expect(el.vm.widgetProps.title).toBe('a');
      el.setAttribute('title', 'b');
      expect(el.vm.widgetProps.title).toBe('b');
      el.remove();
    });

    it('attributeChangedCallback 更新 max-count 按数字类型解析', () => {
      const Comp = {
        name: 'Comp',
        props: { maxCount: Number, scope: Object },
        template: '<div></div>'
      };
      const { tag } = makeWrapper(Comp);
      const el = mount(tag, { 'max-count': 5 });
      expect(el.vm.widgetProps.maxCount).toBe(5);
      el.setAttribute('max-count', '10');
      expect(el.vm.widgetProps.maxCount).toBe(10);
      el.remove();
    });

    it('多个实例互不影响（独立 vm 与 scope）', () => {
      const Comp = {
        name: 'Comp',
        props: { title: String, scope: Object },
        template: '<div></div>'
      };
      const { tag } = makeWrapper(Comp);
      const el1 = mount(tag, { title: 'one' });
      const el2 = mount(tag, { title: 'two' });
      expect(el1.vm).not.toBe(el2.vm);
      expect(el1.vm.widgetProps.title).toBe('one');
      expect(el2.vm.widgetProps.title).toBe('two');
      el1.remove();
      el2.remove();
    });
  });
});
