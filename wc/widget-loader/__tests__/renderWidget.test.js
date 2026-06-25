// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock i18n，t() 直接返回原 key（避免翻译缺失干扰断言）
vi.mock('../../i18n/index.js', () => ({
  t: (key, params) => {
    if (!params) return key;
    return Object.keys(params).reduce(
      (s, k) => s.replace(`{${k}}`, params[k]),
      key
    );
  }
}));

// mock widget-context 的 injectContext 为空操作（renderWidget 调用，但此处不验证其行为）
vi.mock('../../widget-context/index.js', () => ({
  injectContext: () => {}
}));

import { renderWidget } from '../index.js';

describe('renderWidget', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('传统 config 模式：仅设置 config attribute', () => {
    const el = renderWidget(container, {
      name: 'bi-legacy-widget',
      config: { a: 1, b: 'x' }
    });
    expect(el.tagName.toLowerCase()).toBe('bi-legacy-widget');
    expect(el.getAttribute('config')).toBe(JSON.stringify({ a: 1, b: 'x' }));
    // 没声明 props 时不应残留 props 相关 attribute
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.hasAttribute('count')).toBe(false);
    expect(el.hasAttribute('scope')).toBe(false);
  });

  it('config 默认 {}：写入空对象字符串', () => {
    const el = renderWidget(container, { name: 'bi-x' });
    expect(el.getAttribute('config')).toBe('{}');
  });

  it('config 循环引用抛 CONFIG_ERROR 且不挂载', () => {
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    expect(() =>
      renderWidget(container, { name: 'bi-x', config: cyclic })
    ).toThrow(/config_serialize_failed/);
    expect(container.children.length).toBe(0);
  });

  it('props 模式：camelCase → kebab-case 独立 attribute', () => {
    const el = renderWidget(container, {
      name: 'bi-props-widget',
      props: {
        title: 'hello',
        maxCount: 5,
        isVisible: true,
        panelData: { x: 1 }
      }
    });
    expect(el.getAttribute('title')).toBe('hello');
    expect(el.getAttribute('max-count')).toBe('5');
    // boolean true → 空串（presence 语义）
    expect(el.hasAttribute('is-visible')).toBe(true);
    expect(el.getAttribute('is-visible')).toBe('');
    // 对象走 JSON.stringify
    expect(el.getAttribute('panel-data')).toBe(JSON.stringify({ x: 1 }));
    // config 仍被默认写入 {}（向后兼容：未配置 config 时为 {}）
    expect(el.getAttribute('config')).toBe('{}');
  });

  it('props 同时声明 config：两者共存', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      config: { host: 'demo' },
      props: { title: 't', count: 3 }
    });
    expect(el.getAttribute('config')).toBe(JSON.stringify({ host: 'demo' }));
    expect(el.getAttribute('title')).toBe('t');
    expect(el.getAttribute('count')).toBe('3');
  });

  it('props 中的 config/scope 被忽略（loader 内部维护）', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      props: { config: { bad: 1 }, scope: { leak: true }, title: 'ok' }
    });
    expect(el.getAttribute('title')).toBe('ok');
    // config/scope 不应被 props 覆盖；config 仍为默认 {}
    expect(el.getAttribute('config')).toBe('{}');
    // scope 完全不应出现
    expect(el.hasAttribute('scope')).toBe(false);
  });

  it('props 中 false 写为 "false" 字符串，null/undefined 移除 attribute', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      props: {
        disabled: false,
        empty: null,
        missing: undefined,
        title: 'keep'
      }
    });
    // false 显式写为 "false" 字符串：wrapper parseAttrValue(Boolean) 解析回 false。
    // 不能用 removeAttribute——否则 wrapper _collectProps 跳过该 prop，Vue 回退到默认值，
    // 宿主显式传入的 false 丢失（尤其默认值为 true 时）。
    expect(el.getAttribute('disabled')).toBe('false');
    // null / undefined 表示"未设置"，移除 attribute 让 Vue 应用默认值
    expect(el.hasAttribute('empty')).toBe(false);
    expect(el.hasAttribute('missing')).toBe(false);
    expect(el.getAttribute('title')).toBe('keep');
  });

  it('props 字符串值原样写入（不经 JSON.stringify）', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      props: { label: 'simple' }
    });
    expect(el.getAttribute('label')).toBe('simple');
    // 不是 "simple"（带引号）
    expect(el.getAttribute('label')).not.toBe('"simple"');
  });

  it('props 中数字被序列化为字符串', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      props: { count: 42, ratio: 0.5 }
    });
    expect(el.getAttribute('count')).toBe('42');
    expect(el.getAttribute('ratio')).toBe('0.5');
  });

  it('props 含数组：JSON 序列化', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      props: { items: [1, 2, 3] }
    });
    expect(el.getAttribute('items')).toBe('[1,2,3]');
  });

  it('connectedCallback 同步抛错时元素被移除并向上抛出', () => {
    // 注册一个 connectedCallback 抛错的 Custom Element
    const tag = 'bi-throws-on-connect';
    class BoomEl extends HTMLElement {
      connectedCallback() {
        throw new Error('boom');
      }
    }
    customElements.define(tag, BoomEl);

    expect(() =>
      renderWidget(container, { name: tag, config: {} })
    ).toThrow('boom');
    // 半挂载元素必须被移除，避免残留破坏节点影响布局
    expect(container.children.length).toBe(0);
  });

  it('props 为非对象（如字符串/数组）：跳过不抛错', () => {
    // 防御性：props 应为对象，传入非对象不应崩，仅跳过
    const el1 = renderWidget(container, { name: 'bi-x', props: 'invalid' });
    expect(el1.getAttribute('config')).toBe('{}');

    const el2 = renderWidget(container, { name: 'bi-y', props: null });
    expect(el2.getAttribute('config')).toBe('{}');
  });
});
