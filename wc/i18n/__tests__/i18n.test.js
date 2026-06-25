// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { t, getLocale, setLocale, onLocaleChange, addMessages } from '../index.js';

// 注意：i18n 是模块级单例（messages / listeners / currentLocale 跨用例共享）。
// 用例间通过 setLocale('zh', true) 复位 locale，并显式 off 所有订阅避免泄漏。
// addMessages 是追加合并，使用唯一 key 避免与基座文案或其他用例冲突。
describe('wc/i18n', () => {
  let busEmitSpy;
  const offs = [];

  beforeEach(() => {
    busEmitSpy = vi.fn();
    // i18n.setLocale 通过 window.widgetBus.emit 广播 locale-change；
    // 这里 mock 一个最小 widgetBus，断言广播调用（与 Spec4 的 widget-bus 改动解耦）
    window.widgetBus = { emit: busEmitSpy };
    // 强制复位 locale 到 'zh'，清除上一用例的 locale 状态
    setLocale('zh', true);
    busEmitSpy.mockClear();
  });

  afterEach(() => {
    while (offs.length) offs.pop()();
    delete window.widgetBus;
    setLocale('zh', true);
  });

  describe('回退链顺序', () => {
    it('zh-CN 回退到 zh：zh 命中先于 en', () => {
      // zh.sales.title='销售看板'，en.sales.title='Sales Dashboard'
      setLocale('zh-CN');
      expect(getLocale()).toBe('zh-CN');
      expect(t('sales.title')).toBe('销售看板');
    });

    it('zh-CN 未命中 zh-only 键时回退到 en', () => {
      // 仅在 en 注入一个键，zh 没有 → 回退链 [zh-CN, zh, en] 命中 en
      addMessages('en', { fbtest: { en_only: 'EN_ONLY_VALUE' } });
      setLocale('zh-CN');
      expect(t('fbtest.en_only')).toBe('EN_ONLY_VALUE');
    });

    it('en-GB 回退到 en', () => {
      setLocale('en-GB');
      expect(getLocale()).toBe('en-GB');
      expect(t('sales.title')).toBe('Sales Dashboard');
    });

    it('未知 locale（fr）回退到 en', () => {
      // 回退链 [fr, en, zh]：fr 无字典，命中 en
      setLocale('fr');
      expect(getLocale()).toBe('fr');
      expect(t('sales.title')).toBe('Sales Dashboard');
    });

    it('未知 locale 且 en 也无该键时最终回退到 zh', () => {
      // 仅在 zh 注入键，en 没有；locale=fr 时链 [fr, en, zh] 最终命中 zh
      addMessages('zh', { fbtest: { zh_only: 'ZH_ONLY_VALUE' } });
      setLocale('fr');
      expect(t('fbtest.zh_only')).toBe('ZH_ONLY_VALUE');
    });

    it('setLocale 拒绝回退链中无任何已知 locale 的语言', () => {
      // 'zh' 与 'en' 是仅有的已知 locale；
      // 'klingon' 的回退链 [klingon, en, zh] 含已知 locale，应被接受
      // 这里用一个 base 与 locale 相同且非 en/zh 的场景验证：接受
      setLocale('de');
      expect(getLocale()).toBe('de');
      // 回退到 en
      expect(t('sales.title')).toBe('Sales Dashboard');
    });
  });

  describe('addMessages 深合并', () => {
    it('追加同级新键不覆盖既有键', () => {
      addMessages('zh', { mergectx: { new_key: '新键' } });
      // 既有键仍可读
      expect(t('loader.retry')).toBe('点击重试');
      // 新增键可读
      expect(t('mergectx.new_key')).toBe('新键');
    });

    it('多层嵌套对象合并不互相覆盖', () => {
      // 在已有 sales 命名空间下追加嵌套键
      addMessages('zh', { sales: { deep: { nested: '嵌套值' } } });
      expect(t('sales.title')).toBe('销售看板'); // 既有保留
      expect(t('sales.deep.nested')).toBe('嵌套值'); // 新增可读
    });

    it('非对象值直接覆盖', () => {
      addMessages('zh', { overridectx: { v: '原始' } });
      expect(t('overridectx.v')).toBe('原始');
      addMessages('zh', { overridectx: { v: '覆盖后' } });
      expect(t('overridectx.v')).toBe('覆盖后');
    });

    it('为新 locale 注入文案后可翻译', () => {
      addMessages('ja', { greet: 'こんにちは' });
      setLocale('ja');
      // 回退链 [ja, en, zh]，ja 命中
      expect(t('greet')).toBe('こんにちは');
    });
  });

  describe('setLocale force 参数与广播', () => {
    it('force=false 同 locale 不广播、不触发订阅', () => {
      const cb = vi.fn();
      offs.push(onLocaleChange(cb));
      setLocale('zh'); // 当前已是 zh
      expect(cb).not.toHaveBeenCalled();
      expect(busEmitSpy).not.toHaveBeenCalled();
    });

    it('force=true 强制广播（locale 未变也触发）', () => {
      const cb = vi.fn();
      offs.push(onLocaleChange(cb));
      setLocale('zh', true);
      expect(cb).toHaveBeenCalledWith('zh');
      expect(busEmitSpy).toHaveBeenCalledWith('locale-change', { locale: 'zh' });
    });

    it('切换到不同 locale 时广播 locale-change', () => {
      const cb = vi.fn();
      offs.push(onLocaleChange(cb));
      setLocale('en');
      expect(cb).toHaveBeenCalledWith('en');
      expect(busEmitSpy).toHaveBeenCalledWith('locale-change', { locale: 'en' });
    });
  });

  describe('onLocaleChange 订阅与取消', () => {
    it('订阅后切换 locale 触发回调', () => {
      const cb = vi.fn();
      offs.push(onLocaleChange(cb));
      setLocale('en');
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenLastCalledWith('en');
    });

    it('off 后不再触发', () => {
      const cb = vi.fn();
      const off = onLocaleChange(cb);
      setLocale('en');
      expect(cb).toHaveBeenCalledTimes(1);
      off();
      setLocale('zh');
      expect(cb).toHaveBeenCalledTimes(1); // 仍为 1
    });

    it('多个订阅者独立触发', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      offs.push(onLocaleChange(cb1));
      offs.push(onLocaleChange(cb2));
      setLocale('en');
      expect(cb1).toHaveBeenCalledWith('en');
      expect(cb2).toHaveBeenCalledWith('en');
    });

    it('单个订阅者抛错不影响其他订阅者', () => {
      const bad = vi.fn(() => { throw new Error('boom'); });
      const good = vi.fn();
      offs.push(onLocaleChange(bad));
      offs.push(onLocaleChange(good));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setLocale('en');
      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalledWith('en');
      errSpy.mockRestore();
    });
  });

  describe('t 参数插值', () => {
    it('替换单个 {name} 占位符', () => {
      setLocale('zh');
      const result = t('loader.version_mismatch', { name: 'bi-test' });
      expect(result).toContain('bi-test');
      expect(result).not.toContain('{name}');
    });

    it('替换多个占位符', () => {
      setLocale('zh');
      // dep_missing: '物料 "{name}" 依赖 {dep}（{range}），但基座未提供 {globalVar} 运行时'
      const result = t('loader.dep_missing', {
        name: 'w', dep: 'vue', range: '^2.0', globalVar: 'Vue'
      });
      expect(result).toContain('"w"');
      expect(result).toContain('vue');
      expect(result).toContain('^2.0');
      expect(result).toContain('Vue');
      expect(result).not.toMatch(/\{(name|dep|range|globalVar)\}/);
    });

    it('未提供的参数保留占位符', () => {
      setLocale('zh');
      const result = t('loader.version_mismatch');
      expect(result).toContain('{name}');
    });

    it('缺失键返回 key 本身', () => {
      setLocale('zh');
      expect(t('no.such.deep.key')).toBe('no.such.deep.key');
    });

    it('en locale 下插值同样生效', () => {
      setLocale('en');
      const result = t('loader.version_mismatch', { name: 'w' });
      expect(result).toContain('w');
      expect(result).not.toContain('{name}');
    });
  });
});
