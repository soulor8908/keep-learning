// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRegistry } from '../index.js';

// 说明：当前 registry 实现 validateWidgets 对缺 name/js 的条目是「抛错」而非兜底，
// 对非数组（对象）格式也是抛错。按 Spec 约束「不改 registry 对外 API 与语义」，
// 本测试验证实际行为（抛错），并在缺失字段用例中注明与 Spec 描述的差异。
describe('wc/widget-registry', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetchOk(data) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data
    });
  }

  describe('数组格式归一化', () => {
    it('合法数组（最小 name+js）原样返回', async () => {
      const data = [{ name: 'bi-a', js: 'https://cdn/a.js' }];
      mockFetchOk(data);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      const widgets = await reg.fetch();
      expect(widgets).toEqual(data);
    });

    it('完整字段（vueVersion/css/config）保留', async () => {
      const data = [{
        name: 'bi-a', vueVersion: '2',
        js: 'a.js', css: 'a.css', config: { title: 'x' }
      }];
      mockFetchOk(data);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      const widgets = await reg.fetch();
      expect(widgets).toEqual(data);
      expect(widgets[0].config).toEqual({ title: 'x' });
    });

    it('多条目数组顺序保留', async () => {
      const data = [
        { name: 'bi-a', js: 'a.js' },
        { name: 'bi-b', js: 'b.js' },
        { name: 'bi-c', js: 'c.js' }
      ];
      mockFetchOk(data);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      const widgets = await reg.fetch();
      expect(widgets.map(w => w.name)).toEqual(['bi-a', 'bi-b', 'bi-c']);
    });
  });

  describe('非数组（对象）格式', () => {
    it('远程返回对象而非数组时抛错（当前实现行为）', async () => {
      // Spec 描述「对象格式原样返回」，但当前实现 validateWidgets 对非数组抛「期望数组」。
      // 按约束不改 registry 语义，此处验证实际抛错行为。
      mockFetchOk({ widgets: [{ name: 'bi-a', js: 'a.js' }] });
      const reg = createRegistry({ url: 'https://r/registry.json' });
      await expect(reg.fetch()).rejects.toThrow(/期望数组|加载注册表失败/);
    });
  });

  describe('缺 name/js 字段', () => {
    it('缺 name 抛错（当前实现行为，非兜底）', async () => {
      // Spec 描述「兜底不抛错」，但当前实现抛错。按约束不改语义，验证实际行为。
      const reg = createRegistry({ fallback: [{ js: 'a.js' }] });
      await expect(reg.fetch()).rejects.toThrow(/缺少 name 或 js/);
    });

    it('缺 js 抛错（当前实现行为，非兜底）', async () => {
      const reg = createRegistry({ fallback: [{ name: 'bi-a' }] });
      await expect(reg.fetch()).rejects.toThrow(/缺少 name 或 js/);
    });

    it('远程条目缺 js 时最终抛「无兜底」错误', async () => {
      mockFetchOk([{ name: 'bi-a' }]);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      await expect(reg.fetch()).rejects.toThrow(/加载注册表失败|缺少 name 或 js/);
    });
  });

  describe('远程拉取（mock fetch）', () => {
    it('fetch 被以正确 URL + Accept 头调用', async () => {
      mockFetchOk([{ name: 'bi-a', js: 'a.js' }]);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      await reg.fetch();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, opts] = globalThis.fetch.mock.calls[0];
      expect(calledUrl).toBe('https://r/registry.json');
      expect(opts.headers.Accept).toBe('application/json');
    });

    it('url 支持函数形式（接收 env）', async () => {
      mockFetchOk([{ name: 'bi-a', js: 'a.js' }]);
      const urlFn = vi.fn((env) => `https://r/${env.mode}/registry.json`);
      const reg = createRegistry({ url: urlFn, env: { mode: 'prod' } });
      await reg.fetch();
      expect(urlFn).toHaveBeenCalledWith({ mode: 'prod' });
      expect(globalThis.fetch.mock.calls[0][0]).toBe('https://r/prod/registry.json');
    });

    it('远程失败 + 有 fallback 时回退兜底清单', async () => {
      const errSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
      const fallback = [{ name: 'bi-fb', js: 'fb.js' }];
      const reg = createRegistry({ url: 'https://r/registry.json', fallback });
      const widgets = await reg.fetch();
      expect(widgets).toEqual(fallback);
      errSpy.mockRestore();
    });

    it('远程失败 + 无 fallback 时抛错', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
      const reg = createRegistry({ url: 'https://r/registry.json' });
      await expect(reg.fetch()).rejects.toThrow(/加载注册表失败且无兜底数据/);
    });

    it('HTTP 非 200 视为失败走兜底链', async () => {
      const errSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const fallback = [{ name: 'bi-fb', js: 'fb.js' }];
      const reg = createRegistry({ url: 'https://r/registry.json', fallback });
      const widgets = await reg.fetch();
      expect(widgets).toEqual(fallback);
      errSpy.mockRestore();
    });
  });

  describe('内存缓存与去重', () => {
    it('第二次 fetch 命中内存缓存，不再发请求', async () => {
      mockFetchOk([{ name: 'bi-a', js: 'a.js' }]);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      await reg.fetch();
      await reg.fetch();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('force=true 强制刷新，重新发请求', async () => {
      mockFetchOk([{ name: 'bi-a', js: 'a.js' }]);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      await reg.fetch();
      await reg.fetch(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('clearCache 清除内存缓存后下次 fetch 重新拉取', async () => {
      mockFetchOk([{ name: 'bi-a', js: 'a.js' }]);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      await reg.fetch();
      reg.clearCache();
      await reg.fetch();
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('find 按名查找', () => {
    it('命中返回对应条目', async () => {
      mockFetchOk([
        { name: 'bi-a', js: 'a.js' },
        { name: 'bi-b', js: 'b.js' }
      ]);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      const w = await reg.find('bi-b');
      expect(w).toEqual({ name: 'bi-b', js: 'b.js' });
    });

    it('未命中返回 null', async () => {
      mockFetchOk([{ name: 'bi-a', js: 'a.js' }]);
      const reg = createRegistry({ url: 'https://r/registry.json' });
      const w = await reg.find('bi-missing');
      expect(w).toBeNull();
    });
  });

  describe('无 URL 模式', () => {
    it('无 url 时直接使用 fallback（不发请求）', async () => {
      const fallback = [{ name: 'bi-fb', js: 'fb.js' }];
      const reg = createRegistry({ fallback });
      globalThis.fetch = vi.fn();
      const widgets = await reg.fetch();
      expect(widgets).toEqual(fallback);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
