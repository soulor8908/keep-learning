// @vitest-environment happy-dom
// 扁平化 props 协议测试：vue2 wrapper 把组件声明的 props 作为独立 kebab-case
// attribute 传入，包装层按声明类型解析后作为独立 prop 注入业务组件。
// 不再有 config attribute / widgetConfig / 向后兼容兜底；scope 由框架注入。
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
  process.env.WIDGET_NAME = 'bi-vue2-props-mode-fixture';
  process.env.WIDGET_COMPONENT = FIXTURE;
  const mod = await import('../widget-wrapper.js');
  createWidgetWrapper = mod.createWidgetWrapper;
});

afterEach(() => {
  document.body.innerHTML = '';
});

function uniqueTag() {
  return `bi-vue2-props-${++counter}`;
}

function makeWrapper(Component) {
  const tag = uniqueTag();
  const WidgetElement = createWidgetWrapper(Component || { name: 'Comp' }, tag);
  customElements.define(tag, WidgetElement);
  return { tag, WidgetElement };
}

// 扁平化 props 协议：按 attribute 名设置独立 prop
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

describe('vue2 wrapper 扁平化 props 协议', () => {
  const PropsComponent = {
    name: 'PropsComp',
    props: {
      title: String,
      maxCount: Number,
      isVisible: Boolean,
      panelData: Object,
      scope: Object
    },
    template: '<div class="props-comp">{{ title }}</div>'
  };

  it('observedAttributes 含 kebab-case 的独立 prop 名（不含 config）', () => {
    const { WidgetElement } = makeWrapper(PropsComponent);
    expect(WidgetElement.observedAttributes).toEqual(
      expect.arrayContaining(['title', 'max-count', 'is-visible', 'panel-data'])
    );
    // 扁平化 props 协议：不再含 config
    expect(WidgetElement.observedAttributes).not.toContain('config');
    // scope 由框架注入，不观察
    expect(WidgetElement.observedAttributes).not.toContain('scope');
  });

  it('未声明 props 的组件：observedAttributes 为空数组', () => {
    const NoPropsComp = {
      name: 'NoProps',
      template: '<div></div>'
    };
    const { WidgetElement } = makeWrapper(NoPropsComp);
    // 扁平化 props 协议：未声明 props 时无观察属性
    expect(WidgetElement.observedAttributes).toEqual([]);
  });

  it('独立 prop 属性按声明类型解析并存入 vm.widgetProps', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, {
      title: 'hello',
      'max-count': 5,
      'is-visible': true,
      'panel-data': { x: 1 }
    });
    expect(el.vm.widgetProps.title).toBe('hello');
    expect(el.vm.widgetProps.maxCount).toBe(5);
    expect(el.vm.widgetProps.isVisible).toBe(true);
    expect(el.vm.widgetProps.panelData).toEqual({ x: 1 });
    // scope 通过 widgetScope data 注入
    expect(el.vm.widgetScope).toBe(el._scope);
    // widgetProps 不含 config 字段
    expect(el.vm.widgetProps).not.toHaveProperty('config');
    el.remove();
  });

  it('string 类型属性：JSON.parse 失败回退为原始字符串', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { title: 'plain-text-no-quotes' });
    expect(el.vm.widgetProps.title).toBe('plain-text-no-quotes');
    el.remove();
  });

  it('boolean 类型：is-visible="" 视为 true', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { 'is-visible': true });
    expect(el.vm.widgetProps.isVisible).toBe(true);
    el.remove();
  });

  it('boolean 类型：is-visible="false" 视为 false', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = document.createElement(tag);
    el.setAttribute('is-visible', 'false');
    document.body.appendChild(el);
    expect(el.vm.widgetProps.isVisible).toBe(false);
    el.remove();
  });

  it('attributeChangedCallback 更新独立 prop 触发 widgetProps 替换', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { title: 'a' });
    expect(el.vm.widgetProps.title).toBe('a');
    el.setAttribute('title', 'b');
    expect(el.vm.widgetProps.title).toBe('b');
    el.remove();
  });

  it('attributeChangedCallback 更新 max-count 按数字类型解析', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { 'max-count': 5 });
    expect(el.vm.widgetProps.maxCount).toBe(5);
    el.setAttribute('max-count', '10');
    expect(el.vm.widgetProps.maxCount).toBe(10);
    el.remove();
  });

  it('未设置的 prop 不出现在 widgetProps 中', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { title: 'only-title' });
    expect(el.vm.widgetProps.title).toBe('only-title');
    expect(el.vm.widgetProps).not.toHaveProperty('maxCount');
    expect(el.vm.widgetProps).not.toHaveProperty('isVisible');
    expect(el.vm.widgetProps).not.toHaveProperty('panelData');
    el.remove();
  });
});
