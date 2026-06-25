// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWidgetScope, isWidgetScope } from '../index.js';

describe('widget-scope 基础', () => {
  describe('createWidgetScope 必填校验', () => {
    it('缺 name 抛错', () => {
      expect(() => createWidgetScope({})).toThrow(/opts\.name is required/);
    });

    it('name 为空字符串抛错', () => {
      expect(() => createWidgetScope({ name: '' })).toThrow(/opts\.name is required/);
    });
  });

  describe('meta 冻结', () => {
    it('meta 被 Object.freeze', () => {
      const scope = createWidgetScope({ name: 'w' });
      expect(Object.isFrozen(scope.meta)).toBe(true);
    });

    it('meta.name/version/host 只读', () => {
      const scope = createWidgetScope({ name: 'w', version: '1.0.0', host: 'h' });
      expect(() => { scope.meta.name = 'x'; }).toThrow();
      expect(scope.meta.name).toBe('w');
    });

    it('meta.__isWidgetScope === true', () => {
      const scope = createWidgetScope({ name: 'w' });
      expect(scope.meta.__isWidgetScope).toBe(true);
    });
  });

  describe('scope 冻结', () => {
    it('scope 对象被冻结', () => {
      const scope = createWidgetScope({ name: 'w' });
      expect(Object.isFrozen(scope)).toBe(true);
    });

    it('不能新增属性', () => {
      const scope = createWidgetScope({ name: 'w' });
      expect(() => { scope.newProp = 1; }).toThrow();
    });

    it('__noGlobalAccess === true', () => {
      const scope = createWidgetScope({ name: 'w' });
      expect(scope.__noGlobalAccess).toBe(true);
    });
  });

  describe('isWidgetScope', () => {
    // 注意：源码实现为 `obj && obj.meta && ...` 短路求值，
    // 对 falsy 输入返回输入值本身（null/undefined）或 undefined（对象缺字段），
    // 而非严格 false。此处用 toBeFalsy 匹配实际行为（按 Spec Non-Goals 不改源码）。
    it('正确识别 scope 实例', () => {
      const scope = createWidgetScope({ name: 'w' });
      expect(isWidgetScope(scope)).toBe(true);
    });

    it('普通对象返回 falsy', () => {
      expect(isWidgetScope({})).toBeFalsy();
    });

    it('null 返回 falsy', () => {
      expect(isWidgetScope(null)).toBeFalsy();
    });

    it('undefined 返回 falsy', () => {
      expect(isWidgetScope(undefined)).toBeFalsy();
    });

    it('缺 __noGlobalAccess 的对象返回 falsy', () => {
      expect(isWidgetScope({ meta: { __isWidgetScope: true } })).toBeFalsy();
    });
  });

  describe('log 前缀', () => {
    it('info 带 [name] 前缀', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const scope = createWidgetScope({ name: 'bi-test' });
      scope.log.info('hello');
      expect(logSpy).toHaveBeenCalledWith('[bi-test]', 'hello');
      logSpy.mockRestore();
    });

    it('warn 带 [name] 前缀', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const scope = createWidgetScope({ name: 'bi-test' });
      scope.log.warn('careful');
      expect(warnSpy).toHaveBeenCalledWith('[bi-test]', 'careful');
      warnSpy.mockRestore();
    });

    it('error 带 [name] 前缀', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const scope = createWidgetScope({ name: 'bi-test' });
      scope.log.error('oops');
      expect(errSpy).toHaveBeenCalledWith('[bi-test]', 'oops');
      errSpy.mockRestore();
    });
  });

  describe('request 受控 fetch', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    });

    afterEach(() => {
      delete globalThis.fetch;
    });

    it('调用 globalThis.fetch', async () => {
      const scope = createWidgetScope({ name: 'w' });
      await scope.request('https://example.com');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('拦截器能注入 headers', async () => {
      const scope = createWidgetScope({ name: 'w' });
      scope.request.addInterceptor((opts) => {
        opts.headers.Authorization = 'Bearer token-123';
      });
      await scope.request('https://example.com');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token-123' })
        })
      );
    });

    it('拦截器抛错不阻断请求', async () => {
      const scope = createWidgetScope({ name: 'w' });
      scope.request.addInterceptor(() => { throw new Error('interceptor fail'); });
      await scope.request('https://example.com');
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('拦截器返回取消函数可移除自身', async () => {
      const scope = createWidgetScope({ name: 'w' });
      let calls = 0;
      const remove = scope.request.addInterceptor(() => { calls++; });
      await scope.request('https://example.com');
      expect(calls).toBe(1);
      remove();
      await scope.request('https://example.com');
      expect(calls).toBe(1);
    });

    it('fetch 不存在时抛错', async () => {
      delete globalThis.fetch;
      const scope = createWidgetScope({ name: 'w' });
      await expect(scope.request('https://example.com')).rejects.toThrow(/fetch is not available/);
    });
  });
});
