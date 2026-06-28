import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountWidget, unmountWidget } from '../loader.js';

/**
 * 拦截 <script> / <link> 创建，避免测试真的发起网络请求
 * @param {object} [options]
 * @param {boolean} [options.failJs] 是否模拟 JS 加载失败
 */
function mockResourceLoader(options = {}) {
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'script') {
      return {
        _tag: 'script',
        set src(_) {
          this._shouldFail = options.failJs;
        },
        _trigger() {
          if (this._shouldFail) {
            if (typeof this.onerror === 'function') this.onerror();
          } else if (typeof this.onload === 'function') {
            this.onload();
          }
        }
      };
    }
    if (tag === 'link') {
      return {
        _tag: 'link',
        set href(_) {
          if (typeof this.onload === 'function') this.onload();
        }
      };
    }
    return null;
  });

  vi.spyOn(document.head, 'appendChild').mockImplementation((child) => {
    if (child && child._tag === 'script' && typeof child._trigger === 'function') {
      child._trigger();
    }
    return child;
  });
}

describe('loader', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="host"></div>';
    delete window.biTestWidget;
    delete window.Vue2;
    delete window.Vue3;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('依赖缺失时渲染错误占位', async () => {
    mockResourceLoader();
    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biTestWidget',
      js: '/widget-deps.js',
      vueVersion: '2'
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('Vue2 运行时未加载');
  });

  it('成功加载并挂载物料', async () => {
    mockResourceLoader();
    window.Vue3 = {};
    window.biTestWidget = {
      mount(container, props) {
        container.innerHTML = `<div class="test-widget">${props.title}</div>`;
        return {
          unmount: vi.fn()
        };
      }
    };

    const container = document.getElementById('host');
    const api = await mountWidget(container, {
      name: 'biTestWidget',
      js: '/widget-ok.js',
      vueVersion: '3',
      props: { title: 'hello' }
    });

    expect(container.querySelector('.test-widget').textContent).toBe('hello');
    expect(api.unmount).toBeTypeOf('function');
  });

  it('UMD 未导出 mount 时渲染错误占位', async () => {
    mockResourceLoader();
    window.Vue3 = {};
    window.biTestWidget = {};

    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biTestWidget',
      js: '/widget-no-mount.js',
      vueVersion: '3'
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('未导出 mount 方法');
  });

  it('JS 加载失败时渲染错误占位', async () => {
    mockResourceLoader({ failJs: true });
    window.Vue3 = {};

    const container = document.getElementById('host');
    await mountWidget(container, {
      name: 'biTestWidget',
      js: '/widget-fail.js',
      vueVersion: '3'
    });

    expect(container.querySelector('.widget-error')).not.toBeNull();
    expect(container.textContent).toContain('JS 加载失败');
  });

  it('unmountWidget 调用返回的 unmount', () => {
    const unmount = vi.fn();
    unmountWidget({ unmount });
    expect(unmount).toHaveBeenCalledOnce();
  });

  it('无 unmount 时 unmountWidget 不报错', () => {
    expect(() => unmountWidget({})).not.toThrow();
    expect(() => unmountWidget(null)).not.toThrow();
  });
});
