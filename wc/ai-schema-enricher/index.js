#!/usr/bin/env node
/**
 * AI Schema 语义增强器
 *
 * 自动 schema 只能拿到类型、默认值、必填信息，缺少业务语义。
 * 本工具先通过规则库做基础增强，再生成 AI Prompt，由 AI 进一步补充：
 * - 中文标题（title）
 * - 业务描述（description）
 * - 枚举值（enum）
 * - 布局建议（layout）
 *
 * 用法：
 *   node wc/ai-schema-enricher/index.js <widget-name> <vue-file-or-schema-json> [output-path]
 *
 * 示例：
 *   node wc/ai-schema-enricher/index.js bi-sales-panel demo/vue2-widget-lib/src/components/SalesPanel.vue
 *   node wc/ai-schema-enricher/index.js bi-sales-panel dist/bi-sales-panel.schema.json dist/bi-sales-panel.schema.enriched.json
 */

const fs = require('fs');
const path = require('path');
const { generateSchema, DEFAULT_LAYOUT } = require('../schema-generator');

// 规则库：根据常见 prop 名自动补全语义
const SEMANTIC_RULES = {
  title: {
    title: '标题',
    description: '看板板块的标题文案',
    type: 'string'
  },
  period: {
    title: '统计周期',
    description: '数据聚合的时间周期',
    enum: ['day', 'week', 'month', 'year'],
    enumNames: ['日', '周', '月', '年'],
    type: 'string'
  },
  currency: {
    title: '币种',
    description: '金额显示的币种',
    enum: ['CNY', 'USD', 'EUR', 'JPY'],
    enumNames: ['人民币', '美元', '欧元', '日元'],
    type: 'string'
  },
  showTrend: {
    title: '显示趋势',
    description: '是否展示趋势条',
    type: 'boolean'
  },
  showBreakdown: {
    title: '显示明细',
    description: '是否展示分项明细',
    type: 'boolean'
  },
  showChart: {
    title: '显示图表',
    description: '是否展示图表',
    type: 'boolean'
  },
  refreshInterval: {
    title: '刷新间隔',
    description: '数据自动刷新间隔，单位秒',
    type: 'number'
  },
  dateRange: {
    title: '日期范围',
    description: '查询数据的起始和结束日期',
    type: 'array'
  },
  theme: {
    title: '主题',
    description: '看板主题风格',
    enum: ['light', 'dark'],
    enumNames: ['浅色', '深色'],
    type: 'string'
  },
  limit: {
    title: '显示条数',
    description: '最多展示的数据条数',
    type: 'number'
  },
  orderBy: {
    title: '排序字段',
    description: '数据排序依据',
    type: 'string'
  },
  sort: {
    title: '排序方式',
    description: '升序或降序',
    enum: ['asc', 'desc'],
    enumNames: ['升序', '降序'],
    type: 'string'
  },
  config: {
    title: '组件配置',
    description: '看板物料的完整配置对象',
    type: 'object'
  }
};

const WIDGET_TITLE_MAP = {
  'sales': '销售',
  'finance': '财务',
  'marketing': '市场',
  'hr': '人事',
  'operation': '运营',
  'inventory': '库存',
  'customer': '客户',
  'panel': ''
};

function inferWidgetTitle(widgetName) {
  const parts = widgetName.replace(/^bi-/, '').split('-');
  const keywords = parts
    .map(p => (p in WIDGET_TITLE_MAP ? WIDGET_TITLE_MAP[p] : p))
    .filter(Boolean);
  return keywords.join('') || widgetName;
}

function enrichProp(name, propSchema) {
  const rule = SEMANTIC_RULES[name];
  if (!rule) return propSchema;

  return {
    ...propSchema,
    title: propSchema.title || rule.title,
    description: propSchema.description || rule.description,
    ...(rule.enum && !propSchema.enum ? { enum: rule.enum } : {}),
    ...(rule.enumNames && !propSchema.enumNames ? { enumNames: rule.enumNames } : {})
  };
}

function enrichSchema(schema, widgetName) {
  const enriched = JSON.parse(JSON.stringify(schema));

  // 增强根节点语义
  if (!enriched.title || enriched.title === widgetName) {
    enriched.title = inferWidgetTitle(widgetName);
  }
  if (!enriched.description || enriched.description.startsWith('Auto-generated')) {
    enriched.description = `${enriched.title} 物料配置`;
  }

  // 增强每个 prop
  if (enriched.properties) {
    Object.keys(enriched.properties).forEach(propName => {
      enriched.properties[propName] = enrichProp(propName, enriched.properties[propName]);
    });
  }

  // 如果没有 layout，给一个合理默认值（复用 schema-generator 统一常量）
  if (!enriched.layout) {
    enriched.layout = DEFAULT_LAYOUT;
  }

  return enriched;
}

function generateAiPrompt(schema, widgetName, componentPath) {
  return `你是一名资深前端架构师，正在完善看板物料的配置协议 schema.json。

请根据下面的组件信息，补充 schema 中的业务语义字段：

- 物料名称：${widgetName}
- 组件路径：${componentPath}
- 当前 schema：

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

请完成以下任务：
1. 为每个 property 补充中文 title 和业务 description。
2. 对具有固定取值的字段（如周期、币种、主题、排序方式等）补充 enum 和 enumNames。
3. 根据组件实际功能，调整 layout.defaultSize 和 layout.minSize。
4. 返回完整的 JSON，只修改上述语义字段，不要改变原有类型、默认值、必填逻辑。

输出格式：直接返回 JSON，不要加解释。`;
}

function loadSchema(widgetName, inputPath) {
  const absolutePath = path.resolve(inputPath);
  const ext = path.extname(absolutePath);

  if (ext === '.json') {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  }

  if (ext === '.vue') {
    return generateSchema(widgetName, absolutePath);
  }

  throw new Error(`不支持的输入格式: ${ext}，请提供 .vue 或 .json 文件`);
}

function main() {
  const [widgetName, inputPath, outputPath] = process.argv.slice(2);
  if (!widgetName || !inputPath) {
    console.log('用法：node wc/ai-schema-enricher/index.js <widget-name> <vue-file-or-schema-json> [output-path]');
    process.exit(1);
  }

  const baseSchema = loadSchema(widgetName, inputPath);
  const enrichedSchema = enrichSchema(baseSchema, widgetName);

  // 输出增强后的 schema
  const outPath = outputPath || `${widgetName}.schema.enriched.json`;
  fs.writeFileSync(outPath, JSON.stringify(enrichedSchema, null, 2));
  console.log(`\n✅ 已生成增强 schema: ${outPath}`);

  // 同时输出 AI Prompt，方便用户复制到大模型
  const promptPath = outPath.replace(/\.json$/, '.prompt.txt');
  const prompt = generateAiPrompt(enrichedSchema, widgetName, path.resolve(inputPath));
  fs.writeFileSync(promptPath, prompt);
  console.log(`📝 已生成 AI Prompt: ${promptPath}`);

  // 在控制台打印摘要
  console.log('\n========== 自动增强摘要 ==========');
  console.log(`物料名称: ${widgetName}`);
  console.log(`中文标题: ${enrichedSchema.title}`);
  console.log(`描述: ${enrichedSchema.description}`);
  if (enrichedSchema.properties) {
    console.log('\n字段语义:');
    Object.entries(enrichedSchema.properties).forEach(([name, cfg]) => {
      const extras = [];
      if (cfg.title) extras.push(`title=${cfg.title}`);
      if (cfg.enum) extras.push(`enum=${cfg.enum.join('/')}`);
      console.log(`  - ${name}: ${extras.join(', ') || '无规则匹配'}`);
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = { enrichSchema, enrichProp, inferWidgetTitle, generateAiPrompt };
