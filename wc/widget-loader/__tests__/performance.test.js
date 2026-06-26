// @vitest-environment happy-dom
// 性能测试（断言型）：内存泄漏检测 + 长页面 DOM 性能阈值断言。
// 基准型测试（vitest bench）见 performance.bench.js，普通 `vitest run` 不收集 .bench.js。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock i18n（widget-loader 顶部 import，错误路径用到 t()），直接回写参数占位符
vi.mock('../../i18n/index.js', () => ({
  t: (key, params) => {
    if (!params) return key;
    return Object.keys(params).reduce(
      (s, k) => s.replace(`{${k}}`, params[k]),
      key
    );
  }
}));
// mock widget-context（renderWidget 调 injectContext，此处不验证其行为）
vi.mock('../../widget-context/index.js', () => ({
  injectContext: () => {}
}));

import { createWidgetLoader } from '../index.js';

// happy-dom 支持自定义元素；同名 tag 重复 define 会抛错，用 guard 包一层
const LEAK_TAG = 'bi-perf-leak';
const DOM_TAG = 'bi-perf-dom';
function ensureElementDefined(tag) {
  if (!customElements.get(tag)) {
    customElements.define(tag, class extends HTMLElement {});
  }
}

// happy-dom 不会自动触发 <script> onload，且 script 一旦 appendChild 到 DOM
// 就会发起真实网络请求（isConnected=true 时触发 ResourceFetch）。这里双重劫持：
//  1. createElement('script') 后在微任务里手动触发 onload，绕过 onload 不触发限制；
//  2. head.appendChild(script) 不真正 append，保持 isConnected=false，避免 happy-dom
//     发起真实网络请求（非 hermetic、可能拖慢/抖动测试）。
// 非 script 标签原样返回真实元素并真实 append，不影响 DOM 性能测试的真实性。
function installScriptOnloadSpy() {
  const realCreate = document.createElement.bind(document);
  const head = document.head;
  const realAppend = head.appendChild.bind(head);
  const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const el = realCreate(tag, options);
    if (String(tag).toLowerCase() === 'script') {
      queueMicrotask(() => {
        if (typeof el.onload === 'function') el.onload();
      });
    }
    return el;
  });
  const appendSpy = vi.spyOn(head, 'appendChild').mockImplementation((node) => {
    if (node && typeof node.tagName === 'string' && node.tagName.toLowerCase() === 'script') {
      return node;
    }
    return realAppend(node);
  });
  return () => {
    createSpy.mockRestore();
    appendSpy.mockRestore();
  };
}

describe('内存泄漏检测', () => {
  let loader;
  let container;
  let restoreSpy;

  beforeEach(() => {
    ensureElementDefined(LEAK_TAG);
    // 每个用例独立 loader，状态隔离（mountedWidgets/loadedResources 等实例属性）
    loader = createWidgetLoader({ hostId: 'perf-leak' });
    container = document.createElement('div');
    document.body.appendChild(container);
    restoreSpy = installScriptOnloadSpy();
  });

  afterEach(() => {
    restoreSpy();
    container.remove();
    // 清理可能残留的 <script>，避免跨用例 DOM 堆积
    document.querySelectorAll('head script').forEach(s => s.remove());
  });

  it('反复 mount/unmount 物料不导致 mountedWidgets 增长', async () => {
    const url = 'https://perf-cdn.example.com/leak.js';
    for (let i = 0; i < 100; i++) {
      // vueVersion:'none' 跳过 Vue 运行时校验，无需挂 window.Vue2
      const el = await loader.mountWidget(container, {
        name: LEAK_TAG,
        js: url,
        vueVersion: 'none'
      });
      loader.unmountWidget(el);
    }
    // 错误归因 Map 应归零（mount/unmount 一一对应）
    expect(loader.mountedWidgets.size).toBe(0);
    // 容器内不应残留物料节点
    expect(container.children.length).toBe(0);
  });

  it('loadedResources 缓存大小受控（同 URL 不重复增长）', async () => {
    const url = 'https://perf-cdn.example.com/cached.js';
    for (let i = 0; i < 20; i++) {
      await loader.loadScript(url);
    }
    // 同 URL 多次加载只产生一条缓存记录（loadedResources 去重）
    expect(loader.loadedResources.size).toBe(1);
    expect(loader.loadedResources.has(url)).toBe(true);
  });

  it('错误归因 Map 在 unmount 后清理', async () => {
    const el = await loader.mountWidget(container, {
      name: LEAK_TAG,
      js: 'https://perf-cdn.example.com/attr.js',
      vueVersion: 'none'
    });
    expect(loader.mountedWidgets.has(el)).toBe(true);
    loader.unmountWidget(el);
    // unmount 后错误归因 Map 不应再持有该元素
    expect(loader.mountedWidgets.has(el)).toBe(false);
    expect(container.children.length).toBe(0);
  });
});

describe('长页面滚动性能', () => {
  let container;

  beforeEach(() => {
    ensureElementDefined(DOM_TAG);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('1000 个物料节点的 DOM 操作在阈值内', () => {
    // 阈值宽松：sandbox 机器性能不稳定
    const THRESHOLD = 2000; // ms
    const start = performance.now();
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 1000; i++) {
      const node = document.createElement(DOM_TAG);
      node.setAttribute('data-idx', String(i));
      fragment.appendChild(node);
    }
    container.appendChild(fragment);
    const elapsed = performance.now() - start;

    expect(container.querySelectorAll(DOM_TAG).length).toBe(1000);
    expect(elapsed).toBeLessThan(THRESHOLD);
  });
});
