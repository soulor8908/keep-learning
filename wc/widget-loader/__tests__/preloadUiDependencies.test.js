// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// mock i18n 与 widget-context（widget-loader 顶部 import）
vi.mock('../../i18n/index.js', () => ({ t: (key) => key }));
vi.mock('../../widget-context/index.js', () => ({ injectContext: () => {} }));

import {
  defaultResolveUiResource,
  defaultResolveFullResource,
  preloadUiDependencies
} from '../../ui-loader/index.js';
import { WidgetLoader } from '../index.js';

describe('defaultResolveUiResource', () => {
  it('js URL 格式正确', () => {
    expect(defaultResolveUiResource('https://cdn.x.com', 'element-plus', '2.7.0', 'button', 'js'))
      .toBe('https://cdn.x.com/ui/element-plus@2.7.0/button.js');
  });

  it('css URL 格式正确', () => {
    expect(defaultResolveUiResource('https://cdn.x.com', 'element-ui', '2.15.0', 'card', 'css'))
      .toBe('https://cdn.x.com/ui/element-ui@2.15.0/card.css');
  });

  it('cdnBase 尾部斜杠被去除', () => {
    expect(defaultResolveUiResource('https://cdn.x.com/', 'element-plus', '2.7.0', 'button', 'js'))
      .toBe('https://cdn.x.com/ui/element-plus@2.7.0/button.js');
  });
});

describe('defaultResolveFullResource', () => {
  it('full.js URL 格式正确', () => {
    expect(defaultResolveFullResource('https://cdn.x.com', 'element-plus', '2.7.0', 'js'))
      .toBe('https://cdn.x.com/ui/element-plus@2.7.0/full.js');
  });
});

describe('preloadUiDependencies', () => {
  let loadScriptSpy, loadStyleSpy;

  beforeEach(() => {
    // mock defaultLoader 的 loadScript/loadStyle，避免真实网络请求
    // 通过劫持 WidgetLoader.prototype 方法影响 defaultLoader 单例
    loadScriptSpy = vi.spyOn(WidgetLoader.prototype, 'loadScript').mockResolvedValue(undefined);
    loadStyleSpy = vi.spyOn(WidgetLoader.prototype, 'loadStyle').mockResolvedValue(undefined);
  });

  afterEach(() => {
    loadScriptSpy.mockRestore();
    loadStyleSpy.mockRestore();
  });

  it('两物料共用 button 只加载一次（loadedResources 去重）', async () => {
    const widgets = [
      { name: 'a', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button', 'card'] } } },
      { name: 'b', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button', 'input'] } } }
    ];
    await preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' });
    // button 应只被 loadScript 一次（去重），card/input 各一次
    const jsUrls = loadScriptSpy.mock.calls.map(c => c[0]);
    const buttonLoads = jsUrls.filter(u => u.endsWith('/button.js'));
    expect(buttonLoads.length).toBe(1);
    expect(jsUrls.some(u => u.endsWith('/card.js'))).toBe(true);
    expect(jsUrls.some(u => u.endsWith('/input.js'))).toBe(true);
  });

  it('base.css 始终自动加载一次（物料不再自带 base CSS）', async () => {
    const widgets = [
      { name: 'a', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button'] } } }
    ];
    await preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' });
    const cssUrls = loadStyleSpy.mock.calls.map(c => c[0]);
    // base.css 由基座统一加载一次，物料无需在产物中自带
    expect(cssUrls.some(u => u.endsWith('/base.css'))).toBe(true);
  });

  it('多物料共用同一 lib 时 base.css 只加载一次（去重）', async () => {
    const widgets = [
      { name: 'a', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button'] } } },
      { name: 'b', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['card'] } } }
    ];
    await preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' });
    const cssUrls = loadStyleSpy.mock.calls.map(c => c[0]);
    const baseCssLoads = cssUrls.filter(u => u.endsWith('/base.css'));
    expect(baseCssLoads.length).toBe(1);
  });

  it('lib 与 vueVersion 不匹配抛 UI_DEP_LIB_MISMATCH', async () => {
    const widgets = [
      { name: 'a', vueVersion: '3', schema: { uiDependencies: { lib: 'element-ui', version: '^2.15.0', components: ['button'] } } }
    ];
    await expect(preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' }))
      .rejects.toMatchObject({ code: 'UI_DEP_LIB_MISMATCH' });
  });

  it("vueVersion='none' 声明 uiDependencies 抛错", async () => {
    const widgets = [
      { name: 'h5', vueVersion: 'none', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button'] } } }
    ];
    await expect(preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' }))
      .rejects.toMatchObject({ code: 'UI_DEP_LIB_MISMATCH' });
  });

  it('full:true 只加载 full.js/full.css', async () => {
    const widgets = [
      { name: 'a', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', full: true } } }
    ];
    await preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' });
    const jsUrls = loadScriptSpy.mock.calls.map(c => c[0]);
    const cssUrls = loadStyleSpy.mock.calls.map(c => c[0]);
    expect(jsUrls).toEqual(['https://cdn.x.com/ui/element-plus@2.7.0/full.js']);
    expect(cssUrls).toEqual(['https://cdn.x.com/ui/element-plus@2.7.0/full.css']);
  });

  it('单组件 js 失败重试 1 次后仍失败不阻断整体', async () => {
    // button.js 第一次失败第二次成功；card.js 始终失败
    loadScriptSpy.mockImplementation((url) => {
      if (url.endsWith('/button.js')) {
        // 模拟首次失败、重试成功：用调用计数
        const calls = loadScriptSpy.mock.calls.filter(c => c[0] === url).length;
        return calls === 1 ? Promise.reject(new Error('net err')) : Promise.resolve();
      }
      if (url.endsWith('/card.js')) {
        return Promise.reject(new Error('permanent err'));
      }
      return Promise.resolve();
    });
    const widgets = [
      { name: 'a', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button', 'card'] } } }
    ];
    const result = await preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' });
    // button 重试后成功，进入 loaded
    expect(result.loaded.some(x => x === 'element-plus:button')).toBe(true);
    // card 始终失败，进入 failed
    expect(result.failed.some(f => f.component === 'card')).toBe(true);
    // 整体 Promise 不被 reject
    expect(result.failed.length).toBeGreaterThan(0);
  });

  it('无 uiDependencies 的 widget 被跳过', async () => {
    const widgets = [
      { name: 'h5', vueVersion: 'none' },
      { name: 'no-schema', vueVersion: '3' },
      { name: 'with-ui', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button'] } } }
    ];
    const result = await preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' });
    expect(result.loaded).toEqual(['element-plus:button']);
  });

  it('返回 {loaded, failed} 结构', async () => {
    const widgets = [
      { name: 'a', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button'] } } }
    ];
    const result = await preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' });
    expect(Array.isArray(result.loaded)).toBe(true);
    expect(Array.isArray(result.failed)).toBe(true);
  });

  it('缺 cdnBase 抛错', async () => {
    await expect(preloadUiDependencies([], {})).rejects.toThrow(/cdnBase is required/);
  });

  it('自定义 resolveUiResource 被使用', async () => {
    const custom = (cdnBase, lib, version, comp, type) => `https://custom.cdn/${lib}/${comp}.${type}`;
    const widgets = [
      { name: 'a', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button'] } } }
    ];
    await preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com', resolveUiResource: custom });
    expect(loadScriptSpy.mock.calls.some(c => c[0] === 'https://custom.cdn/element-plus/button.js')).toBe(true);
  });

  it('加载成功后注册组件到 Vue 运行时', async () => {
    // 模拟 IIFE bundle 已把 button 组件挂到 window.__UI_ELEMENT_PLUS__
    window.__UI_ELEMENT_PLUS__ = { button: { name: 'ElButton', template: '<button>mock</button>' } };
    window.Vue3 = { component: vi.fn() };
    const widgets = [
      { name: 'a', vueVersion: '3', schema: { uiDependencies: { lib: 'element-plus', version: '^2.7.0', components: ['button'] } } }
    ];
    await preloadUiDependencies(widgets, { cdnBase: 'https://cdn.x.com' });
    expect(window.Vue3.component).toHaveBeenCalledWith('el-button', window.__UI_ELEMENT_PLUS__.button);
    delete window.__UI_ELEMENT_PLUS__;
    delete window.Vue3;
  });
});
