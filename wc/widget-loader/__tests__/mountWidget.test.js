// @vitest-environment happy-dom
// U3：mountWidget API 语义收敛测试
// 验证 mountWidget 失败时返回 null（不 throw），且降级占位已在容器内渲染。
// 需要显式捕获错误的调用方应使用 attemptMount（失败直接 throw，无降级）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock i18n（widget-loader 顶部 import，错误路径用到 t()）
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

import { createWidgetLoader, WidgetError } from '../index.js';

// happy-dom 不会自动触发 <script> onload，且 appendChild 后会发起真实网络请求。
// 双重劫持：createElement('script') 后微任务手动触发 onload；head.appendChild 对 script 不真正 append。
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

const TAG = 'bi-mount-test';
function ensureElementDefined() {
  if (!customElements.get(TAG)) {
    customElements.define(TAG, class extends HTMLElement {});
  }
}

// 构造一个 SCRIPT_ERROR（真实脚本加载失败错误码），用于触发 mountWidget 的可重试降级路径
function makeScriptError(url) {
  const err = new Error(`Failed to load script: ${url}`);
  err.code = WidgetError.SCRIPT_ERROR;
  return err;
}

describe('mountWidget API 语义（U3）', () => {
  let loader;
  let container;
  let restoreSpy;
  let errSpy;

  beforeEach(() => {
    ensureElementDefined();
    loader = createWidgetLoader({ hostId: 'mount-test' });
    container = document.createElement('div');
    document.body.appendChild(container);
    restoreSpy = installScriptOnloadSpy();
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    restoreSpy();
    container.remove();
    document.querySelectorAll('head script').forEach(s => s.remove());
    errSpy.mockRestore();
  });

  it('成功挂载时返回物料元素（非 null）', async () => {
    const el = await loader.mountWidget(container, {
      name: TAG,
      js: 'https://cdn.example.com/ok.js',
      vueVersion: 'none'
    });
    expect(el).not.toBeNull();
    expect(el.tagName.toLowerCase()).toBe(TAG);
    expect(container.contains(el)).toBe(true);
  });

  it('加载失败时返回 null 且不 throw（U3 核心语义）', async () => {
    // 直接 stub loadScript 立即 reject，避免真实重试退避导致超时
    vi.spyOn(loader, 'loadScript').mockRejectedValue(makeScriptError('fail.js'));
    const result = await loader.mountWidget(container, {
      name: TAG,
      js: 'https://cdn.example.com/fail.js',
      vueVersion: 'none'
    });
    expect(result).toBeNull();
  });

  it('加载失败时容器内已渲染降级占位', async () => {
    vi.spyOn(loader, 'loadScript').mockRejectedValue(makeScriptError('fail.js'));
    await loader.mountWidget(container, {
      name: TAG,
      js: 'https://cdn.example.com/fail.js',
      vueVersion: 'none'
    });
    const placeholder = container.querySelector('.widget-error-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder.getAttribute('data-widget-fallback')).toBe(TAG);
  });

  it('加载失败时降级占位含"点击重试"按钮（可重试类错误）', async () => {
    vi.spyOn(loader, 'loadScript').mockRejectedValue(makeScriptError('fail.js'));
    await loader.mountWidget(container, {
      name: TAG,
      js: 'https://cdn.example.com/fail.js',
      vueVersion: 'none'
    });
    const retryBtn = container.querySelector('.widget-error-retry');
    expect(retryBtn).not.toBeNull();
  });

  it('版本不兼容时返回 null 且降级占位无重试按钮（确定性错误不可重试）', async () => {
    // vueVersion='2' 但 window.Vue2 不存在 → DEP_VERSION_MISMATCH
    delete window.Vue2;
    const result = await loader.mountWidget(container, {
      name: TAG,
      js: 'https://cdn.example.com/version.js',
      vueVersion: '2'
    });
    expect(result).toBeNull();
    // 版本不兼容是确定性错误，不应渲染重试按钮
    const retryBtn = container.querySelector('.widget-error-retry');
    expect(retryBtn).toBeNull();
    // 但应有降级占位
    const placeholder = container.querySelector('.widget-error-placeholder');
    expect(placeholder).not.toBeNull();
  });

  it('多次失败不堆叠多个降级占位（N8：renderFallback 先清理已有占位）', async () => {
    vi.spyOn(loader, 'loadScript').mockRejectedValue(makeScriptError('fail-twice.js'));
    const widget = {
      name: TAG,
      js: 'https://cdn.example.com/fail-twice.js',
      vueVersion: 'none'
    };
    await loader.mountWidget(container, widget);
    await loader.mountWidget(container, widget);
    const placeholders = container.querySelectorAll('.widget-error-placeholder');
    expect(placeholders.length).toBe(1);
  });
});

describe('attemptMount 与 mountWidget 语义对比（U3）', () => {
  let loader;
  let container;
  let errSpy;

  beforeEach(() => {
    ensureElementDefined();
    loader = createWidgetLoader({ hostId: 'attempt-test' });
    container = document.createElement('div');
    document.body.appendChild(container);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    container.remove();
    errSpy.mockRestore();
  });

  it('attemptMount 失败时直接 throw（无降级），mountWidget 失败时返回 null（有降级）', async () => {
    delete window.Vue2;
    // attemptMount：失败直接抛错
    await expect(
      loader.attemptMount(container, {
        name: TAG,
        js: 'https://cdn.example.com/x.js',
        vueVersion: '2'
      })
    ).rejects.toThrow();
    // 容器内无降级占位（attemptMount 不做降级）
    expect(container.querySelector('.widget-error-placeholder')).toBeNull();

    // mountWidget：失败返回 null + 降级占位
    const result = await loader.mountWidget(container, {
      name: TAG,
      js: 'https://cdn.example.com/y.js',
      vueVersion: '2'
    });
    expect(result).toBeNull();
    expect(container.querySelector('.widget-error-placeholder')).not.toBeNull();
  });
});
