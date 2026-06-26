// @vitest-environment happy-dom
// 扁平化 props 协议测试：vue3 wrapper 把组件声明的 props 作为独立 kebab-case
// attribute 传入，包装层按声明类型解析后作为独立 prop 注入业务组件。
// 不再有 config attribute / _configRef / 向后兼容兜底；scope 由框架注入。
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, 'fixtures/props-component.js');

// widget-scope mock：返回带标记的 stub scope，便于断言注入
vi.mock('../../widget-scope/index.js', () => ({
  createWidgetScope: vi.fn(({ name }) => ({ name, __mockScope: true }))
}));

let createWidgetWrapper;
let counter = 0;

beforeAll(async () => {
  // 设置模块顶层环境变量占位（wrapper 顶层会读 __WIDGET_NAME__ / __WIDGET_COMPONENT__）
  globalThis.__WIDGET_NAME__ = 'bi-vue3-props-mode-fixture';
  globalThis.__WIDGET_COMPONENT__ = FIXTURE;
  const mod = await import('../widget-wrapper.js');
  createWidgetWrapper = mod.createWidgetWrapper;
});

afterEach(() => {
  document.body.innerHTML = '';
});

function uniqueTag() {
  return `bi-vue3-props-${++counter}`;
}

function makeWrapper(Component) {
  const tag = uniqueTag();
  const WidgetElement = createWidgetWrapper(Component, tag);
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

describe('vue3 wrapper 扁平化 props 协议', () => {
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
    // 独立 prop 按声明顺序转 kebab（scope 被剔除）
    expect(WidgetElement.observedAttributes).toEqual(
      expect.arrayContaining(['title', 'max-count', 'is-visible', 'panel-data'])
    );
    // 扁平化 props 协议：不再含 config
    expect(WidgetElement.observedAttributes).not.toContain('config');
    // scope 不应被观察（框架注入，非宿主传入）
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

  it('独立 prop 属性按声明类型解析并注入 vnode.props', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, {
      title: 'hello',
      'max-count': 5,
      'is-visible': true,
      'panel-data': { x: 1 }
    });
    const vnode = el.app._vnode;
    expect(vnode).toBeTruthy();
    expect(vnode.props.title).toBe('hello');
    expect(vnode.props.maxCount).toBe(5);
    expect(vnode.props.isVisible).toBe(true);
    expect(vnode.props.panelData).toEqual({ x: 1 });
    // scope 在组件声明了 scope prop 时注入（fixture 声明了 scope: Object）
    expect(vnode.props.scope).toBe(el._scope);
    // 扁平化 props 协议：vnode.props 不含 config 字段
    expect(vnode.props).not.toHaveProperty('config');
    el.remove();
  });

  it('string 类型属性：JSON.parse 失败回退为原始字符串', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { title: 'plain-text-no-quotes' });
    expect(el.app._vnode.props.title).toBe('plain-text-no-quotes');
    el.remove();
  });

  it('boolean 类型：is-visible="" 视为 true', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { 'is-visible': true });
    expect(el.app._vnode.props.isVisible).toBe(true);
    el.remove();
  });

  it('boolean 类型：is-visible="false" 视为 false', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = document.createElement(tag);
    el.setAttribute('is-visible', 'false');
    document.body.appendChild(el);
    expect(el.app._vnode.props.isVisible).toBe(false);
    el.remove();
  });

  it('attributeChangedCallback 更新独立 prop 触发 _propsRef 替换', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { title: 'a' });
    expect(el._propsRef.value.title).toBe('a');
    el.setAttribute('title', 'b');
    // Vue3 stub 仅 mount 时调用 render，响应式更新通过 _propsRef.value 反映
    expect(el._propsRef.value.title).toBe('b');
    el.remove();
  });

  it('attributeChangedCallback 更新 max-count 按数字类型解析', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { 'max-count': 5 });
    expect(el._propsRef.value.maxCount).toBe(5);
    el.setAttribute('max-count', '10');
    expect(el._propsRef.value.maxCount).toBe(10);
    el.remove();
  });

  it('未设置的 prop 不出现在 vnode.props 中', () => {
    const { tag } = makeWrapper(PropsComponent);
    const el = mount(tag, { title: 'only-title' });
    const props = el.app._vnode.props;
    expect(props.title).toBe('only-title');
    expect(props).not.toHaveProperty('maxCount');
    expect(props).not.toHaveProperty('isVisible');
    expect(props).not.toHaveProperty('panelData');
    el.remove();
  });
});
