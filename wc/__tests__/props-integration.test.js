// @vitest-environment happy-dom
// 端到端集成测试：验证基座 renderWidget(props 模式) → wrapper → 业务组件接收独立 props 的完整链路。
// 这是 AI 一次性迁移演示的核心验证：迁移后保留原有 props 的物料，可被基座以 props 模式加载。
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DUMMY_FIXTURE = path.resolve(__dirname, '../vue3-widget-template/__tests__/fixtures/test-component.js');

// mock i18n 与 widget-context（widget-loader 顶部 import）
vi.mock('../i18n/index.js', () => ({
  t: (key, params) => {
    if (!params) return key;
    return Object.keys(params).reduce(
      (s, k) => s.replace(`{${k}}`, params[k]),
      key
    );
  }
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

describe('端到端：基座 props 模式 → wrapper → 业务组件', () => {
  // 模拟一个迁移后的物料组件（保留原有 props，未新增 config）
  // 就像 AI 迁移工具对 legacy-vue2-app/SalesDashboard.vue 改造后的产物
  const MigratedComponent = {
    name: 'MigratedSalesDashboard',
    props: {
      title: { type: String, default: '销售看板' },
      metrics: { type: Array, default: () => [] },
      showFooter: { type: Boolean, default: true },
      scope: Object
      // 注意：未声明 config prop（props 模式）
    },
    template: '<div class="migrated">{{ title }}</div>'
  };

  it('基座以 props 模式加载迁移后物料，组件收到独立 props', () => {
    const tag = uniqueTag();
    const WidgetElement = createWidgetWrapper(MigratedComponent, tag);
    customElements.define(tag, WidgetElement);

    const container = document.createElement('div');
    document.body.appendChild(container);

    // 基座用 renderWidget 以 props 模式加载
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

  it('基座以 config + props 混用模式加载，两者共存', () => {
    // 声明 config 的组件（config 模式 + 独立 props 混用）
    const MixedComponent = {
      name: 'MixedWidget',
      props: {
        config: { type: Object, default: () => ({}) },
        title: { type: String, default: '' },
        scope: Object
      },
      template: '<div>{{ title }}</div>'
    };

    const tag = uniqueTag();
    const WidgetElement = createWidgetWrapper(MixedComponent, tag);
    customElements.define(tag, WidgetElement);

    const container = document.createElement('div');
    document.body.appendChild(container);

    const el = renderWidget(container, {
      name: tag,
      config: { host: 'demo-env' },
      props: { title: '混用模式标题' }
    });

    // config attribute 写入
    expect(el.getAttribute('config')).toBe(JSON.stringify({ host: 'demo-env' }));
    // 独立 prop attribute 写入
    expect(el.getAttribute('title')).toBe('混用模式标题');

    // 组件同时收到 config 和 title
    const vnode = el.app._vnode;
    expect(vnode.props.config).toEqual({ host: 'demo-env' });
    expect(vnode.props.title).toBe('混用模式标题');

    container.remove();
  });

  it('迁移前后行为一致：老基座仅传 config 仍可加载 props 模式物料', () => {
    // 向后兼容验证：基座不传 props 只传 config，props 模式物料仍正常挂载。
    // 老基座写的 config attribute 会被 wrapper 解析，但因组件未声明 config prop，不会注入；
    // 独立 props 因宿主未传，attribute 缺失，wrapper _collectProps 不收集，
    // 由 Vue 在真实运行时应用 prop 默认值（测试 stub 不模拟默认值，故这里只验证
    // wrapper 不会错误注入 config，也不会凭空造出独立 prop）。
    const tag = uniqueTag();
    const WidgetElement = createWidgetWrapper(MigratedComponent, tag);
    customElements.define(tag, WidgetElement);

    const container = document.createElement('div');
    document.body.appendChild(container);

    const el = renderWidget(container, {
      name: tag,
      config: { legacyConfig: true }
    });

    // config attribute 存在（老基座写入），但组件未声明 config prop，wrapper 不注入
    const vnode = el.app._vnode;
    expect(vnode.props).not.toHaveProperty('config');
    // 宿主未传独立 props，wrapper 不应凭空造出（默认值由 Vue 运行时应用，非 wrapper 职责）
    expect(vnode.props).not.toHaveProperty('title');
    expect(vnode.props).not.toHaveProperty('metrics');
    expect(vnode.props).not.toHaveProperty('showFooter');
    // scope 始终注入
    expect(vnode.props.scope).toBeTruthy();

    container.remove();
  });
});
