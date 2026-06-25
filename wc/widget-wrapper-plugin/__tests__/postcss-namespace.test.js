// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createNamespacePlugin, prefixSelector, isGlobalSelector, hasNamespace, GLOBAL_SELECTOR_PATTERNS } from '../postcss-namespace.js';

describe('postcss-namespace 命名空间前缀注入', () => {
  describe('T1.5a 普通选择器加前缀 (prefixSelector)', () => {
    it('.foo → .bi-sales-panel .foo（后代选择器拼接）', () => {
      expect(prefixSelector('.foo', 'bi-sales-panel')).toBe('.bi-sales-panel .foo');
    });

    it('.title.active → .bi-sales-panel .title.active（多类名整体加前缀）', () => {
      expect(prefixSelector('.title.active', 'bi-sales-panel')).toBe('.bi-sales-panel .title.active');
    });

    it('input[type="text"] → .bi-sales-panel input[type="text"]', () => {
      expect(prefixSelector('input[type="text"]', 'bi-sales-panel')).toBe('.bi-sales-panel input[type="text"]');
    });

    it('空选择器原样返回', () => {
      expect(prefixSelector('   ', 'bi-sales-panel')).toBe('   ');
      expect(prefixSelector('', 'bi-sales-panel')).toBe('');
    });

    it('后代选择器 .a .b 整体加前缀（不重复加）', () => {
      // .a .b 不含 .bi-sales-panel，整体加前缀
      expect(prefixSelector('.a .b', 'bi-sales-panel')).toBe('.bi-sales-panel .a .b');
    });
  });

  describe('T1.5b 全局白名单不加前缀 (isGlobalSelector)', () => {
    it('html / body / :root 不加前缀', () => {
      expect(isGlobalSelector('html')).toBe(true);
      expect(isGlobalSelector('body')).toBe(true);
      expect(isGlobalSelector(':root')).toBe(true);
    });

    it(':host 不加前缀', () => {
      expect(isGlobalSelector(':host')).toBe(true);
      expect(isGlobalSelector(':host(.x)')).toBe(true);
    });

    it('通配符 * 不加前缀', () => {
      expect(isGlobalSelector('*')).toBe(true);
    });

    it('伪元素 ::before / ::after / ::v-deep 不加前缀', () => {
      expect(isGlobalSelector('::before')).toBe(true);
      expect(isGlobalSelector('::after')).toBe(true);
      expect(isGlobalSelector('::v-deep')).toBe(true);
      expect(isGlobalSelector('::v-global')).toBe(true);
      expect(isGlobalSelector('::v-slotted')).toBe(true);
    });

    it('深度选择器 >>> / /deep/ / :deep() / :global() 不加前缀', () => {
      expect(isGlobalSelector('>>> .foo')).toBe(true);
      expect(isGlobalSelector('/deep/ .foo')).toBe(true);
      expect(isGlobalSelector(':deep(.foo)')).toBe(true);
      expect(isGlobalSelector(':global(.foo)')).toBe(true);
      expect(isGlobalSelector(':slotted(.foo)')).toBe(true);
    });

    it('空字符串视为全局（不加前缀）', () => {
      expect(isGlobalSelector('')).toBe(true);
      expect(isGlobalSelector('   ')).toBe(true);
    });

    it('普通类选择器不是全局', () => {
      expect(isGlobalSelector('.foo')).toBe(false);
      expect(isGlobalSelector('.bi-sales-panel')).toBe(false);
      expect(isGlobalSelector('input')).toBe(false);
    });

    it('GLOBAL_SELECTOR_PATTERNS 已导出且为非空数组', () => {
      expect(Array.isArray(GLOBAL_SELECTOR_PATTERNS)).toBe(true);
      expect(GLOBAL_SELECTOR_PATTERNS.length).toBeGreaterThan(10);
      // 每项都是正则
      expect(GLOBAL_SELECTOR_PATTERNS.every(r => r instanceof RegExp)).toBe(true);
    });
  });

  describe('T1.5c hasNamespace 检测', () => {
    it('已含命名空间前缀返回 true', () => {
      expect(hasNamespace('.bi-sales-panel .foo', 'bi-sales-panel')).toBe(true);
      expect(hasNamespace('.bi-sales-panel', 'bi-sales-panel')).toBe(true);
    });

    it('不含命名空间返回 false', () => {
      expect(hasNamespace('.foo', 'bi-sales-panel')).toBe(false);
      expect(hasNamespace('.title.active', 'bi-sales-panel')).toBe(false);
    });

    it('空选择器视为已含（不重复处理）', () => {
      expect(hasNamespace('', 'bi-sales-panel')).toBe(true);
    });

    it('prefixSelector 对已含命名空间的选择器不重复加前缀', () => {
      expect(prefixSelector('.bi-sales-panel .foo', 'bi-sales-panel')).toBe('.bi-sales-panel .foo');
    });
  });

  describe('T1.5d createNamespacePlugin 插件实例', () => {
    it('返回标准 postcss 8 插件对象，postcssPlugin 字段正确', () => {
      const plugin = createNamespacePlugin('bi-sales-panel');
      expect(plugin.postcssPlugin).toBe('postcss-widget-namespace');
      expect(typeof plugin.Rule).toBe('function');
    });

    it('缺 widgetName 时抛错', () => {
      expect(() => createNamespacePlugin('')).toThrow();
      expect(() => createNamespacePlugin(null)).toThrow();
    });

    it('普通顶层规则的选择器被加前缀', () => {
      const plugin = createNamespacePlugin('bi-sales-panel');
      const rule = { selectors: ['.foo', '.bar'], parent: null };
      plugin.Rule(rule);
      expect(rule.selectors).toEqual(['.bi-sales-panel .foo', '.bi-sales-panel .bar']);
    });

    it('多选择器组合（逗号分隔）逐个加前缀', () => {
      const plugin = createNamespacePlugin('bi-x');
      const rule = { selectors: ['.a', '.b', '.c'], parent: null };
      plugin.Rule(rule);
      expect(rule.selectors).toEqual(['.bi-x .a', '.bi-x .b', '.bi-x .c']);
    });

    it('白名单选择器不加前缀（混合场景）', () => {
      const plugin = createNamespacePlugin('bi-x');
      const rule = { selectors: ['html', 'body', '.foo'], parent: null };
      plugin.Rule(rule);
      expect(rule.selectors).toEqual(['html', 'body', '.bi-x .foo']);
    });

    it('@media 内部规则仍加前缀（parent.type=atrule, name=media）', () => {
      const plugin = createNamespacePlugin('bi-x');
      const rule = {
        selectors: ['.foo'],
        parent: { type: 'atrule', name: 'media' }
      };
      plugin.Rule(rule);
      expect(rule.selectors).toEqual(['.bi-x .foo']);
    });

    it('@supports 内部规则仍加前缀', () => {
      const plugin = createNamespacePlugin('bi-x');
      const rule = {
        selectors: ['.foo'],
        parent: { type: 'atrule', name: 'supports' }
      };
      plugin.Rule(rule);
      expect(rule.selectors).toEqual(['.bi-x .foo']);
    });

    it('@keyframes 内部规则跳过不加前缀（关键帧选择器 0%/from/to 不是样式选择器）', () => {
      const plugin = createNamespacePlugin('bi-x');
      const rule = {
        selectors: ['0%', '100%', 'from', 'to'],
        parent: { type: 'atrule', name: 'keyframes' }
      };
      plugin.Rule(rule);
      // 关键帧内部选择器原样保留，不被加前缀
      expect(rule.selectors).toEqual(['0%', '100%', 'from', 'to']);
    });

    it('@-webkit-keyframes 内部规则同样跳过', () => {
      const plugin = createNamespacePlugin('bi-x');
      const rule = {
        selectors: ['from', 'to'],
        parent: { type: 'atrule', name: '-webkit-keyframes' }
      };
      plugin.Rule(rule);
      expect(rule.selectors).toEqual(['from', 'to']);
    });

    it('@font-face 内部规则跳过', () => {
      const plugin = createNamespacePlugin('bi-x');
      const rule = {
        selectors: ['font-family'],
        parent: { type: 'atrule', name: 'font-face' }
      };
      plugin.Rule(rule);
      expect(rule.selectors).toEqual(['font-family']);
    });

    it('createNamespacePlugin.postcss 标记为 true（postcss 8 识别）', () => {
      expect(createNamespacePlugin.postcss).toBe(true);
    });
  });
});
