// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock widget-loader：loadWidget/mountWidget/unmountWidget 解析为空，不真正加载资源
// 关键：mock 不影响 checkCycle / propagateAncestors 的执行（它们在调用 loader 前同步执行）
// 路径相对于本测试文件（wc/widget-scope/__tests__/），向上两级到 wc/
vi.mock('../../widget-loader/index.js', () => ({
  defaultLoader: {
    loadWidget: async () => ({ ok: true }),
    mountWidget: async (container) => {
      const el = document.createElement('div');
      container.appendChild(el);
      return el;
    },
    unmountWidget: async () => {}
  },
  // 兼容 mod.default / mod 直接调用的两种取法
  loadWidget: async () => ({ ok: true }),
  mountWidget: async (container) => {
    const el = document.createElement('div');
    container.appendChild(el);
    return el;
  },
  unmountWidget: async () => {}
}));

// mock widget-bus / widget-context / i18n，避免懒加载引入复杂依赖
vi.mock('../../widget-bus/index.js', () => ({
  createBus: () => ({ emit: () => {}, on: () => () => {}, once: () => () => {} }),
  default: { emit: () => {}, on: () => () => {}, once: () => () => {} }
}));
vi.mock('../../widget-context/index.js', () => ({
  get: async () => undefined,
  getContext: async () => ({}),
  onChange: () => () => {},
  onContextChange: () => () => {}
}));
vi.mock('../../i18n/index.js', () => ({
  t: (key) => key
}));

import { createWidgetScope } from '../index.js';

describe('widget-scope 嵌套循环检测', () => {
  beforeEach(() => {
    // pendingAncestors 是模块级 Map，无法直接清空；
    // 通过为每个测试用唯一 widget 名避免跨用例污染
  });

  it('直接自引用抛错，链路含 "A1 -> A1"', async () => {
    const scopeA = createWidgetScope({ name: 'A1' });
    await expect(scopeA.loader.loadWidget({ name: 'A1' })).rejects.toThrow(/试图加载自身/);
    try {
      await scopeA.loader.loadWidget({ name: 'A1' });
    } catch (err) {
      expect(err.message).toContain('A1 -> A1');
    }
  });

  it('祖先链回环 A2→B2→A2 抛错，链路含 "A2 -> B2 -> A2"', async () => {
    const scopeA = createWidgetScope({ name: 'A2' });
    // A 加载 B：触发 propagateAncestors('B2')，写入 pendingAncestors['B2']={A2}
    await scopeA.loader.loadWidget({ name: 'B2' });
    // 创建 B 的 scope，此时 consumePendingAncestors('B2') 取出 {A2}，B 的 ancestorSet={A2}
    const scopeB = createWidgetScope({ name: 'B2' });
    // B 加载 A：A 在 B 的祖先链中，应抛错
    await expect(scopeB.loader.loadWidget({ name: 'A2' })).rejects.toThrow(/试图加载祖先物料/);
    try {
      await scopeB.loader.loadWidget({ name: 'A2' });
    } catch (err) {
      expect(err.message).toContain('A2 -> B2 -> A2');
    }
  });

  it('多级嵌套祖先传播 A3→B3→C3→A3 抛错，链路含 "A3 -> B3 -> C3 -> A3"', async () => {
    const scopeA = createWidgetScope({ name: 'A3' });
    await scopeA.loader.loadWidget({ name: 'B3' }); // pendingAncestors['B3']={A3}
    const scopeB = createWidgetScope({ name: 'B3' }); // B 继承 {A3}
    await scopeB.loader.loadWidget({ name: 'C3' }); // pendingAncestors['C3']={A3,B3}
    const scopeC = createWidgetScope({ name: 'C3' }); // C 继承 {A3,B3}
    await expect(scopeC.loader.loadWidget({ name: 'A3' })).rejects.toThrow(/试图加载祖先物料/);
    try {
      await scopeC.loader.loadWidget({ name: 'A3' });
    } catch (err) {
      expect(err.message).toContain('A3 -> B3 -> C3 -> A3');
    }
  });

  it('无环嵌套不抛错：A4→B4→C4→D4', async () => {
    const scopeA = createWidgetScope({ name: 'A4' });
    await scopeA.loader.loadWidget({ name: 'B4' });
    const scopeB = createWidgetScope({ name: 'B4' });
    await scopeB.loader.loadWidget({ name: 'C4' });
    const scopeC = createWidgetScope({ name: 'C4' });
    // C 加载 D（D 不在祖先链 {A4,B4} 中）
    await expect(scopeC.loader.loadWidget({ name: 'D4' })).resolves.toEqual({ ok: true });
  });

  it('mountWidget 也做循环检测', async () => {
    const scopeA = createWidgetScope({ name: 'A5' });
    await scopeA.loader.mountWidget(document.body, { name: 'B5' });
    const scopeB = createWidgetScope({ name: 'B5' });
    await expect(
      scopeB.loader.mountWidget(document.body, { name: 'A5' })
    ).rejects.toThrow(/试图加载祖先物料/);
  });

  it('loadWidget 缺 name 抛错', async () => {
    const scope = createWidgetScope({ name: 'A6' });
    await expect(scope.loader.loadWidget({})).rejects.toThrow(/widget\.name required/);
    await expect(scope.loader.loadWidget(null)).rejects.toThrow(/widget\.name required/);
  });

  it('mountWidget 缺 name 抛错', async () => {
    const scope = createWidgetScope({ name: 'A7' });
    await expect(scope.loader.mountWidget(document.body, {})).rejects.toThrow(/widget\.name required/);
  });
});
