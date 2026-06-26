// toKebab / inferWidgetName 纯函数测试：默认 node 环境（无 DOM 依赖）
import { describe, it, expect } from 'vitest';

const { toKebab, inferWidgetName } = await import('../index.js');

describe('toKebab', () => {
  it('camelCase 转为 kebab-case', () => {
    expect(toKebab('SalesPanel')).toBe('sales-panel');
  });

  it('PascalCase 转为 kebab-case', () => {
    expect(toKebab('MyComponent')).toBe('my-component');
  });

  it('连续大写按词拆分', () => {
    expect(toKebab('XMLParser')).toBe('xml-parser');
  });

  it('数字与字母边界插入连字符', () => {
    expect(toKebab('max2Items')).toBe('max2-items');
  });

  it('已是 kebab-case 保持不变', () => {
    expect(toKebab('already-kebab')).toBe('already-kebab');
  });

  it('空字符串返回空字符串', () => {
    expect(toKebab('')).toBe('');
  });
});

describe('inferWidgetName', () => {
  it('PascalCase 文件名加 bi- 前缀并转 kebab', () => {
    expect(inferWidgetName('SalesPanel.vue')).toBe('bi-sales-panel');
  });

  it('多词 PascalCase 文件名', () => {
    expect(inferWidgetName('FinanceOverview.vue')).toBe('bi-finance-overview');
  });

  it('已是 kebab-case 的文件名仅加 bi- 前缀', () => {
    expect(inferWidgetName('already-kebab.vue')).toBe('bi-already-kebab');
  });
});
