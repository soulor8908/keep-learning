import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supportsImportmap, injectImportmapShim, DEFAULT_SHIM_URL } from '../compat.js';

describe('compat', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    delete window.__WIDGET_SHIM_URL__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supportsImportmap 在 happy-dom 返回 false（无原生 importmap 支持）', () => {
    // happy-dom 不实现 HTMLScriptElement.supports('importmap')
    expect(supportsImportmap()).toBe(false);
  });

  it('force 注入 es-module-shims 脚本到 head 最前', () => {
    const ok = injectImportmapShim({ force: true });
    expect(ok).toBe(true);

    const shim = document.head.querySelector('script[data-es-module-shims]');
    expect(shim).not.toBeNull();
    expect(shim.src).toBe(DEFAULT_SHIM_URL);
    expect(shim.async).toBe(true);
  });

  it('自定义 url 覆盖默认 CDN', () => {
    injectImportmapShim({ force: true, url: 'http://internal/shim.js' });
    const shim = document.head.querySelector('script[data-es-module-shims]');
    expect(shim.src).toBe('http://internal/shim.js');
  });

  it('window.__WIDGET_SHIM_URL__ 覆盖默认 CDN（离线/内网）', () => {
    window.__WIDGET_SHIM_URL__ = 'http://intranet/es-module-shims.js';
    injectImportmapShim({ force: true });
    const shim = document.head.querySelector('script[data-es-module-shims]');
    expect(shim.src).toBe('http://intranet/es-module-shims.js');
  });

  it('重复调用不重复注入（去重）', () => {
    expect(injectImportmapShim({ force: true })).toBe(true);
    expect(injectImportmapShim({ force: true })).toBe(false);
    expect(document.head.querySelectorAll('script[data-es-module-shims]')).toHaveLength(1);
  });

  it('浏览器已支持 importmap 时不注入（force=false）', () => {
    // 模拟浏览器支持：happy-dom 未实现 supports，直接挂上去
    HTMLScriptElement.supports = () => true;
    try {
      expect(supportsImportmap()).toBe(true);
      expect(injectImportmapShim()).toBe(false);
      expect(document.head.querySelector('script[data-es-module-shims]')).toBeNull();
    } finally {
      delete HTMLScriptElement.supports;
    }
  });
});
