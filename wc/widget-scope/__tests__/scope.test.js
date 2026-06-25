// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWidgetScope, isWidgetScope } from '../index.js';
import { createBus } from '../../widget-bus/index.js';

// 刷新微任务队列：用 setTimeout(0) 宏任务确保所有 pending 微任务（含 chained .then）执行完毕
const flush = () => new Promise(r => setTimeout(r, 0));

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

  describe('bus.on/once 同步返回 unsubscribe', () => {
    it('on 同步返回函数（非 Promise）', () => {
      const scope = createWidgetScope({ name: 'sync-ret', busInstance: createBus('sync-ret') });
      const off = scope.bus.on('e', () => {});
      expect(typeof off).toBe('function');
      expect(off).not.toBeInstanceOf(Promise);
    });

    it('once 同步返回函数（非 Promise）', () => {
      const scope = createWidgetScope({ name: 'sync-ret-once', busInstance: createBus('sync-ret-once') });
      const off = scope.bus.once('e', () => {});
      expect(typeof off).toBe('function');
      expect(off).not.toBeInstanceOf(Promise);
    });

    it('无 await 即调用 off 不抛错（bus 就绪前取消）', () => {
      const scope = createWidgetScope({ name: 'sync-nothrow', busInstance: createBus('sync-nothrow') });
      const off = scope.bus.on('e', () => {});
      expect(() => off()).not.toThrow();
    });

    it('bus 就绪前调用 off，后续 emit 不触发 cb', async () => {
      const bus = createBus('sync-off-before');
      const scope = createWidgetScope({ name: 'sync-off-before', busInstance: bus });
      const cb = vi.fn();
      const off = scope.bus.on('evt', cb);
      // 在注册微任务执行前同步取消
      off();
      await flush();
      await scope.bus.emit('evt');
      await flush();
      expect(cb).not.toHaveBeenCalled();
    });

    it('注册后再调用 off，后续 emit 不触发 cb', async () => {
      const bus = createBus('sync-off-after');
      const scope = createWidgetScope({ name: 'sync-off-after', busInstance: bus });
      const cb = vi.fn();
      const off = scope.bus.on('evt', cb);
      // 等待注册微任务完成
      await flush();
      off();
      await scope.bus.emit('evt');
      await flush();
      expect(cb).not.toHaveBeenCalled();
    });

    it('正常注册并触发（验证非取消路径仍工作）', async () => {
      const bus = createBus('sync-fire');
      const scope = createWidgetScope({ name: 'sync-fire', busInstance: bus });
      const received = [];
      scope.bus.on('evt', p => received.push(p));
      await flush();
      await scope.bus.emit('evt', 'hello');
      await flush();
      expect(received).toEqual(['hello']);
    });

    it('once 仅触发一次', async () => {
      const bus = createBus('sync-once-fire');
      const scope = createWidgetScope({ name: 'sync-once-fire', busInstance: bus });
      const received = [];
      scope.bus.once('evt', p => received.push(p));
      await flush();
      await scope.bus.emit('evt', 'a');
      await scope.bus.emit('evt', 'b');
      await flush();
      expect(received).toEqual(['a']);
    });

    it('bus.on 同步取消后不影响其他 handler', async () => {
      const bus = createBus('sync-mix');
      const scope = createWidgetScope({ name: 'sync-mix', busInstance: bus });
      const calls = [];
      const h1 = () => calls.push('h1');
      const h2 = () => calls.push('h2');
      const off1 = scope.bus.on('evt', h1);
      scope.bus.on('evt', h2);
      await flush();
      off1();
      await scope.bus.emit('evt');
      await flush();
      expect(calls).toEqual(['h2']);
    });
  });
});
