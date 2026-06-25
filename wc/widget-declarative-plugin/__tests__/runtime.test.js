// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 用 vi.hoisted 创建稳定的 mock 对象引用（vi.mock 工厂在顶层执行，
 * 不能引用普通变量，必须用 hoisted）。runtime.js 内部缓存了
 * loaderModulePromise / registryModulePromise，由于 mock 对象引用稳定，
 * 在 beforeEach 中重置 mock 函数实现即可让缓存 promise 拿到最新行为。
 */
const mocks = vi.hoisted(() => {
  const mockLoader = {
    loadWidget: vi.fn(),
    mountWidget: vi.fn()
  };
  const mockRegistry = {
    find: vi.fn()
  };
  return { mockLoader, mockRegistry };
});

vi.mock('../../widget-loader/index.js', () => ({
  defaultLoader: mocks.mockLoader
}));

vi.mock('../../widget-registry/index.js', () => ({
  defaultRegistry: mocks.mockRegistry
}));

import { widgetMount, default as defaultExport } from '../runtime.js';

describe('widget-declarative-plugin runtime widgetMount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认实现：loadWidget/mountWidget 成功；registry.find 返回含 js 的 meta
    mocks.mockLoader.loadWidget.mockResolvedValue(undefined);
    mocks.mockLoader.mountWidget.mockResolvedValue(null);
    mocks.mockRegistry.find.mockResolvedValue({ name: 'bi-remote', js: 'https://remote.js', vueVersion: '3' });
  });

  describe('T3.4a 构建期内联 meta（meta.js 存在）', () => {
    it('widgetMount 调用 loader.loadWidget + mountWidget', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js', css: 'https://cdn/x.css', vueVersion: '2' };
      const container = document.createElement('div');
      const element = document.createElement('bi-x');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      await widgetMount(meta, container, { title: 'hello' });

      expect(mocks.mockLoader.loadWidget).toHaveBeenCalledWith(meta);
      expect(mocks.mockLoader.mountWidget).toHaveBeenCalledWith(container, meta);
    });

    it('不触发 registry 远程解析（meta.js 已内联）', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      mocks.mockLoader.mountWidget.mockResolvedValue(document.createElement('bi-x'));

      await widgetMount(meta, container);

      expect(mocks.mockRegistry.find).not.toHaveBeenCalled();
    });
  });

  describe('T3.4b container 行为', () => {
    it('传入 container → 直接挂载到该元素，返回 mountWidget 的 element', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      container.id = 'host';
      const element = document.createElement('bi-x');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      const result = await widgetMount(meta, container);
      expect(result).toBe(element); // 返回 element（非 container）
    });

    it('container 为 null → 自动创建 div.widget-host，返回该 host', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const element = document.createElement('bi-x');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      const result = await widgetMount(meta, null);
      expect(result).toBeTruthy();
      expect(result.tagName).toBe('DIV');
      expect(result.className).toBe('widget-host');
    });

    it('container 为 undefined → 同样自动创建 div.widget-host', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      mocks.mockLoader.mountWidget.mockResolvedValue(document.createElement('bi-x'));

      const result = await widgetMount(meta, undefined);
      expect(result.className).toBe('widget-host');
    });

    it('自动创建的 host 传给 mountWidget 作为挂载点', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      mocks.mockLoader.mountWidget.mockResolvedValue(document.createElement('bi-x'));

      await widgetMount(meta, null);
      const hostArg = mocks.mockLoader.mountWidget.mock.calls[0][0];
      expect(hostArg.tagName).toBe('DIV');
      expect(hostArg.className).toBe('widget-host');
    });
  });

  describe('T3.4c config 写入 element', () => {
    it('config 为对象 → JSON.stringify 后写入 element.setAttribute("config", ...)', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      const element = document.createElement('bi-x');
      const setAttrSpy = vi.spyOn(element, 'setAttribute');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      await widgetMount(meta, container, { title: '销售面板', count: 42 });

      expect(setAttrSpy).toHaveBeenCalledWith('config', JSON.stringify({ title: '销售面板', count: 42 }));
    });

    it('config 为字符串 → 直接写入（不 JSON.stringify）', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      const element = document.createElement('bi-x');
      const setAttrSpy = vi.spyOn(element, 'setAttribute');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      await widgetMount(meta, container, '{"title":"raw"}');

      expect(setAttrSpy).toHaveBeenCalledWith('config', '{"title":"raw"}');
    });

    it('config 为 null → 不调用 setAttribute', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      const element = document.createElement('bi-x');
      const setAttrSpy = vi.spyOn(element, 'setAttribute');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      await widgetMount(meta, container, null);
      expect(setAttrSpy).not.toHaveBeenCalled();
    });

    it('config 为 undefined → 不调用 setAttribute', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      const element = document.createElement('bi-x');
      const setAttrSpy = vi.spyOn(element, 'setAttribute');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      await widgetMount(meta, container, undefined);
      expect(setAttrSpy).not.toHaveBeenCalled();
    });

    it('config 序列化失败（循环引用）→ 告警但不抛错', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      const element = document.createElement('bi-x');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // 构造循环引用对象
      const cyclic = { a: 1 };
      cyclic.self = cyclic;

      // 不应抛错
      await expect(widgetMount(meta, container, cyclic)).resolves.toBe(element);
      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(warnMsg).toContain('config 序列化失败');
      warnSpy.mockRestore();
    });
  });

  describe('T3.4d 仅 name（远程 registry 解析）', () => {
    it('meta 仅含 name → 调用 registry.find 拿到完整 meta 后再加载', async () => {
      const meta = { name: 'bi-remote' };
      const container = document.createElement('div');
      const element = document.createElement('bi-remote');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);
      mocks.mockRegistry.find.mockResolvedValue({ name: 'bi-remote', js: 'https://remote.js', vueVersion: '3' });

      await widgetMount(meta, container);

      expect(mocks.mockRegistry.find).toHaveBeenCalledWith('bi-remote');
      // loadWidget 收到的是 registry 返回的完整 meta（含 js）
      expect(mocks.mockLoader.loadWidget).toHaveBeenCalledWith({
        name: 'bi-remote',
        js: 'https://remote.js',
        vueVersion: '3'
      });
    });

    it('registry.find 返回 null → 抛错"未找到物料"', async () => {
      const meta = { name: 'bi-missing' };
      mocks.mockRegistry.find.mockResolvedValue(null);

      await expect(widgetMount(meta, null)).rejects.toThrow('未找到物料 bi-missing');
    });
  });

  describe('T3.4e 异常输入', () => {
    it('meta 为 null → 抛错 "meta.name is required"', async () => {
      await expect(widgetMount(null, null)).rejects.toThrow('meta.name is required');
    });

    it('meta 为 undefined → 抛错 "meta.name is required"', async () => {
      await expect(widgetMount(undefined, null)).rejects.toThrow('meta.name is required');
    });

    it('meta 为空对象 {} → 抛错 "meta.name is required"', async () => {
      await expect(widgetMount({}, null)).rejects.toThrow('meta.name is required');
    });
  });

  describe('T3.4f 默认导出', () => {
    it('default 导出与 widgetMount 是同一函数', () => {
      expect(defaultExport).toBe(widgetMount);
    });

    it('通过 default 导出调用 widgetMount 也能正常工作', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      const element = document.createElement('bi-x');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      const result = await defaultExport(meta, container, { ok: true });
      expect(result).toBe(element);
      expect(element.getAttribute('config')).toBe(JSON.stringify({ ok: true }));
    });
  });

  describe('T3.4g loadWidget / mountWidget 异常透传', () => {
    it('loadWidget 抛错 → widgetMount 透传该错误', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/broken.js' };
      const container = document.createElement('div');
      mocks.mockLoader.loadWidget.mockRejectedValue(new Error('load failed'));

      await expect(widgetMount(meta, container)).rejects.toThrow('load failed');
    });

    it('mountWidget 抛错 → widgetMount 透传该错误', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      mocks.mockLoader.mountWidget.mockRejectedValue(new Error('mount failed'));

      await expect(widgetMount(meta, container)).rejects.toThrow('mount failed');
    });
  });
});
