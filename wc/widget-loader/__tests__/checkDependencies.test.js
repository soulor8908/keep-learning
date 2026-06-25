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

import { checkDependencies, SUPPORTED_DEPS } from '../index.js';

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
});
