// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBus, emit, on, once } from '../index.js';

describe('widget-bus', () => {
  describe('emit / on 基本收发', () => {
    it('on 的 handler 收到 emit 的 payload', () => {
      const received = [];
      on('test-event', payload => received.push(payload));
      emit('test-event', { value: 42 });
      expect(received).toEqual([{ value: 42 }]);
    });

    it('payload 为 undefined 时也能收到', () => {
      let called = false;
      on('ping', () => { called = true; });
      emit('ping');
      expect(called).toBe(true);
    });

    it('多次 emit 多次触发', () => {
      const count = { n: 0 };
      on('count', () => { count.n++; });
      emit('count');
      emit('count');
      emit('count');
      expect(count.n).toBe(3);
    });
  });

  describe('取消订阅', () => {
    it('on 返回的函数调用后不再触发', () => {
      const received = [];
      const off = on('once-test', p => received.push(p));
      emit('once-test', 1);
      off();
      emit('once-test', 2);
      expect(received).toEqual([1]);
    });
  });

  describe('once 语义', () => {
    it('once 仅触发一次', () => {
      const received = [];
      once('one-shot', p => received.push(p));
      emit('one-shot', 'a');
      emit('one-shot', 'b');
      expect(received).toEqual(['a']);
    });

    it('once 返回取消订阅函数', () => {
      const received = [];
      const off = once('one-shot-2', p => received.push(p));
      expect(typeof off).toBe('function');
      off();
      emit('one-shot-2', 'a');
      expect(received).toEqual([]);
    });
  });

  describe('handler 异常隔离', () => {
    it('第一个 handler 抛错不阻断第二个，且 console.error 输出 [widget-bus] listener error', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const order = [];
      on('err-test', () => { order.push('first'); throw new Error('boom'); });
      on('err-test', () => { order.push('second'); });
      emit('err-test');
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

    it('默认全局总线与 createBus() 行为一致，前缀为 bi-widget-bus:', () => {
      // 全局总线 emit('x') 等价于 createBus().emit('x')
      const bus = createBus();
      const received = [];
      on('global-sync', p => received.push(p));
      bus.emit('global-sync', 'hello');
      expect(received).toEqual(['hello']);
    });

    it('命名空间总线不影响全局总线', () => {
      const busA = createBus('A');
      const globalReceived = [];
      on('ns-test', p => globalReceived.push(p));
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
      emit('default-opts', {});
      const event = dispatchSpy.mock.calls[0][0];
      expect(event.bubbles).toBe(true);
      expect(event.composed).toBe(true);
      dispatchSpy.mockRestore();
    });
  });

  describe('事件名前缀', () => {
    it('全局总线事件类型为 bi-widget-bus:<type>', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
      emit('prefix-check');
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
});
