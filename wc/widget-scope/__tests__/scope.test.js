// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWidgetScope, isWidgetScope } from '../index.js';
import { createBus } from '../../widget-bus/index.js';
import { setContext, getContext } from '../../widget-context/index.js';

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

    it('缺 __noGlobalAccess 但保留 meta 的解构拷贝返回 truthy（N10 修复：身份判据收敛到 meta.__isWidgetScope）', () => {
      // N10 修复：isWidgetScope 不再校验顶层 __noGlobalAccess（能力契约标记，非身份标识）。
      // 物料通过 { meta, context, bus } = scope 解构重建时 __noGlobalAccess 会丢失，
      // 但 meta 仍在，应识别为 widgetScope，避免基座误判。
      expect(isWidgetScope({ meta: { __isWidgetScope: true } })).toBe(true);
    });

    it('meta 缺 __isWidgetScope 标记的对象返回 falsy', () => {
      expect(isWidgetScope({ meta: {} })).toBeFalsy();
      expect(isWidgetScope({ __noGlobalAccess: true })).toBeFalsy();
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

    it('request.removeAllInterceptors 是函数', () => {
      const scope = createWidgetScope({ name: 'w-rm-all' });
      expect(typeof scope.request.removeAllInterceptors).toBe('function');
    });

    it('removeAllInterceptors 批量清除所有拦截器', async () => {
      const scope = createWidgetScope({ name: 'w-rm-all-fire' });
      const calls = [];
      scope.request.addInterceptor(() => calls.push('a'));
      scope.request.addInterceptor(() => calls.push('b'));
      await scope.request('https://example.com');
      expect(calls).toEqual(['a', 'b']);
      scope.request.removeAllInterceptors();
      await scope.request('https://example.com');
      // 清除后拦截器不再触发
      expect(calls).toEqual(['a', 'b']);
    });

    it('removeAllInterceptors 后仍可重新添加拦截器', async () => {
      const scope = createWidgetScope({ name: 'w-rm-all-readd' });
      scope.request.addInterceptor(() => {});
      scope.request.removeAllInterceptors();
      const calls = [];
      scope.request.addInterceptor(() => calls.push('new'));
      await scope.request('https://example.com');
      expect(calls).toEqual(['new']);
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

    it('scope.bus.off 取消已注册的监听器', () => {
      const scope = createWidgetScope({ name: 'bi-test-off' });
      const handler = vi.fn();
      scope.bus.on('test-event', handler);
      scope.bus.emit('test-event', { data: 1 });
      expect(handler).toHaveBeenCalledTimes(1);
      scope.bus.off('test-event', handler);
      scope.bus.emit('test-event', { data: 2 });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('scope.context / scope.t 同步语义（与全局 API 对齐）', () => {
    beforeEach(() => {
      delete window.__wcContext__;
      delete window.widgetBus;
    });

    afterEach(() => {
      delete window.__wcContext__;
      delete window.widgetBus;
    });

    it('scope.context.get(key) 同步返回值（非 Promise）', () => {
      setContext({ user: { id: 42 } });
      const scope = createWidgetScope({ name: 'bi-test-sync' });
      const result = scope.context.get('user');
      expect(result).toEqual({ id: 42 });
      expect(result).not.toBeInstanceOf(Promise);
    });

    it('scope.context.get() 不传 key 同步返回整个上下文快照', () => {
      setContext({ theme: 'dark', lang: 'zh' });
      const scope = createWidgetScope({ name: 'bi-test-sync2' });
      const snap = scope.context.get();
      expect(snap).toEqual({ theme: 'dark', lang: 'zh' });
      expect(snap).not.toBeInstanceOf(Promise);
    });

    it('scope.context.onChange 同步返回取消订阅函数（非 Promise）', () => {
      const scope = createWidgetScope({ name: 'bi-test-sync3' });
      const off = scope.context.onChange('x', () => {});
      expect(typeof off).toBe('function');
      expect(off).not.toBeInstanceOf(Promise);
      off();
    });

    it('scope.t 同步返回翻译（非 Promise）', () => {
      const scope = createWidgetScope({ name: 'bi-test-sync4' });
      const result = scope.t('loader.retry');
      expect(typeof result).toBe('string');
      expect(result).not.toBeInstanceOf(Promise);
    });

    it('scope.context.get 与全局 getContext 返回一致', () => {
      setContext({ user: { id: 99 } });
      const scope = createWidgetScope({ name: 'bi-test-sync5' });
      expect(scope.context.get('user')).toEqual(getContext('user'));
    });
  });

  // R2-7：scope.destroy() 集成测试
  // wrapper disconnectedCallback 调用 scope.destroy() 批量清理 bus 上所有 window 事件监听器，
  // 避免物料卸载后监听器泄漏。物料无需手动清理每个 on() 返回的取消函数。
  describe('scope.destroy（R2-7 批量清理 bus 监听器）', () => {
    beforeEach(() => {
      delete window.__wcContext__;
      delete window.widgetBus;
    });

    afterEach(() => {
      delete window.__wcContext__;
      delete window.widgetBus;
    });

    it('scope.destroy 是函数', () => {
      const scope = createWidgetScope({ name: 'bi-destroy-exists' });
      expect(typeof scope.destroy).toBe('function');
    });

    it('destroy 后 scope.bus 注册的监听器不再触发', () => {
      const scope = createWidgetScope({ name: 'bi-destroy-fire', busInstance: createBus('bi-destroy-fire') });
      const calls = [];
      scope.bus.on('event-a', () => calls.push('a'));
      scope.bus.on('event-b', () => calls.push('b'));
      scope.bus.emit('event-a');
      scope.bus.emit('event-b');
      expect(calls).toEqual(['a', 'b']);
      scope.destroy();
      scope.bus.emit('event-a');
      scope.bus.emit('event-b');
      // destroy 后 bus 监听器已清理，不再触发
      expect(calls).toEqual(['a', 'b']);
    });

    it('destroy 幂等：多次调用不抛错', () => {
      const scope = createWidgetScope({ name: 'bi-destroy-idempotent', busInstance: createBus('bi-destroy-idempotent') });
      scope.bus.on('e', () => {});
      scope.destroy();
      expect(() => scope.destroy()).not.toThrow();
      expect(() => scope.destroy()).not.toThrow();
    });

    it('destroy 一个 scope 不影响其他 scope', () => {
      const busA = createBus('bi-destroy-iso-a');
      const busB = createBus('bi-destroy-iso-b');
      const scopeA = createWidgetScope({ name: 'bi-destroy-iso-a', busInstance: busA });
      const scopeB = createWidgetScope({ name: 'bi-destroy-iso-b', busInstance: busB });
      const bCalls = [];
      scopeB.bus.on('shared', () => bCalls.push('b'));
      scopeA.destroy();
      scopeB.bus.emit('shared');
      // A 的 destroy 不影响 B 的 bus 监听器
      expect(bCalls).toEqual(['b']);
    });

    it('destroy 后 once 注册的监听器也不再触发', () => {
      const scope = createWidgetScope({ name: 'bi-destroy-once', busInstance: createBus('bi-destroy-once') });
      const calls = [];
      scope.bus.once('one', () => calls.push('one'));
      scope.destroy();
      scope.bus.emit('one');
      expect(calls).toEqual([]);
    });

    it('destroy 后 scope 其他能力仍可用（meta/context/t 不受影响）', () => {
      const scope = createWidgetScope({ name: 'bi-destroy-residual', busInstance: createBus('bi-destroy-residual') });
      scope.destroy();
      // destroy 仅清理 bus 监听器，不冻结其他能力
      expect(scope.meta.name).toBe('bi-destroy-residual');
      expect(typeof scope.t).toBe('function');
      expect(() => scope.t('loader.retry')).not.toThrow();
    });
  });

  describe('scope.emit / scope.on / scope.off 快捷方法', () => {
    it('scope.emit/on/off 是函数', () => {
      const scope = createWidgetScope({ name: 'bi-shortcut' });
      expect(typeof scope.emit).toBe('function');
      expect(typeof scope.on).toBe('function');
      expect(typeof scope.off).toBe('function');
    });

    it('scope.emit + scope.on 收发事件（委托到 scope.bus）', () => {
      const scope = createWidgetScope({ name: 'bi-shortcut-fire', busInstance: createBus('bi-shortcut-fire') });
      const received = [];
      scope.on('test-evt', p => received.push(p));
      scope.emit('test-evt', { data: 42 });
      expect(received).toEqual([{ data: 42 }]);
    });

    it('scope.off 取消已注册的监听', () => {
      const scope = createWidgetScope({ name: 'bi-shortcut-off', busInstance: createBus('bi-shortcut-off') });
      const handler = vi.fn();
      scope.on('evt', handler);
      scope.emit('evt');
      expect(handler).toHaveBeenCalledTimes(1);
      scope.off('evt', handler);
      scope.emit('evt');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('scope.on 返回取消订阅函数', () => {
      const scope = createWidgetScope({ name: 'bi-shortcut-unsub', busInstance: createBus('bi-shortcut-unsub') });
      const handler = vi.fn();
      const off = scope.on('evt', handler);
      expect(typeof off).toBe('function');
      off();
      scope.emit('evt');
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
