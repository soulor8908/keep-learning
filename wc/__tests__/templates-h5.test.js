import { describe, it, expect, beforeEach } from 'vitest';
import { createH5Widget } from '../templates/h5.js';

// h5 模板是纯 JS 适配层（不依赖 Vue），直接驱动真实 DOM 断言三种返回约定的行为。
describe('templates/h5', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
  });

  it('renderFn 返回清理函数（旧约定）：unmount 调用清理并清空容器', () => {
    const cleaned = [];
    const widget = createH5Widget((container, props) => {
      container.innerHTML = `<div class="h5">${props.title}</div>`;
      return () => cleaned.push(true);
    });

    const container = document.getElementById('host');
    const api = widget.mount(container, { title: 'hello' });
    expect(container.querySelector('.h5').textContent).toBe('hello');

    api.unmount();
    expect(cleaned).toEqual([true]);
    expect(container.innerHTML).toBe('');
  });

  it('renderFn 返回 { cleanup, update }：支持 props 热更新', () => {
    const widget = createH5Widget((container, props) => {
      const render = (p) => { container.innerHTML = `<div class="h5">${p.title}</div>`; };
      render(props);
      return { cleanup: () => {}, update: render };
    });

    const container = document.getElementById('host');
    const api = widget.mount(container, { title: 'v1' });
    expect(container.querySelector('.h5').textContent).toBe('v1');
    expect(typeof api.update).toBe('function');

    api.update({ title: 'v2' });
    expect(container.querySelector('.h5').textContent).toBe('v2');

    api.unmount();
    expect(container.innerHTML).toBe('');
  });

  it('renderFn 无返回值：unmount 仍清空容器，update 为 undefined', () => {
    const widget = createH5Widget((container) => {
      container.innerHTML = '<div class="h5">x</div>';
    });

    const container = document.getElementById('host');
    const api = widget.mount(container, {});
    expect(api.update).toBeUndefined();

    api.unmount();
    expect(container.innerHTML).toBe('');
  });
});
