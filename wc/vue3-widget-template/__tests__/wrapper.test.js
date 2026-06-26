// @vitest-environment happy-dom
// 扁平化 props 协议测试：vue3 widget-wrapper 把声明的 kebab-case prop
// attribute 收集为 _propsRef（ref），render 注入 {..._propsRef.value, scope}。
// 不再有 _configRef / config attribute / parseConfig。未声明 props 时
// observedAttributes 为空数组。
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 使用声明独立 props 的 fixture（title/maxCount/isVisible/panelData/scope），
// 验证扁平化 props 协议；不再使用声明 config: Object 的旧 fixture。
const FIXTURE = path.resolve(__dirname, 'fixtures/props-component.js');
// vue3 wrapper.js 顶层读取裸全局 __WIDGET_NAME__ / __WIDGET_COMPONENT__
// 并 customElements.define 一次（ESM 单次求值）。固定 tag 名即可。
const WIDGET_TAG = 'bi-vue3-autoreg-fixture';

vi.mock('../../widget-scope/index.js', () => ({
  createWidgetScope: vi.fn(({ name }) => ({ name, __mockScope: true }))
}));

let WidgetElement = null;
let modLoaded = false;

beforeAll(async () => {
  // 预置构建工具 define 注入的全局变量，使 wrapper 顶层 `const widgetName = __WIDGET_NAME__`
  // 等裸标识符能在模块求值时命中 globalThis 上的同名属性。
  globalThis.__WIDGET_NAME__ = WIDGET_TAG;
  globalThis.__WIDGET_COMPONENT__ = FIXTURE;
  await import('../widget-wrapper.js');
  modLoaded = true;
  WidgetElement = customElements.get(WIDGET_TAG);
});

afterEach(() => {
  document.body.innerHTML = '';
});

// 扁平化 props 协议：按 attribute 名设置独立 prop（不再 setAttribute('config')）
function mountEl(attrs = {}) {
  const el = document.createElement(WIDGET_TAG);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) el.setAttribute(k, '');
    else if (v === false || v == null) continue;
    else el.setAttribute(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  document.body.appendChild(el);
  return el;
}

describe('wc/vue3-widget-template', () => {
  it('wrapper 顶层求值成功并自动注册 customElement', () => {
    expect(modLoaded).toBe(true);
    expect(WidgetElement).toBeTruthy();
  });

  it('observedAttributes 含声明的 kebab prop（不含 config/scope）', () => {
    // props-component 声明 title/maxCount/isVisible/panelData/scope
    expect(WidgetElement.observedAttributes).toEqual(
      expect.arrayContaining(['title', 'max-count', 'is-visible', 'panel-data'])
    );
    // 扁平化 props 协议：不再含 config；scope 由框架注入，不观察
    expect(WidgetElement.observedAttributes).not.toContain('config');
    expect(WidgetElement.observedAttributes).not.toContain('scope');
  });

  it('connectedCallback 创建 app 并 mount，_propsRef 初始为收集结果', () => {
    const el = mountEl({ title: 'hi', 'max-count': 5 });
    expect(el.app).toBeTruthy();
    expect(el.app._mounted).toBe(true);
    // 扁平化 props 协议：_propsRef 而非 _configRef
    expect(el._propsRef).toBeTruthy();
    expect(el._propsRef.value).toEqual({ title: 'hi', maxCount: 5 });
    el.remove();
  });

  it('挂载后在容器下生成占位 DOM', () => {
    const el = mountEl();
    expect(el.querySelector('[data-mock-vue3="true"]')).toBeTruthy();
    el.remove();
  });

  it('render 注入 scope 与收集的 props 到业务组件', () => {
    const el = mountEl({ title: 'hi', 'max-count': 5 });
    const vnode = el.app._vnode;
    expect(vnode).toBeTruthy();
    expect(vnode.Component).toBeTruthy();
    expect(vnode.props.title).toBe('hi');
    expect(vnode.props.maxCount).toBe(5);
    expect(vnode.props.scope).toBe(el._scope);
    // 扁平化 props 协议：vnode.props 不含 config 字段
    expect(vnode.props).not.toHaveProperty('config');
    el.remove();
  });

  it('每个实例创建独立 widgetScope', () => {
    const el = mountEl();
    expect(el._scope).toBeTruthy();
    expect(el._scope.__mockScope).toBe(true);
    expect(el._widgetScope).toBe(el._scope);
    el.remove();
  });

  it('attributeChangedCallback 更新 _propsRef（ref 语义）', () => {
    const el = mountEl({ title: 'a' });
    expect(el._propsRef.value.title).toBe('a');
    el.setAttribute('title', 'b');
    expect(el._propsRef.value.title).toBe('b');
    el.remove();
  });

  it('attributeChangedCallback 更新 max-count 按数字类型解析', () => {
    const el = mountEl({ 'max-count': 5 });
    expect(el._propsRef.value.maxCount).toBe(5);
    el.setAttribute('max-count', '10');
    expect(el._propsRef.value.maxCount).toBe(10);
    el.remove();
  });

  it('string 类型属性：JSON.parse 失败回退为原始字符串', () => {
    const el = mountEl({ title: 'plain-text' });
    expect(el._propsRef.value.title).toBe('plain-text');
    el.remove();
  });

  it('disconnectedCallback 调用 app.unmount 并清理 app/_propsRef/scope 引用', () => {
    const el = mountEl();
    const app = el.app;
    el.remove();
    expect(app._unmounted).toBe(true);
    expect(el.app).toBeNull();
    // 扁平化 props 协议：_propsRef 而非 _configRef
    expect(el._propsRef).toBeNull();
    expect(el._scope).toBeNull();
    expect(el._widgetScope).toBeNull();
  });

  it('shadowRoot 告警分支：connectedCallback 检测到 shadowRoot 时打印 error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement(WIDGET_TAG);
    // 模拟“误引入 attachShadow / defineCustomElement”的场景：先挂 shadowRoot 再连接
    let shadowAttached = false;
    try {
      el.attachShadow({ mode: 'open' });
      shadowAttached = !!el.shadowRoot;
    } catch (e) {
      // happy-dom 若不支持 attachShadow，跳过本断言
      shadowAttached = false;
    }
    if (!shadowAttached) {
      errSpy.mockRestore();
      return;
    }
    document.body.appendChild(el);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    el.remove();
  });

  it('多个实例互不影响（独立 app / _propsRef / scope）', () => {
    const el1 = mountEl({ title: 'one' });
    const el2 = mountEl({ title: 'two' });
    expect(el1.app).not.toBe(el2.app);
    expect(el1._propsRef).not.toBe(el2._propsRef);
    expect(el1._scope).not.toBe(el2._scope);
    expect(el1._propsRef.value.title).toBe('one');
    expect(el2._propsRef.value.title).toBe('two');
    el1.remove();
    el2.remove();
  });
});
