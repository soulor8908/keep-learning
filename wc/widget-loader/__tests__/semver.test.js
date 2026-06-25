// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { satisfies } from '../index.js';

describe('semver satisfies', () => {
  describe('^ caret', () => {
    it('^2.6.0 边界', () => {
      expect(satisfies('2.6.0', '^2.6.0')).toBe(true);
      expect(satisfies('2.6.14', '^2.6.0')).toBe(true);
      expect(satisfies('2.9.0', '^2.6.0')).toBe(true);
      expect(satisfies('3.0.0', '^2.6.0')).toBe(false);
      expect(satisfies('2.5.0', '^2.6.0')).toBe(false);
    });

    it('^0.0.3 0.0.x 收紧到同 patch', () => {
      expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
      expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
      expect(satisfies('0.0.2', '^0.0.3')).toBe(false);
    });

    it('^0.2.0 0.x 收紧到同 minor', () => {
      expect(satisfies('0.2.0', '^0.2.0')).toBe(true);
      expect(satisfies('0.2.5', '^0.2.0')).toBe(true);
      expect(satisfies('0.3.0', '^0.2.0')).toBe(false);
      expect(satisfies('0.1.9', '^0.2.0')).toBe(false);
    });
  });

  describe('~ tilde', () => {
    it('~1.2.3 收紧到同 minor', () => {
      expect(satisfies('1.2.3', '~1.2.3')).toBe(true);
      expect(satisfies('1.2.9', '~1.2.3')).toBe(true);
      expect(satisfies('1.3.0', '~1.2.3')).toBe(false);
      expect(satisfies('1.2.2', '~1.2.3')).toBe(false);
    });
  });

  describe('比较运算符', () => {
    it('>= 与 < 空格 AND 复合范围', () => {
      expect(satisfies('2.6.0', '>=2.6.0 <3.0.0')).toBe(true);
      expect(satisfies('2.9.9', '>=2.6.0 <3.0.0')).toBe(true);
      expect(satisfies('3.0.0', '>=2.6.0 <3.0.0')).toBe(false);
      expect(satisfies('2.5.9', '>=2.6.0 <3.0.0')).toBe(false);
    });

    it('>= 单独使用', () => {
      expect(satisfies('2.6.0', '>=2.6.0')).toBe(true);
      expect(satisfies('3.0.0', '>=2.6.0')).toBe(true);
      expect(satisfies('2.5.9', '>=2.6.0')).toBe(false);
    });

    it('> 严格大于', () => {
      expect(satisfies('2.6.1', '>2.6.0')).toBe(true);
      expect(satisfies('2.6.0', '>2.6.0')).toBe(false);
    });

    it('<= 小于等于', () => {
      expect(satisfies('2.6.0', '<=2.6.0')).toBe(true);
      expect(satisfies('2.6.1', '<=2.6.0')).toBe(false);
    });

    it('< 严格小于', () => {
      expect(satisfies('2.5.9', '<2.6.0')).toBe(true);
      expect(satisfies('2.6.0', '<2.6.0')).toBe(false);
    });
  });

  describe('|| 或范围', () => {
    it('^1.0.0 || ^3.0.0', () => {
      expect(satisfies('1.5.0', '^1.0.0 || ^3.0.0')).toBe(true);
      expect(satisfies('3.2.0', '^1.0.0 || ^3.0.0')).toBe(true);
      expect(satisfies('2.0.0', '^1.0.0 || ^3.0.0')).toBe(false);
    });
  });

  describe('通配与空范围', () => {
    it('* 匹配任意', () => {
      expect(satisfies('1.0.0', '*')).toBe(true);
      expect(satisfies('0.0.1', '*')).toBe(true);
      expect(satisfies('99.99.99', '*')).toBe(true);
    });

    it('空字符串匹配任意', () => {
      expect(satisfies('1.0.0', '')).toBe(true);
      expect(satisfies('2.4.0', '   ')).toBe(true);
    });
  });

  describe('精确版本', () => {
    it('=2.6.14 等价于 2.6.14', () => {
      expect(satisfies('2.6.14', '=2.6.14')).toBe(true);
      expect(satisfies('2.6.15', '=2.6.14')).toBe(false);
    });

    it('无操作符精确匹配', () => {
      expect(satisfies('2.6.14', '2.6.14')).toBe(true);
      expect(satisfies('2.6.15', '2.6.14')).toBe(false);
    });
  });

  describe('前缀清洗', () => {
    it('v 前缀被清洗', () => {
      expect(satisfies('v2.6.14', '2.6.14')).toBe(true);
      expect(satisfies('2.6.14', 'v2.6.14')).toBe(true);
    });

    it('= 前缀被清洗', () => {
      expect(satisfies('=2.6.14', '2.6.14')).toBe(true);
    });
  });

  describe('预发布版本', () => {
    it('正式版 > 预发布', () => {
      // ^1.0.0 要求 >=1.0.0；1.0.0-beta.1 < 1.0.0，故不满足
      expect(satisfies('1.0.0-beta.1', '^1.0.0')).toBe(false);
      expect(satisfies('1.0.0', '^1.0.0')).toBe(true);
    });

    it('预发布之间按字符串比较', () => {
      // 1.0.0-alpha.1 < 1.0.0-beta.1（按字符串 alpha < beta）
      expect(satisfies('1.0.0-alpha.1', '>=1.0.0-alpha.0')).toBe(true);
      expect(satisfies('1.0.0-beta.1', '>=1.0.0-alpha.1')).toBe(true);
    });
  });

  describe('无法解析的范围放行', () => {
    it('畸形范围返回 true（放行策略）', () => {
      // 当前实现对无法解析的范围放行，记录此实际行为
      expect(satisfies('1.0.0', 'xyz')).toBe(true);
    });
  });
});
