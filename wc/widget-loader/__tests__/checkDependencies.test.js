// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock i18n，t() 直接返回原 key（避免翻译缺失干扰断言）
vi.mock('../../../i18n/index.js', () => ({
  t: (key, params) => {
    if (!params) return key;
    // 简单模板替换，便于断言
    return Object.keys(params).reduce(
      (s, k) => s.replace(`{${k}}`, params[k]),
      key
    );
  }
}));

// mock widget-context 的 injectContext 为空操作（checkDependencies 不调用，但模块顶部 import）
vi.mock('../../../widget-context/index.js', () => ({
  injectContext: () => {}
}));

import { checkDependencies, SUPPORTED_DEPS, WidgetError } from '../index.js';

describe('checkDependencies', () => {
  let originalVue2, originalVue3;

  beforeEach(() => {
    originalVue2 = window.Vue2;
    originalVue3 = window.Vue3;
    delete window.Vue2;
    delete window.Vue3;
  });

  afterEach(() => {
    if (originalVue2 === undefined) delete window.Vue2;
    else window.Vue2 = originalVue2;
    if (originalVue3 === undefined) delete window.Vue3;
    else window.Vue3 = originalVue3;
  });

  it("vueVersion='none' 跳过 Vue 校验", () => {
    expect(() => checkDependencies({ name: 'h5-widget', vueVersion: 'none' })).not.toThrow();
  });

  it('Vue2 缺失时抛错', () => {
    try {
      checkDependencies({ name: 'w', vueVersion: '2' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('DEP_VERSION_MISMATCH');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details.length).toBe(1);
      expect(err.details[0]).toContain('Vue2');
    }
  });

  it('Vue2 版本不兼容时抛错', () => {
    window.Vue2 = { version: '2.4.0' };
    try {
      checkDependencies({ name: 'w', vueVersion: '2' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('DEP_VERSION_MISMATCH');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details.length).toBe(1);
      // details 中应提到实际版本 2.4.0 与范围
      expect(err.details[0]).toContain('2.4.0');
    }
  });

  it('Vue2 版本兼容时不抛错', () => {
    window.Vue2 = { version: '2.6.14' };
    expect(() => checkDependencies({ name: 'w', vueVersion: '2' })).not.toThrow();
  });

  it('Vue3 版本兼容时不抛错', () => {
    window.Vue3 = { version: '3.4.21' };
    expect(() => checkDependencies({ name: 'w', vueVersion: '3' })).not.toThrow();
  });

  it('Vue3 缺失时抛错', () => {
    try {
      checkDependencies({ name: 'w', vueVersion: '3' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('DEP_VERSION_MISMATCH');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details[0]).toContain('Vue3');
    }
  });

  it("默认 vueVersion='2'", () => {
    // 不传 vueVersion 应等价于 '2'
    try {
      checkDependencies({ name: 'w' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('DEP_VERSION_MISMATCH');
      expect(err.details[0]).toContain('Vue2');
    }
  });

  it("vueVersion 缺失时 console.warn 告警但不阻断（显式声明不告警）", () => {
    window.Vue2 = { version: '2.6.14' };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => checkDependencies({ name: 'no-vv' })).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('未声明 vueVersion'));
      warnSpy.mockClear();
      checkDependencies({ name: 'has-vv', vueVersion: '2' });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      delete window.Vue2;
      warnSpy.mockRestore();
    }
  });

  it("vueVersion 非法值（如 'Vue3', 3, '4'）时抛 DEP_VERSION_MISMATCH", () => {
    const errors = [
      { vueVersion: 'Vue3' },
      { vueVersion: '4' },
      { vueVersion: 'vue2' },
    ];
    for (const w of errors) {
      try {
        checkDependencies({ name: 'bad-vv', ...w });
        throw new Error('should have thrown for ' + JSON.stringify(w));
      } catch (err) {
        expect(err.code).toBe('DEP_VERSION_MISMATCH');
        expect(err.message).toContain('不合法');
      }
    }
  });

  it('SUPPORTED_DEPS 导出结构正确', () => {
    expect(SUPPORTED_DEPS.vue2).toEqual({
      version: '2.6.14',
      compatibleRange: '^2.6.0',
      globalVar: 'Vue2'
    });
    expect(SUPPORTED_DEPS.vue3).toEqual({
      version: '3.4.21',
      compatibleRange: '^3.0.0',
      globalVar: 'Vue3'
    });
  });

  // ─── 高频第三方库（lodash/axios）runtimeDeps 校验 ───
  describe('runtimeDeps 高频第三方库校验', () => {
    let originalLodash, originalAxios;

    beforeEach(() => {
      originalLodash = window._;
      originalAxios = window.axios;
      delete window._;
      delete window.axios;
    });

    afterEach(() => {
      if (originalLodash === undefined) delete window._;
      else window._ = originalLodash;
      if (originalAxios === undefined) delete window.axios;
      else window.axios = originalAxios;
    });

    it('Vue3 + runtimeDeps 均存在且兼容时不抛错', () => {
      window.Vue3 = { version: '3.4.21' };
      window._ = { version: '4.17.21' };
      window.axios = { VERSION: '1.7.7' };
      expect(() =>
        checkDependencies({ name: 'w', vueVersion: '3', runtimeDeps: ['lodash', 'axios'] })
      ).not.toThrow();
    });

    it('声明 runtimeDeps 但 lodash 缺失时抛错', () => {
      window.Vue3 = { version: '3.4.21' };
      window.axios = { VERSION: '1.7.7' };
      try {
        checkDependencies({ name: 'w', vueVersion: '3', runtimeDeps: ['lodash', 'axios'] });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.code).toBe('DEP_VERSION_MISMATCH');
        expect(err.details.some(d => d.includes('lodash'))).toBe(true);
      }
    });

    it('lodash 版本不兼容时抛错', () => {
      window.Vue3 = { version: '3.4.21' };
      window._ = { version: '3.10.0' }; // 不满足 ^4.17.0
      window.axios = { VERSION: '1.7.7' };
      try {
        checkDependencies({ name: 'w', vueVersion: '3', runtimeDeps: ['lodash'] });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.code).toBe('DEP_VERSION_MISMATCH');
        expect(err.details.some(d => d.includes('lodash') && d.includes('3.10.0'))).toBe(true);
      }
    });

    it('H5 物料（vueVersion=none）也可声明 runtimeDeps', () => {
      window._ = { version: '4.17.21' };
      expect(() =>
        checkDependencies({ name: 'h5', vueVersion: 'none', runtimeDeps: ['lodash'] })
      ).not.toThrow();
    });

    it('未声明 runtimeDeps 时不校验（向后兼容）', () => {
      window.Vue3 = { version: '3.4.21' };
      // window._ 不存在，但因未声明 runtimeDeps，不应报错
      expect(() => checkDependencies({ name: 'w', vueVersion: '3' })).not.toThrow();
    });

    it('runtimeDeps 含未知库名时跳过（不阻断）', () => {
      window.Vue3 = { version: '3.4.21' };
      window._ = { version: '4.17.21' };
      // moment 不在 RUNTIME_DEP_KEYS 中，跳过；lodash 存在且兼容，通过
      expect(() =>
        checkDependencies({ name: 'w', vueVersion: '3', runtimeDeps: ['moment', 'lodash'] })
      ).not.toThrow();
    });
  });
});

describe('WidgetError 枚举', () => {
  it('WidgetError 枚举包含 UI_DEP_LIB_MISMATCH', () => {
    expect(WidgetError.UI_DEP_LIB_MISMATCH).toBe('UI_DEP_LIB_MISMATCH');
  });
});
