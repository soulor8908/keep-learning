// @vitest-environment happy-dom
// U2：基座运行时自检 ensureBaseReady 测试
// 验证首次挂载物料时自检 __wcI18n__/__wcWidgetScope__ 必需全局变量 +
// Vue2/Vue3/ElementPlus/ELEMENT 可选全局变量，缺失时一次性 console.warn
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock i18n（widget-loader 顶部 import，ensureBaseReady 不直接调用 t，但模块顶部 import 链需要）
vi.mock('../../i18n/index.js', () => ({
  t: (key, params) => params
    ? Object.keys(params).reduce((s, k) => s.replace(`{${k}}`, params[k]), key)
    : key
}));
// mock widget-context（widget-loader 顶部 import）
vi.mock('../../widget-context/index.js', () => ({
  injectContext: () => {}
}));

// ensureBaseReady 内部用模块级 _baseReadyChecked 单例标志，首次调用后不再告警。
// 每个需要"首次调用"语义的用例用 vi.resetModules() + 动态 import 获取全新模块实例。
async function importFresh() {
  vi.resetModules();
  return import('../index.js');
}

describe('ensureBaseReady（U2 基座运行时自检）', () => {
  let warnSpy;
  const REQUIRED_KEYS = ['__wcI18n__', '__wcWidgetScope__'];
  const OPTIONAL_KEYS = ['Vue2', 'Vue3', 'ElementPlus', 'ELEMENT'];
  const ALL_KEYS = [...REQUIRED_KEYS, ...OPTIONAL_KEYS];

  beforeEach(() => {
    // 清理所有相关全局变量
    ALL_KEYS.forEach(k => { delete window[k]; });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    ALL_KEYS.forEach(k => { delete window[k]; });
  });

  it('必需全局变量缺失时一次性告警（含 __wcI18n__ / __wcWidgetScope__）', async () => {
    const { ensureBaseReady } = await importFresh();
    ensureBaseReady();
    expect(warnSpy).toHaveBeenCalled();
    const allWarnArgs = warnSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allWarnArgs).toContain('__wcI18n__');
    expect(allWarnArgs).toContain('__wcWidgetScope__');
    expect(allWarnArgs).toContain('基座核心运行时未就绪');
  });

  it('必需全局变量齐全时不再告警必需项（仅可能告警可选项）', async () => {
    window.__wcI18n__ = { t: () => 'x' };
    window.__wcWidgetScope__ = { createWidgetScope: () => ({}) };
    const { ensureBaseReady } = await importFresh();
    ensureBaseReady();
    // 必需项齐全，不应出现"基座核心运行时未就绪"
    const requiredWarn = warnSpy.mock.calls
      .map(c => c.join(' '))
      .find(s => s.includes('基座核心运行时未就绪'));
    expect(requiredWarn).toBeUndefined();
  });

  it('可选全局变量缺失时告警（Vue2/Vue3/ElementPlus/ELEMENT）', async () => {
    window.__wcI18n__ = { t: () => 'x' };
    window.__wcWidgetScope__ = { createWidgetScope: () => ({}) };
    const { ensureBaseReady } = await importFresh();
    ensureBaseReady();
    const optionalWarn = warnSpy.mock.calls
      .map(c => c.join(' '))
      .find(s => s.includes('可选全局变量未检测到'));
    expect(optionalWarn).toBeDefined();
    expect(optionalWarn).toContain('Vue2');
    expect(optionalWarn).toContain('Vue3');
    expect(optionalWarn).toContain('ElementPlus');
    expect(optionalWarn).toContain('ELEMENT');
  });

  it('所有全局变量齐全时完全不告警', async () => {
    window.__wcI18n__ = { t: () => 'x' };
    window.__wcWidgetScope__ = { createWidgetScope: () => ({}) };
    window.Vue2 = { version: '2.6.14' };
    window.Vue3 = { version: '3.4.21' };
    window.ElementPlus = {};
    window.ELEMENT = {};
    const { ensureBaseReady } = await importFresh();
    ensureBaseReady();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('幂等：同一模块实例多次调用只在首次触发告警', async () => {
    const { ensureBaseReady } = await importFresh();
    ensureBaseReady();
    // 首次调用：必需项缺失 + 可选项缺失 → 2 条 warn（required + optional 各一条）
    const countAfterFirst = warnSpy.mock.calls.length;
    expect(countAfterFirst).toBeGreaterThan(0);
    ensureBaseReady();
    ensureBaseReady();
    // _baseReadyChecked 标志使后续调用直接 return，warn 次数不再增长
    expect(warnSpy.mock.calls.length).toBe(countAfterFirst);
  });

  it('告警信息包含修复引导（提示加载 wc-i18n / wc-widget-scope）', async () => {
    const { ensureBaseReady } = await importFresh();
    ensureBaseReady();
    const requiredWarn = warnSpy.mock.calls
      .map(c => c.join(' '))
      .find(s => s.includes('基座核心运行时未就绪'));
    expect(requiredWarn).toContain('wc-i18n');
    expect(requiredWarn).toContain('wc-widget-scope');
  });
});
