// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBus, createBroadcastBus } from '../index.js';

describe('widget-bus', () => {
  describe('emit / on 基本收发', () => {
    it('on 的 handler 收到 emit 的 payload', () => {
      const bus = createBus();
      const received = [];
      bus.on('test-event', payload => received.push(payload));
      bus.emit('test-event', { value: 42 });
      expect(received).toEqual([{ value: 42 }]);
    });

    it('payload 为 undefined 时也能收到', () => {
      const bus = createBus();
      let called = false;
      bus.on('ping', () => { called = true; });
      bus.emit('ping');
      expect(called).toBe(true);
    });

    it('多次 emit 多次触发', () => {
      const bus = createBus();
      const count = { n: 0 };
      bus.on('count', () => { count.n++; });
      bus.emit('count');
      bus.emit('count');
      bus.emit('count');
      expect(count.n).toBe(3);
    });
  });

  describe('取消订阅', () => {
    it('on 返回的函数调用后不再触发', () => {
      const bus = createBus();
      const received = [];
      const off = bus.on('once-test', p => received.push(p));
      bus.emit('once-test', 1);
      off();
      bus.emit('once-test', 2);
      expect(received).toEqual([1]);
    });
  });

  describe('once 语义', () => {
    it('once 仅触发一次', () => {
      const bus = createBus();
      const received = [];
      bus.once('one-shot', p => received.push(p));
      bus.emit('one-shot', 'a');
      bus.emit('one-shot', 'b');
      expect(received).toEqual(['a']);
    });

    it('once 返回取消订阅函数', () => {
      const bus = createBus();
      const received = [];
      const off = bus.once('one-shot-2', p => received.push(p));
      expect(typeof off).toBe('function');
      off();
      bus.emit('one-shot-2', 'a');
      expect(received).toEqual([]);
    });
  });

  describe('handler 异常隔离', () => {
    it('第一个 handler 抛错不阻断第二个，且 console.error 输出 [widget-bus] listener error', () => {
      const bus = createBus();
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const order = [];
      bus.on('err-test', () => { order.push('first'); throw new Error('boom'); });
      bus.on('err-test', () => { order.push('second'); });
      bus.emit('err-test');
      expect(order).toEqual(['first', 'second']);
      expect(errSpy).toHaveBeenCalled();
      const errArg = errSpy.mock.calls[0][0];
      expect(errArg).toContain('[widget-bus] listener error');
      errSpy.mockRestore();
    });
  });

  describe('命名空间隔离', () => {
    it('createBus(A) 与 createBus(B) 互不串扰', () => {
      const busA = createBus('A');
      const busB = createBus('B');
      const aReceived = [];
      const bReceived = [];
      busA.on('resize', p => aReceived.push(p));
      busB.on('resize', p => bReceived.push(p));
      busA.emit('resize', 'from-a');
      busB.emit('resize', 'from-b');
      expect(aReceived).toEqual(['from-a']);
      expect(bReceived).toEqual(['from-b']);
    });

    it('createBus() 与 createBus() 共享全局通道', () => {
      const bus1 = createBus();
      const bus2 = createBus();
      const received = [];
      bus1.on('global-sync', p => received.push(p));
      bus2.emit('global-sync', 'hello');
      expect(received).toEqual(['hello']);
    });

    it('命名空间总线不影响全局总线', () => {
      const busA = createBus('A');
      const busGlobal = createBus();
      const globalReceived = [];
      busGlobal.on('ns-test', p => globalReceived.push(p));
      busA.emit('ns-test', 'from-a');
      expect(globalReceived).toEqual([]);
    });
  });

  describe('CustomEvent 选项透传', () => {
    it('bubbles=false / composed=false 透传到 CustomEvent', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
      const bus = createBus('opts');
      bus.emit('evt', {}, { bubbles: false, composed: false });
      expect(dispatchSpy).toHaveBeenCalled();
      const event = dispatchSpy.mock.calls[0][0];
      expect(event.bubbles).toBe(false);
      expect(event.composed).toBe(false);
      dispatchSpy.mockRestore();
    });

    it('默认 bubbles=true / composed=true', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
      const bus = createBus();
      bus.emit('default-opts', {});
      const event = dispatchSpy.mock.calls[0][0];
      expect(event.bubbles).toBe(true);
      expect(event.composed).toBe(true);
      dispatchSpy.mockRestore();
    });
  });

  describe('事件名前缀', () => {
    it('全局总线事件类型为 bi-widget-bus:<type>', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
      const bus = createBus();
      bus.emit('prefix-check');
      const event = dispatchSpy.mock.calls[0][0];
      expect(event.type).toBe('bi-widget-bus:prefix-check');
      dispatchSpy.mockRestore();
    });

    it('命名空间总线事件类型为 bi-widget-bus:<ns>:<type>', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
      const bus = createBus('ns1');
      bus.emit('check');
      const event = dispatchSpy.mock.calls[0][0];
      expect(event.type).toBe('bi-widget-bus:ns1:check');
      dispatchSpy.mockRestore();
    });
  });

  describe('off 方法', () => {
    it('off 取消指定 handler：on(e,h1) on(e,h2) off(e,h1) emit(e) 仅 h2 触发', () => {
      const bus = createBus();
      const calls = [];
      const h1 = () => calls.push('h1');
      const h2 = () => calls.push('h2');
      bus.on('off-pick', h1);
      bus.on('off-pick', h2);
      bus.off('off-pick', h1);
      bus.emit('off-pick');
      expect(calls).toEqual(['h2']);
    });

    it('off 未注册 handler 不抛错、不影响其他 handler', () => {
      const bus = createBus();
      const calls = [];
      const registered = () => calls.push('registered');
      const neverRegistered = () => calls.push('never');
      bus.on('off-missing', registered);
      expect(() => bus.off('off-missing', neverRegistered)).not.toThrow();
      bus.emit('off-missing');
      expect(calls).toEqual(['registered']);
    });

    it('off 未注册事件类型不抛错', () => {
      const bus = createBus();
      expect(() => bus.off('off-no-such-event', () => {})).not.toThrow();
    });

    it('off 后再 on 仍正常工作', () => {
      const bus = createBus();
      const calls = [];
      const h = () => calls.push('h');
      bus.on('off-regon', h);
      bus.off('off-regon', h);
      bus.on('off-regon', h);
      bus.emit('off-regon');
      expect(calls).toEqual(['h']);
    });

    it('off 也能移除 once 注册的监听（按原 handler）', () => {
      const bus = createBus();
      const calls = [];
      const h = (p) => calls.push(p);
      bus.once('off-once', h);
      bus.off('off-once', h);
      bus.emit('off-once', 'a');
      bus.emit('off-once', 'b');
      expect(calls).toEqual([]);
    });

    it('createBus 实例也有 off 方法', () => {
      const bus = createBus('off-inst');
      const calls = [];
      const h = () => calls.push('x');
      bus.on('e', h);
      bus.off('e', h);
      bus.emit('e');
      expect(calls).toEqual([]);
    });
  });

  describe('destroy 方法', () => {
    it('destroy 后所有 on 注册的 handler 不再触发', () => {
      const bus = createBus('destroy-test');
      const calls = [];
      bus.on('event-a', () => calls.push('a'));
      bus.on('event-b', () => calls.push('b'));
      bus.emit('event-a');
      bus.emit('event-b');
      expect(calls).toEqual(['a', 'b']);
      bus.destroy();
      bus.emit('event-a');
      bus.emit('event-b');
      expect(calls).toEqual(['a', 'b']);
    });

    it('destroy 后 once 注册的 handler 不再触发', () => {
      const bus = createBus('destroy-once');
      const calls = [];
      bus.once('one', () => calls.push('one'));
      bus.destroy();
      bus.emit('one');
      expect(calls).toEqual([]);
    });

    it('destroy 幂等：多次调用不抛错', () => {
      const bus = createBus('destroy-idempotent');
      bus.on('e', () => {});
      bus.destroy();
      expect(() => bus.destroy()).not.toThrow();
    });

    it('destroy 不影响其他 bus 实例', () => {
      const busA = createBus('destroy-isolation-a');
      const busB = createBus('destroy-isolation-b');
      const bCalls = [];
      busB.on('shared', () => bCalls.push('b'));
      busA.destroy();
      busB.emit('shared');
      expect(bCalls).toEqual(['b']);
    });

    it('createBus 返回的实例含 destroy 方法', () => {
      const bus = createBus('has-destroy');
      expect(typeof bus.destroy).toBe('function');
    });
  });

  describe('createBroadcastBus', () => {
    it('返回一个可用的 bus 实例（含 emit/on/off/destroy）', () => {
      const bus = createBroadcastBus();
      expect(typeof bus.emit).toBe('function');
      expect(typeof bus.on).toBe('function');
      expect(typeof bus.off).toBe('function');
      expect(typeof bus.destroy).toBe('function');
    });

    it('使用全局命名空间（无 namespace），与 createBus() 共享通道', () => {
      const broadcast = createBroadcastBus();
      const listener = createBus();
      const received = [];
      listener.on('broadcast-test', p => received.push(p));
      broadcast.emit('broadcast-test', { data: 'hello' });
      expect(received).toEqual([{ data: 'hello' }]);
      broadcast.destroy();
      listener.destroy();
    });

    it('多次调用返回不同实例（非单例），各自独立 destroy', () => {
      const a = createBroadcastBus();
      const b = createBroadcastBus();
      expect(a).not.toBe(b);
      a.destroy();
      // b 不受影响
      const received = [];
      b.on('still-alive', p => received.push(p));
      b.emit('still-alive', 'ok');
      expect(received).toEqual(['ok']);
      b.destroy();
    });

    it('emit 的事件类型为 bi-widget-bus:<type>（全局前缀）', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
      const bus = createBroadcastBus();
      bus.emit('check-prefix');
      const event = dispatchSpy.mock.calls[0][0];
      expect(event.type).toBe('bi-widget-bus:check-prefix');
      dispatchSpy.mockRestore();
      bus.destroy();
    });
  });
});
