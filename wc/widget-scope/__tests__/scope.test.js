// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWidgetScope, isWidgetScope } from '../index.js';
import { setContext, getContext } from '../../widget-context/index.js';
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

  // scope.context / scope.t 同步语义：与全局 getContext/t() 对齐，
  // 消除"同一套上下文/文案两套异步语义"的心智负担。
  // 旧实现因懒加载 widget-context/i18n，scope.context.get/t 返回 Promise，
  // docstring 示例也因 async 写错。同步化后 scope API 与全局 API 语义一致。
  describe('scope.context / scope.t 同步语义（与全局 API 对齐）', () => {
    // clearContext() 不传 key 不会清空所有数据（只 delete store.data[undefined]），
    // 故直接删除 window.__wcContext__ 重建 store，确保各用例上下文互不污染
    beforeEach(() => { delete window.__wcContext__; delete window.widgetBus; });
    afterEach(() => { delete window.__wcContext__; delete window.widgetBus; });

    it('scope.context.get(key) 同步返回值（非 Promise）', () => {
      setContext({ user: { id: 42 } });
      const scope = createWidgetScope({ name: 'sync-ctx' });
      const result = scope.context.get('user');
      expect(result).toEqual({ id: 42 });
      expect(result).not.toBeInstanceOf(Promise);
    });

    it('scope.context.get() 不传 key 同步返回整个上下文快照', () => {
      setContext({ theme: 'dark', lang: 'zh' });
      const scope = createWidgetScope({ name: 'sync-ctx2' });
      const snap = scope.context.get();
      expect(snap).toEqual({ theme: 'dark', lang: 'zh' });
      expect(snap).not.toBeInstanceOf(Promise);
    });

    it('scope.context.onChange 同步返回取消订阅函数（非 Promise）', () => {
      const scope = createWidgetScope({ name: 'sync-ctx3' });
      const off = scope.context.onChange('x', () => {});
      expect(typeof off).toBe('function');
      expect(off).not.toBeInstanceOf(Promise);
      off();
    });

    it('scope.t 同步返回翻译（非 Promise）', () => {
      const scope = createWidgetScope({ name: 'sync-t' });
      const result = scope.t('hello.world');
      // i18n 默认无 hello.world 翻译，返回 key 本身
      expect(typeof result).toBe('string');
      expect(result).not.toBeInstanceOf(Promise);
    });

    it('scope.context.get 与全局 getContext 返回一致', () => {
      setContext({ foo: 'bar' });
      const scope = createWidgetScope({ name: 'sync-consistency' });
      expect(scope.context.get('foo')).toBe(getContext('foo'));
    });

    it('scope.context.onChange 收到 setContext 触发的变更', () => {
      const scope = createWidgetScope({ name: 'sync-change' });
      const calls = [];
      const off = scope.context.onChange('cnt', v => calls.push(v));
      setContext({ cnt: 1 });
      setContext({ cnt: 2 });
      off();
      setContext({ cnt: 3 });
      expect(calls).toEqual([1, 2]);
    });
  });
});
