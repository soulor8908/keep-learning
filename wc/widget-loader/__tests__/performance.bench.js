// @vitest-environment happy-dom
// 性能基准（vitest bench）：物料并发加载 + 批量 DOM 插入。
// 用 `npx vitest bench` 运行；普通 `vitest run` 不会收集 .bench.js。
// bench 无断言，仅测耗时；如需阈值断言见 performance.test.js。
import { describe, bench, vi } from 'vitest';

// mock i18n / widget-context（widget-loader 顶部 import）
vi.mock('../../i18n/index.js', () => ({
  t: (key, params) => {
    if (!params) return key;
    return Object.keys(params).reduce(
      (s, k) => s.replace(`{${k}}`, params[k]),
      key
    );
  }
}));
vi.mock('../../widget-context/index.js', () => ({
  injectContext: () => {}
}));

import { createWidgetLoader } from '../index.js';

// happy-dom 支持自定义元素；guard 防止重复 define 抛错
const LEAK_TAG = 'bi-perf-leak';
if (!customElements.get(LEAK_TAG)) {
  customElements.define(LEAK_TAG, class extends HTMLElement {});
}

// happy-dom 不会自动触发 <script> onload，且 script 一旦 appendChild 到 DOM
// 就会发起真实网络请求（isConnected=true 时触发 ResourceFetch）。双重劫持：
//  1. createElement('script') 后在微任务里手动触发 onload；
//  2. head.appendChild(script) 不真正 append，保持 isConnected=false，避免真实网络请求。
// 非 script 标签原样返回真实元素并真实 append。测试文件级隔离，spy 无需 restore。
const realCreate = document.createElement.bind(document);
const head = document.head;
const realAppend = head.appendChild.bind(head);
vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
  const el = realCreate(tag, options);
  if (String(tag).toLowerCase() === 'script') {
    queueMicrotask(() => {
      if (typeof el.onload === 'function') el.onload();
    });
  }
  return el;
});
vi.spyOn(head, 'appendChild').mockImplementation((node) => {
  if (node && typeof node.tagName === 'string' && node.tagName.toLowerCase() === 'script') {
    return node;
  }
  return realAppend(node);
});

const loader = createWidgetLoader({ hostId: 'perf-bench' });
const CACHE_URL = 'https://perf-cdn.example.com/cached.js';

// 清理 head 里的 <script>，避免跨轮次 DOM 堆积影响后续测量
function cleanScripts() {
  document.querySelectorAll('head script').forEach(s => s.remove());
}

describe('性能基准 - 物料并发加载', () => {
  bench('并发加载 50 个物料（去重命中缓存）', async () => {
    // 首轮加载触发 script onload 并写入 loadedResources，
    // 后续轮次（以及本轮 50 次）全部命中缓存，测量缓存命中路径开销
    if (!loader.loadedResources.has(CACHE_URL)) {
      await loader.loadScript(CACHE_URL);
    }
    await Promise.all(
      Array.from({ length: 50 }, () => loader.loadScript(CACHE_URL))
    );
  });

  bench('并发加载 50 个不同 URL 物料', async () => {
    // 每轮重置缓存并清理 <script>，确保测量真实并发加载路径（非缓存命中）
    loader.loadedResources.clear();
    cleanScripts();
    const urls = Array.from(
      { length: 50 },
      (_, i) => `https://perf-cdn.example.com/diff-${i}.js`
    );
    await Promise.all(urls.map(u => loader.loadScript(u)));
  });
});

describe('性能基准 - DOM 批量插入', () => {
  bench('批量创建 100 个 widget 容器', () => {
    // 用 DocumentFragment 批量插入，测量长页面 DOM 批量构建性能
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 100; i++) {
      const node = document.createElement('div');
      node.className = 'widget-container';
      node.setAttribute('data-idx', String(i));
      fragment.appendChild(node);
    }
    const host = document.createElement('div');
    host.appendChild(fragment);
    // 清理，避免跨轮次 DOM 堆积影响后续测量
    host.remove();
  });
});
