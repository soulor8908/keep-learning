// @vitest-environment happy-dom
// 端到端集成测试：验证基座 renderWidget(扁平化 props 协议) → wrapper → 业务组件
// 接收独立 props 的完整链路。这是 AI 一次性迁移演示的核心验证：迁移后保留原有
// props 的物料，可被基座以扁平化 props 协议加载（每个 prop 作为独立 kebab attribute）。
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DUMMY_FIXTURE = path.resolve(__dirname, '../vue3-widget-template/__tests__/fixtures/props-component.js');

// mock i18n 与 widget-context（widget-loader 顶部 import）
vi.mock('../i18n/index.js', () => ({
  t: (key, params) => {
    if (!params) return key;
    return Object.keys(params).reduce(
      (s, k) => s.replace(`{${k}}`, params[k]),
      key
    );
  },
  onLocaleChange: () => () => {}
}));
vi.mock('../widget-context/index.js', () => ({
  injectContext: () => {}
}));

// widget-scope mock
vi.mock('../widget-scope/index.js', () => ({
  createWidgetScope: vi.fn(({ name }) => ({ name, __mockScope: true }))
}));

// widget-loader 静态 import（无模块级副作用）
import { renderWidget } from '../widget-loader/index.js';

// vue3 wrapper 有模块级自动注册副作用（读 __WIDGET_NAME__ / __WIDGET_COMPONENT__），
// 需先设好全局再用动态 import 加载
let createWidgetWrapper;
beforeAll(async () => {
  globalThis.__WIDGET_NAME__ = 'bi-e2e-dummy-fixture';
  globalThis.__WIDGET_COMPONENT__ = DUMMY_FIXTURE;
  const mod = await import('../vue3-widget-template/widget-wrapper.js');
  createWidgetWrapper = mod.createWidgetWrapper;
});

let counter = 0;

function uniqueTag() {
  return `bi-e2e-props-${++counter}`;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('端到端：基座扁平化 props 协议 → wrapper → 业务组件', () => {
  // 模拟一个迁移后的物料组件（保留原有 props，未新增 config）
  // 就像 AI 迁移工具对 legacy-vue2-app/SalesDashboard.vue 改造后的产物
  const MigratedComponent = {
    name: 'MigratedSalesDashboard',
    props: {
      title: { type: String, default: '销售看板' },
      metrics: { type: Array, default: () => [] },
      showFooter: { type: Boolean, default: true },
      scope: Object
      // 注意：未声明 config prop（扁平化 props 协议）
    },
    template: '<div class="migrated">{{ title }}</div>'
  };

  it('基座以扁平化 props 协议加载迁移后物料，组件收到独立 props', () => {
    const tag = uniqueTag();
    const WidgetElement = createWidgetWrapper(MigratedComponent, tag);
    customElements.define(tag, WidgetElement);

    const container = document.createElement('div');
    document.body.appendChild(container);

    // 基座用 renderWidget 以扁平化 props 协议加载：每个 prop 写为独立 kebab attribute
    const el = renderWidget(container, {
      name: tag,
      props: {
        title: 'Q3 销售概览',
        metrics: [{ label: '营收', value: 128000 }],
        showFooter: false
      }
    });

    // 验证基座写入的 kebab-case attributes
    expect(el.getAttribute('title')).toBe('Q3 销售概览');
    expect(el.getAttribute('metrics')).toBe(JSON.stringify([{ label: '营收', value: 128000 }]));
    // showFooter=false → 显式写为 "false" 字符串（不能用 removeAttribute，否则丢失 false）
    expect(el.getAttribute('show-footer')).toBe('false');
    // 扁平化 props 协议：不再写 config attribute
    expect(el.hasAttribute('config')).toBe(false);

    // 验证 wrapper 解析后传给业务组件的 props
    const vnode = el.app._vnode;
    expect(vnode.props.title).toBe('Q3 销售概览');
    expect(vnode.props.metrics).toEqual([{ label: '营收', value: 128000 }]);
    expect(vnode.props.showFooter).toBe(false);
    // scope 始终注入
    expect(vnode.props.scope).toBeTruthy();
    // 未声明 config，不应注入
    expect(vnode.props).not.toHaveProperty('config');

    container.remove();
  });
});
