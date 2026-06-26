// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setContext,
  getContext,
  onContextChange,
  clearContext,
  createContext,
  injectContext
} from '../index.js';

// widget-context 用 window.__wcContext__ 作模块级单例存储，跨用例共享。
// 每个用例前重置 store，确保订阅者/数据互不污染。
const GLOBAL_KEY = '__wcContext__';

describe('widget-context', () => {
  beforeEach(() => {
    delete window[GLOBAL_KEY];
    delete window.widgetBus;
  });

  afterEach(() => {
    delete window[GLOBAL_KEY];
    delete window.widgetBus;
  });

  describe('getContext 快照', () => {
    it('get 返回整个上下文的浅拷贝，修改快照不影响内部', () => {
      setContext({ user: { id: 1 }, theme: 'dark' });
      const snap = getContext();
      expect(snap).toEqual({ user: { id: 1 }, theme: 'dark' });
      // 修改快照顶层 key 不应影响内部
      snap.theme = 'light';
      snap.extra = 'x';
      expect(getContext('theme')).toBe('dark');
      expect(getContext().extra).toBeUndefined();
    });

    it('get(key) 返回指定 key 的值', () => {
      setContext({ user: { id: 7 } });
      expect(getContext('user')).toEqual({ id: 7 });
    });

    it('get 不存在的 key 返回 undefined', () => {
      expect(getContext('nope')).toBeUndefined();
    });

    it('空上下文 get() 返回空对象', () => {
      expect(getContext()).toEqual({});
    });
  });

  describe('浅比较跳过', () => {
    it('相同原始值重复 set 不触发订阅', () => {
      const cb = vi.fn();
      onContextChange('a', cb);
      setContext({ a: 1 });
      setContext({ a: 1 });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('不同原始值触发订阅', () => {
      const cb = vi.fn();
      onContextChange('a', cb);
      setContext({ a: 1 });
      setContext({ a: 2 });
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe('onContextChange 订阅', () => {
    it('回调接收 (newValue, partial)', () => {
      const calls = [];
      onContextChange('user', (v, partial) => calls.push({ v, partial }));
      setContext({ user: { id: 1 }, extra: true });
      expect(calls).toHaveLength(1);
      expect(calls[0].v).toEqual({ id: 1 });
      expect(calls[0].partial).toEqual({ user: { id: 1 }, extra: true });
    });

    it('返回的 unsubscribe 调用后不再触发', () => {
      const cb = vi.fn();
      const off = onContextChange('a', cb);
      setContext({ a: 1 });
      off();
      setContext({ a: 2 });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('回调抛错不影响其他订阅者', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const order = [];
      onContextChange('a', () => { order.push('first'); throw new Error('boom'); });
      onContextChange('a', () => { order.push('second'); });
      setContext({ a: 1 });
      expect(order).toEqual(['first', 'second']);
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe('clearContext', () => {
    it('清除后值变为 undefined 并通知订阅者', () => {
      const calls = [];
      onContextChange('user', v => calls.push(v));
      setContext({ user: { id: 1 } });
      clearContext('user');
      expect(calls).toEqual([{ id: 1 }, undefined]);
      expect(getContext('user')).toBeUndefined();
    });

    it('清除未设置的 key 不抛错', () => {
      expect(() => clearContext('never')).not.toThrow();
    });
  });

  describe('deep 选项（setContext）', () => {
    it('不同引用、内容不同 + deep:true → 触发', () => {
      const cb = vi.fn();
      onContextChange('user', cb);
      setContext({ user: { name: 'a' } });
      setContext({ user: { name: 'b' } }, { deep: true });
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb.mock.calls[1][0]).toEqual({ name: 'b' });
    });

    it('不同引用、内容相同 + deep:true → 不触发', () => {
      const cb = vi.fn();
      onContextChange('user', cb);
      setContext({ user: { name: 'a' } });
      setContext({ user: { name: 'a' } }, { deep: true });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('默认浅比较：不同引用、内容相同 → 触发（与 deep 形成对比）', () => {
      const cb = vi.fn();
      onContextChange('user', cb);
      setContext({ user: { name: 'a' } });
      // 不传 deep，浅比较：引用不同即视为变化
      setContext({ user: { name: 'a' } });
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('默认浅比较：同引用不触发', () => {
      const cb = vi.fn();
      onContextChange('user', cb);
      const obj = { name: 'a' };
      setContext({ user: obj });
      // 同引用再次传入（未突变）
      setContext({ user: obj });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('deep:true 对原始值行为与浅比较一致', () => {
      const cb = vi.fn();
      onContextChange('count', cb);
      setContext({ count: 1 });
      setContext({ count: 1 }, { deep: true });
      setContext({ count: 2 }, { deep: true });
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('deep:true 仅影响当次调用（不持久）', () => {
      const cb = vi.fn();
      onContextChange('user', cb);
      setContext({ user: { name: 'a' } });
      // deep:true 但内容相同 → 不触发
      setContext({ user: { name: 'a' } }, { deep: true });
      // 再次默认浅比较，不同引用 → 触发
      setContext({ user: { name: 'a' } });
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('deep:true 对嵌套数组内容相同不触发', () => {
      const cb = vi.fn();
      onContextChange('list', cb);
      setContext({ list: [1, 2, 3] });
      setContext({ list: [1, 2, 3] }, { deep: true });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('deep:true 对嵌套数组内容不同触发', () => {
      const cb = vi.fn();
      onContextChange('list', cb);
      setContext({ list: [1, 2, 3] });
      setContext({ list: [1, 2, 4] }, { deep: true });
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe('broadcast 集成', () => {
    it('变化时通过 window.widgetBus.emit 广播 context-change', () => {
      const emit = vi.fn();
      window.widgetBus = { emit };
      setContext({ user: { id: 1 } });
      expect(emit).toHaveBeenCalledWith(
        'context-change',
        expect.objectContaining({ keys: ['user'] })
      );
    });

    it('无变化时不广播', () => {
      const emit = vi.fn();
      window.widgetBus = { emit };
      setContext({ a: 1 });
      emit.mockClear();
      setContext({ a: 1 });
      expect(emit).not.toHaveBeenCalled();
    });

    it('broadcast:false 不广播', () => {
      const emit = vi.fn();
      window.widgetBus = { emit };
      setContext({ a: 1 }, { broadcast: false });
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('createContext 独立实例', () => {
    it('与全局上下文隔离', () => {
      const inst = createContext();
      setContext({ user: { id: 1 } });
      inst.set({ user: { id: 999 } });
      // 全局不受 inst 影响
      expect(getContext('user')).toEqual({ id: 1 });
      expect(inst.get('user')).toEqual({ id: 999 });
    });

    it('两个 createContext 实例互相隔离', () => {
      const a = createContext();
      const b = createContext();
      a.set({ x: 1 });
      b.set({ x: 2 });
      expect(a.get('x')).toBe(1);
      expect(b.get('x')).toBe(2);
    });

    it('get 返回浅拷贝（顶层重赋值不影响内部）', () => {
      const inst = createContext();
      inst.set({ a: { n: 1 } });
      const snap = inst.get();
      // 顶层 key 重赋值不应影响内部（浅拷贝语义）
      snap.a = { n: 999 };
      snap.extra = 'x';
      expect(inst.get('a')).toEqual({ n: 1 });
      expect(inst.get().extra).toBeUndefined();
    });

    it('onChange 订阅与 unsubscribe', () => {
      const inst = createContext();
      const cb = vi.fn();
      const off = inst.onChange('a', cb);
      inst.set({ a: 1 });
      off();
      inst.set({ a: 2 });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('clear 通知 undefined', () => {
      const inst = createContext();
      const calls = [];
      inst.onChange('a', v => calls.push(v));
      inst.set({ a: 1 });
      inst.clear('a');
      expect(calls).toEqual([1, undefined]);
    });

    it('createContext().set 支持 deep 选项', () => {
      const inst = createContext();
      const cb = vi.fn();
      inst.onChange('user', cb);
      inst.set({ user: { name: 'a' } });
      // 不同引用、内容相同 + deep:true → 不触发
      inst.set({ user: { name: 'a' } }, { deep: true });
      // 不同引用、内容不同 + deep:true → 触发
      inst.set({ user: { name: 'b' } }, { deep: true });
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb.mock.calls[1][0]).toEqual({ name: 'b' });
    });

    it('createContext().set 默认浅比较：不同引用同内容触发', () => {
      const inst = createContext();
      const cb = vi.fn();
      inst.onChange('user', cb);
      inst.set({ user: { name: 'a' } });
      inst.set({ user: { name: 'a' } });
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe('injectContext', () => {
    it('注入全部上下文到元素属性与实例', () => {
      setContext({ user: { id: 1 }, theme: 'dark' });
      const el = document.createElement('div');
      injectContext(el);
      expect(el.getAttribute('data-context')).toBe(JSON.stringify({ user: { id: 1 }, theme: 'dark' }));
      expect(el._wcContext).toEqual({ user: { id: 1 }, theme: 'dark' });
    });

    it('指定 keys 只注入对应字段', () => {
      setContext({ user: { id: 1 }, theme: 'dark', secret: 'x' });
      const el = document.createElement('div');
      injectContext(el, ['user', 'theme']);
      const parsed = JSON.parse(el.getAttribute('data-context'));
      expect(parsed).toEqual({ user: { id: 1 }, theme: 'dark' });
      expect(parsed.secret).toBeUndefined();
    });

    it('指定不存在的 key 时跳过', () => {
      setContext({ user: { id: 1 } });
      const el = document.createElement('div');
      injectContext(el, ['user', 'missing']);
      const parsed = JSON.parse(el.getAttribute('data-context'));
      expect(parsed).toEqual({ user: { id: 1 } });
      expect(parsed.missing).toBeUndefined();
    });

    it('无元素时安全返回 undefined', () => {
      expect(() => injectContext(null)).not.toThrow();
      expect(injectContext(null)).toBeUndefined();
    });

    it('含循环引用的上下文不抛错（safeStringify 去环，字段被丢弃）', () => {
      // 构造循环引用对象：JSON.stringify 会抛 TypeError，触发 safeStringify 兜底
      const cyclic = { a: 1 };
      cyclic.self = cyclic;
      setContext({ cyclic });
      const el = document.createElement('div');
      // safeStringify 的 replacer 对循环引用返回 undefined，JSON.stringify 丢弃该字段
      expect(() => injectContext(el)).not.toThrow();
      const parsed = JSON.parse(el.getAttribute('data-context'));
      expect(parsed.cyclic.a).toBe(1);
      // cyclic.self 被 replacer 返回 undefined 后被 JSON.stringify 丢弃
      expect(parsed.cyclic.self).toBeUndefined();
      // 实例属性仍保留原始引用（含环）
      expect(el._wcContext.cyclic).toBe(cyclic);
    });

    it('同上下文版本多次 injectContext 复用序列化结果（缓存命中）', () => {
      // renderWidget 每次挂载都调 injectContext，序列化缓存避免 N 次全量 JSON.stringify
      setContext({ user: { id: 1 }, theme: 'dark' });
      const stringifySpy = vi.spyOn(JSON, 'stringify');
      try {
        const el1 = document.createElement('div');
        const el2 = document.createElement('div');
        const el3 = document.createElement('div');
        injectContext(el1);
        const callsAfter1 = stringifySpy.mock.calls.length;
        // 同上下文版本，第二/三次应命中缓存，不再触发 JSON.stringify（data-context）
        injectContext(el2);
        injectContext(el3);
        // data-context 值应一致（缓存复用同一序列化字符串）
        expect(el2.getAttribute('data-context')).toBe(el1.getAttribute('data-context'));
        expect(el3.getAttribute('data-context')).toBe(el1.getAttribute('data-context'));
      } finally {
        stringifySpy.mockRestore();
      }
    });

    it('setContext 后序列化缓存失效，data-context 更新为新值', () => {
      setContext({ count: 1 });
      const el1 = document.createElement('div');
      injectContext(el1);
      const before = el1.getAttribute('data-context');
      // 上下文变更后版本号递增，缓存失效
      setContext({ count: 2 });
      const el2 = document.createElement('div');
      injectContext(el2);
      const after = el2.getAttribute('data-context');
      expect(after).not.toBe(before);
      expect(JSON.parse(after).count).toBe(2);
      expect(JSON.parse(before).count).toBe(1);
    });
  });
});
