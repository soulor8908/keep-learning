// ai-schema-enricher 语义增强器单元测试
//
// 背景：该模块此前零测试覆盖。本文件覆盖 4 个导出函数
// (inferWidgetTitle / enrichProp / enrichSchema / generateAiPrompt) 的全部分支，
// 重点验证规则命中/未命中、enum/enumNames 注入与不覆盖、根节点语义联动、
// 不可变性以及 AI Prompt 序列化正确性。
import { describe, it, expect } from 'vitest';
import {
  enrichSchema,
  enrichProp,
  inferWidgetTitle,
  generateAiPrompt
} from '../index.js';
import { DEFAULT_LAYOUT } from '../../schema-generator/index.js';

describe('inferWidgetTitle —— 物料名称推中文标题', () => {
  it('带 bi- 前缀且命中映射：bi-sales-panel → 销售', () => {
    expect(inferWidgetTitle('bi-sales-panel')).toBe('销售');
  });

  it('不带 bi- 前缀也能命中映射：sales-panel → 销售', () => {
    expect(inferWidgetTitle('sales-panel')).toBe('销售');
  });

  it('命中映射为空串的片段(panel)被滤掉：bi-finance-panel → 财务', () => {
    expect(inferWidgetTitle('bi-finance-panel')).toBe('财务');
  });

  it('命中但全部片段映射为空串：bi-panel → 回退原始 widgetName', () => {
    // panel 映射为 ''，filter(Boolean) 后为空，回退到原始 widgetName（含 bi- 前缀）
    expect(inferWidgetTitle('bi-panel')).toBe('bi-panel');
  });

  it('未命中映射的片段保留原值：bi-unknown-panel → unknown', () => {
    expect(inferWidgetTitle('bi-unknown-panel')).toBe('unknown');
  });

  it('多片段组合：bi-sales-finance → 销售财务', () => {
    expect(inferWidgetTitle('bi-sales-finance')).toBe('销售财务');
  });

  it('多片段组合含未命中词：bi-marketing-customer → 市场客户', () => {
    expect(inferWidgetTitle('bi-marketing-customer')).toBe('市场客户');
  });

  it('多片段组合含未命中词与命中词混合：bi-sales-report → 销售report', () => {
    expect(inferWidgetTitle('bi-sales-report')).toBe('销售report');
  });
});

describe('enrichProp —— 单字段语义规则增强', () => {
  it('未命中规则：原样返回同一对象引用（早返回）', () => {
    const propSchema = { type: 'string', default: 'x' };
    // unknownField 不在 SEMANTIC_RULES 中
    const result = enrichProp('unknownField', propSchema);
    expect(result).toBe(propSchema);
  });

  it('命中无 enum 的规则(title)：注入 title/description，无 enum 字段', () => {
    const result = enrichProp('title', { type: 'string' });
    expect(result.title).toBe('标题');
    expect(result.description).toBe('看板板块的标题文案');
    expect(result.type).toBe('string');
    expect(result).not.toHaveProperty('enum');
    expect(result).not.toHaveProperty('enumNames');
  });

  it('命中含 enum 的规则(period)且 propSchema 无 enum：注入 enum 与 enumNames', () => {
    const result = enrichProp('period', { type: 'string' });
    expect(result.enum).toEqual(['day', 'week', 'month', 'year']);
    expect(result.enumNames).toEqual(['日', '周', '月', '年']);
    expect(result.title).toBe('统计周期');
    expect(result.description).toBe('数据聚合的时间周期');
  });

  it('propSchema 已有 enum：不覆盖', () => {
    const result = enrichProp('period', {
      type: 'string',
      enum: ['q1', 'q2']
    });
    expect(result.enum).toEqual(['q1', 'q2']);
    // enumNames 仍应注入（propSchema 没有 enumNames）
    expect(result.enumNames).toEqual(['日', '周', '月', '年']);
  });

  it('命中含 enumNames 的规则(currency)且 propSchema 无 enumNames：注入 enumNames', () => {
    const result = enrichProp('currency', { type: 'string' });
    expect(result.enum).toEqual(['CNY', 'USD', 'EUR', 'JPY']);
    expect(result.enumNames).toEqual(['人民币', '美元', '欧元', '日元']);
    expect(result.title).toBe('币种');
  });

  it('propSchema 已有 enumNames：不覆盖', () => {
    const result = enrichProp('currency', {
      type: 'string',
      enumNames: ['人民币元', '美刀']
    });
    expect(result.enumNames).toEqual(['人民币元', '美刀']);
    // enum 仍注入（propSchema 没有 enum）
    expect(result.enum).toEqual(['CNY', 'USD', 'EUR', 'JPY']);
  });

  it('propSchema 已有 title/description：保留不覆盖', () => {
    const result = enrichProp('period', {
      type: 'string',
      title: '自定义周期',
      description: '我自己写的描述'
    });
    expect(result.title).toBe('自定义周期');
    expect(result.description).toBe('我自己写的描述');
    // enum/enumNames 仍按规则注入
    expect(result.enum).toEqual(['day', 'week', 'month', 'year']);
    expect(result.enumNames).toEqual(['日', '周', '月', '年']);
  });

  it('命中规则同时保留 propSchema 既有额外字段（如 default/required）', () => {
    const result = enrichProp('limit', { type: 'number', default: 10, required: true });
    expect(result.default).toBe(10);
    expect(result.required).toBe(true);
    expect(result.title).toBe('显示条数');
    expect(result.description).toBe('最多展示的数据条数');
  });
});

describe('enrichSchema —— 整体 schema 语义增强', () => {
  it('title 缺失：用 inferWidgetTitle 推断', () => {
    const schema = { type: 'object', properties: {} };
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result.title).toBe('销售');
  });

  it('title 等于 widgetName：用 inferWidgetTitle 推断', () => {
    const schema = { title: 'bi-sales-panel', type: 'object' };
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result.title).toBe('销售');
  });

  it('title 已存在且不等于 widgetName：保留', () => {
    const schema = { title: '我的销售看板', type: 'object' };
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result.title).toBe('我的销售看板');
  });

  it('description 缺失：设为 `${title} 物料配置`', () => {
    const schema = { type: 'object' };
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result.description).toBe('销售 物料配置');
  });

  it('description 以 Auto-generated 开头：覆盖为 `${title} 物料配置`', () => {
    const schema = {
      type: 'object',
      description: 'Auto-generated schema for bi-sales-panel'
    };
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result.description).toBe('销售 物料配置');
  });

  it('description 已存在且非 Auto-generated：保留', () => {
    const schema = {
      type: 'object',
      description: '这是手写的描述'
    };
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result.description).toBe('这是手写的描述');
  });

  it('title+description 联动：新推断的 title 出现在 description 中', () => {
    // title 缺失 → 推断为 "销售"；description 缺失 → 用更新后的 title 拼接
    const schema = { type: 'object' };
    const result = enrichSchema(schema, 'bi-finance-panel');
    expect(result.title).toBe('财务');
    expect(result.description).toBe('财务 物料配置');
  });

  it('有 properties：逐字段 enrichProp', () => {
    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        period: { type: 'string' },
        unknown: { type: 'string', default: 'x' }
      }
    };
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result.properties.title.title).toBe('标题');
    expect(result.properties.period.enum).toEqual(['day', 'week', 'month', 'year']);
    expect(result.properties.period.enumNames).toEqual(['日', '周', '月', '年']);
    // 未命中规则的字段保持原样
    expect(result.properties.unknown).toEqual({ type: 'string', default: 'x' });
  });

  it('无 properties：不抛错', () => {
    const schema = { type: 'object' };
    expect(() => enrichSchema(schema, 'bi-sales-panel')).not.toThrow();
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result).not.toHaveProperty('properties');
  });

  it('layout 缺失：注入 DEFAULT_LAYOUT', () => {
    const schema = { type: 'object' };
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result.layout).toEqual(DEFAULT_LAYOUT);
    expect(result.layout).toEqual({
      defaultSize: { w: 6, h: 4 },
      minSize: { w: 3, h: 2 }
    });
  });

  it('layout 已有：保留不覆盖', () => {
    const customLayout = {
      defaultSize: { w: 12, h: 6 },
      minSize: { w: 4, h: 3 }
    };
    const schema = { type: 'object', layout: customLayout };
    const result = enrichSchema(schema, 'bi-sales-panel');
    expect(result.layout).toEqual(customLayout);
  });

  it('不可变性：原 schema 不被修改（深拷贝）', () => {
    const original = {
      type: 'object',
      title: 'bi-sales-panel',
      description: 'Auto-generated xxx',
      properties: {
        period: { type: 'string' }
      }
    };
    // 深拷贝一份用于事后对比
    const snapshot = JSON.parse(JSON.stringify(original));
    const result = enrichSchema(original, 'bi-sales-panel');
    // 原对象保持不变
    expect(original).toEqual(snapshot);
    // 返回值是不同引用
    expect(result).not.toBe(original);
    expect(result.properties).not.toBe(original.properties);
    expect(result.properties.period).not.toBe(original.properties.period);
  });
});

describe('generateAiPrompt —— AI 提示词生成', () => {
  it('返回值含 widgetName', () => {
    const schema = { type: 'object' };
    const prompt = generateAiPrompt(schema, 'bi-sales-panel', '/path/to/Comp.vue');
    expect(prompt).toContain('bi-sales-panel');
  });

  it('返回值含 componentPath', () => {
    const schema = { type: 'object' };
    const componentPath = '/abs/path/to/SalesPanel.vue';
    const prompt = generateAiPrompt(schema, 'bi-sales-panel', componentPath);
    expect(prompt).toContain(componentPath);
  });

  it('返回值含 JSON.stringify(schema, null, 2) 缩进内容', () => {
    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' }
      }
    };
    const prompt = generateAiPrompt(schema, 'bi-sales-panel', '/x.vue');
    // 缩进后的 JSON 应原样出现（含 2 空格缩进）
    expect(prompt).toContain(JSON.stringify(schema, null, 2));
    expect(prompt).toContain('  "type": "object"');
    expect(prompt).toContain('    "title": {\n      "type": "string"\n    }');
  });

  it('返回值含 ```json 代码围栏与任务说明关键句', () => {
    const schema = { type: 'object' };
    const prompt = generateAiPrompt(schema, 'bi-sales-panel', '/x.vue');
    expect(prompt).toContain('```json');
    expect(prompt).toContain('```');
    // 任务说明关键句
    expect(prompt).toContain('为每个 property 补充中文 title');
    expect(prompt).toContain('enum 和 enumNames');
    expect(prompt).toContain('layout.defaultSize');
    expect(prompt).toContain('只修改上述语义字段');
  });

  it('schema 含特殊字符(中文/嵌套对象/双引号)时序列化正确', () => {
    const schema = {
      type: 'object',
      title: '销售"看板"',
      properties: {
        config: {
          type: 'object',
          default: { name: '中文"引号"', nested: { a: 1 } }
        }
      }
    };
    const prompt = generateAiPrompt(schema, 'bi-sales-panel', '/x.vue');
    // 中文字符原样保留
    expect(prompt).toContain('销售');
    // 双引号在 JSON 序列化后被正确转义为 \"（标题与嵌套默认值均如此）
    expect(prompt).toContain('销售\\"看板\\"');
    expect(prompt).toContain('中文\\"引号\\"');
    // 整体 JSON 段可被反序列化回原对象（验证未破坏 JSON 结构）
    const jsonBlock = prompt.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonBlock).not.toBeNull();
    expect(JSON.parse(jsonBlock[1])).toEqual(schema);
  });
});
