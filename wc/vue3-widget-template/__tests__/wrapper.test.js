// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, 'fixtures/test-component.js');
// vue3 wrapper.js 顶层读取裸全局 __WIDGET_NAME__ / __WIDGET_COMPONENT__
// 并 customElements.define 一次（ESM 单次求值）。固定 tag 名即可。
const WIDGET_TAG = 'bi-vue3-autoreg-fixture';

// Vue3 运行时通过本地 stub 提供：wc/vue3-widget-template/node_modules/vue/index.js
// （root package.json 未安装 vue，vi.mock 无法拦截 Vite 对裸模块的预解析，
//  因此用本地 stub 让 `import { createApp, h, ref } from 'vue'` 可解析；stub 即 mock）。
// widget-scope 仍用 vi.mock 替换为可控的 mock scope。
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

function mountEl(config) {
  const el = document.createElement(WIDGET_TAG);
  if (config !== undefined) el.setAttribute('config', JSON.stringify(config));
  document.body.appendChild(el);
  return el;
}

describe('wc/vue3-widget-template', () => {
  it('wrapper 顶层求值成功并自动注册 customElement', () => {
    expect(modLoaded).toBe(true);
    expect(WidgetElement).toBeTruthy();
  });

  it('observedAttributes 包含 config', () => {
    expect(WidgetElement.observedAttributes).toEqual(['config']);
  });

  it('connectedCallback 创建 app 并 mount，configRef 初始为 config', () => {
    const el = mountEl({ a: 1 });
    expect(el.app).toBeTruthy();
    expect(el.app._mounted).toBe(true);
    expect(el._configRef).toBeTruthy();
    expect(el._configRef.value).toEqual({ a: 1 });
  });

  it('挂载后在容器下生成占位 DOM', () => {
    const el = mountEl({});
    expect(el.querySelector('[data-mock-vue3="true"]')).toBeTruthy();
  });

  it('render 注入 scope 与 config 到业务组件 props', () => {
    const el = mountEl({ a: 1 });
    const vnode = el.app._vnode;
    expect(vnode).toBeTruthy();
    expect(vnode.Component).toBeTruthy();
    expect(vnode.props.scope).toBe(el._scope);
    expect(vnode.props.config).toEqual({ a: 1 });
  });

  it('每个实例创建独立 widgetScope', () => {
    const el = mountEl({});
    expect(el._scope).toBeTruthy();
    expect(el._scope.__mockScope).toBe(true);
    expect(el._widgetScope).toBe(el._scope);
  });

  it('attributeChangedCallback 更新 configRef（reactive ref 语义）', () => {
    const el = mountEl({ v: 1 });
    expect(el._configRef.value).toEqual({ v: 1 });
    el.setAttribute('config', JSON.stringify({ v: 2 }));
    expect(el._configRef.value).toEqual({ v: 2 });
  });

  it('config 非法 JSON 时 attributeChangedCallback 兜底为 {} 不抛错', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mountEl({ v: 1 });
    el.setAttribute('config', 'broken-json{{{');
    expect(el._configRef.value).toEqual({});
    errSpy.mockRestore();
  });

  it('disconnectedCallback 调用 app.unmount 并清理 app/configRef/scope 引用', () => {
    const el = mountEl({});
    const app = el.app;
    el.remove();
    expect(app._unmounted).toBe(true);
    expect(el.app).toBeNull();
    expect(el._configRef).toBeNull();
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

  it('多个实例互不影响（独立 app / configRef / scope）', () => {
    const el1 = mountEl({ id: 1 });
    const el2 = mountEl({ id: 2 });
    expect(el1.app).not.toBe(el2.app);
    expect(el1._configRef).not.toBe(el2._configRef);
    expect(el1._scope).not.toBe(el2._scope);
    expect(el1._configRef.value).toEqual({ id: 1 });
    expect(el2._configRef.value).toEqual({ id: 2 });
    el1.remove();
    el2.remove();
  });
});
