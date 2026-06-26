// @vitest-environment happy-dom
// 扁平化 props 协议测试：renderWidget 仅把 widget.props 的每个字段按 kebab-case
// 写为独立 attribute（true→空串、false→"false"、null/undefined→移除、string 原样、
// number/object/array→JSON.stringify），不再写 config attribute。
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

  it('props 模式：camelCase → kebab-case 独立 attribute，不写 config', () => {
    const el = renderWidget(container, {
      name: 'bi-props-widget',
      props: {
        title: 'hello',
        maxCount: 5,
        isVisible: true,
        panelData: { x: 1 }
      }
    });
    expect(el.tagName.toLowerCase()).toBe('bi-props-widget');
    expect(el.getAttribute('title')).toBe('hello');
    expect(el.getAttribute('max-count')).toBe('5');
    // boolean true → 空串（presence 语义）
    expect(el.hasAttribute('is-visible')).toBe(true);
    expect(el.getAttribute('is-visible')).toBe('');
    // 对象走 JSON.stringify
    expect(el.getAttribute('panel-data')).toBe(JSON.stringify({ x: 1 }));
    // 扁平化 props 协议：不再写 config attribute
    expect(el.hasAttribute('config')).toBe(false);
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
    expect(el.hasAttribute('config')).toBe(false);
  });

  it('props 字符串值原样写入（不经 JSON.stringify）', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      props: { label: 'simple' }
    });
    expect(el.getAttribute('label')).toBe('simple');
    // 不是 "simple"（带引号）
    expect(el.getAttribute('label')).not.toBe('"simple"');
    expect(el.hasAttribute('config')).toBe(false);
  });

  it('props 中数字被序列化为字符串', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      props: { count: 42, ratio: 0.5 }
    });
    expect(el.getAttribute('count')).toBe('42');
    expect(el.getAttribute('ratio')).toBe('0.5');
    expect(el.hasAttribute('config')).toBe(false);
  });

  it('props 含数组：JSON 序列化', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      props: { items: [1, 2, 3] }
    });
    expect(el.getAttribute('items')).toBe('[1,2,3]');
    expect(el.hasAttribute('config')).toBe(false);
  });

  it('props 中的 scope 被忽略（loader 内部维护，不允许从 props 覆盖）', () => {
    const el = renderWidget(container, {
      name: 'bi-x',
      props: { scope: { leak: true }, title: 'ok' }
    });
    expect(el.getAttribute('title')).toBe('ok');
    // scope 完全不应出现为 attribute（由 loader/wrapper 内部维护）
    expect(el.hasAttribute('scope')).toBe(false);
    // 不写 config attribute
    expect(el.hasAttribute('config')).toBe(false);
  });

  it('props 循环引用抛 PROPS_ERROR 且不挂载', () => {
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    expect(() =>
      renderWidget(container, { name: 'bi-x', props: { bad: cyclic } })
    ).toThrow(/props_serialize_failed/);
    // 序列化失败前元素尚未 appendChild，容器内无残留
    expect(container.children.length).toBe(0);
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
      renderWidget(container, { name: tag })
    ).toThrow('boom');
    // 半挂载元素必须被移除，避免残留破坏节点影响布局
    expect(container.children.length).toBe(0);
  });

  it('props 为非对象（如字符串/数组/null）：跳过不抛错，且不写 config attribute', () => {
    // 防御性：props 应为对象，传入非对象不应崩，仅跳过
    const el1 = renderWidget(container, { name: 'bi-x', props: 'invalid' });
    expect(el1.hasAttribute('config')).toBe(false);

    const el2 = renderWidget(container, { name: 'bi-y', props: null });
    expect(el2.hasAttribute('config')).toBe(false);

    const el3 = renderWidget(container, { name: 'bi-z', props: [1, 2] });
    expect(el3.hasAttribute('config')).toBe(false);
  });

  it('未传 props 时不写任何 props/config attribute', () => {
    const el = renderWidget(container, { name: 'bi-empty' });
    expect(el.hasAttribute('config')).toBe(false);
    expect(el.hasAttribute('title')).toBe(false);
  });
});
