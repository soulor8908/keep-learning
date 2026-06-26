// @vitest-environment happy-dom
// 扁平化 props 协议测试：widgetMount(meta, container, props) 第三参为 props，
// 合并进 widgetObj（{ ...fullMeta, props }）传给 loadWidget/mountWidget；
// 不再 setAttribute('config')，由 renderWidget 按声明类型序列化为独立 attribute。
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
    it('widgetMount 调用 loader.loadWidget + mountWidget，props 合并进 widgetObj', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js', css: 'https://cdn/x.css', vueVersion: '2' };
      const container = document.createElement('div');
      const element = document.createElement('bi-x');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      await widgetMount(meta, container, { title: 'hello' });

      // 扁平化 props 协议：props 合并进 widgetObj 传给 loadWidget/mountWidget
      const expectedWidgetObj = { ...meta, props: { title: 'hello' } };
      expect(mocks.mockLoader.loadWidget).toHaveBeenCalledWith(expectedWidgetObj);
      expect(mocks.mockLoader.mountWidget).toHaveBeenCalledWith(container, expectedWidgetObj);
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

  describe('T3.4c props 合并进 widgetObj（扁平化 props 协议）', () => {
    it('props 为对象 → 合并进 widgetObj，loadWidget 收到含 props 字段的对象', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      mocks.mockLoader.mountWidget.mockResolvedValue(document.createElement('bi-x'));

      await widgetMount(meta, container, { title: '销售面板', count: 42 });

      // 扁平化 props 协议：props 作为字段合并进 widgetObj，由 renderWidget
      // 按声明类型序列化为独立 kebab-case attribute（不再 setAttribute('config')）
      expect(mocks.mockLoader.loadWidget).toHaveBeenCalledWith({
        ...meta,
        props: { title: '销售面板', count: 42 }
      });
    });

    it('props 为 null → widgetObj 不含 props 字段', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      mocks.mockLoader.mountWidget.mockResolvedValue(document.createElement('bi-x'));

      await widgetMount(meta, container, null);

      expect(mocks.mockLoader.loadWidget).toHaveBeenCalledWith(meta);
      // widgetObj 不含 props 字段
      const widgetObjArg = mocks.mockLoader.loadWidget.mock.calls[0][0];
      expect(widgetObjArg).not.toHaveProperty('props');
    });

    it('props 为 undefined → widgetObj 不含 props 字段', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      mocks.mockLoader.mountWidget.mockResolvedValue(document.createElement('bi-x'));

      await widgetMount(meta, container, undefined);

      const widgetObjArg = mocks.mockLoader.loadWidget.mock.calls[0][0];
      expect(widgetObjArg).not.toHaveProperty('props');
    });

    it('props 含循环引用 → 不在 runtime 序列化（由 renderWidget 抛 PROPS_ERROR）', async () => {
      // 扁平化 props 协议：runtime 仅合并 props 引用进 widgetObj，不做 JSON.stringify；
      // 序列化发生在 renderWidget 内部，循环引用由其抛 PROPS_ERROR。
      // 这里验证 runtime 不抛错（透传 props 引用）。
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      mocks.mockLoader.mountWidget.mockResolvedValue(document.createElement('bi-x'));

      const cyclic = { a: 1 };
      cyclic.self = cyclic;

      // runtime 不序列化，不应抛错
      await expect(widgetMount(meta, container, cyclic)).resolves.toBeTruthy();
      // widgetObj 的 props 字段直接持有循环引用对象
      const widgetObjArg = mocks.mockLoader.loadWidget.mock.calls[0][0];
      expect(widgetObjArg.props).toBe(cyclic);
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

    it('通过 default 导出调用 widgetMount 也能正常工作，props 合并进 widgetObj', async () => {
      const meta = { name: 'bi-x', js: 'https://cdn/x.js' };
      const container = document.createElement('div');
      const element = document.createElement('bi-x');
      mocks.mockLoader.mountWidget.mockResolvedValue(element);

      const result = await defaultExport(meta, container, { ok: true });
      expect(result).toBe(element);
      // 扁平化 props 协议：props 合并进 widgetObj（不再 setAttribute('config')）
      expect(mocks.mockLoader.loadWidget).toHaveBeenCalledWith({ ...meta, props: { ok: true } });
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
