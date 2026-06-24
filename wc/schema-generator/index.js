/**
 * 根据 .vue 组件文件自动生成 schema.json
 *
 * 当前支持：
 * - Options API: props: { title: { type: String, default: 'xxx' } }
 * - Composition API: defineProps({ title: { type: String, default: 'xxx' } })
 *
 * 局限：只能提取基础类型、默认值，无法自动推断业务标题/描述/枚举值，
 *       这些信息建议通过 AI 辅助或手动补充。
 */
const fs = require('fs');
const path = require('path');

// 物料布局默认值：统一常量，避免多处硬编码导致不一致
const DEFAULT_LAYOUT = {
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 2 }
};

const TYPE_MAP = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Array: 'array',
  Object: 'object'
};

function parseDefault(raw) {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'undefined') return undefined;

  // 函数式默认值: () => ({})
  const arrowMatch = trimmed.match(/^\(\s*\)\s*=>\s*(.+)$/);
  if (arrowMatch) {
    return parseDefault(arrowMatch[1]);
  }

  // 字符串
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // 布尔
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // null
  if (trimmed === 'null') return null;

  // 数字
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // 数组/对象：尝试 JSON.parse
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed.replace(/'/g, '"'));
    } catch {
      return trimmed;
    }
  }

  // 处理 ({}) 这种箭头函数返回对象的写法
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner.startsWith('{') || inner.startsWith('[')) {
      try {
        return JSON.parse(inner.replace(/'/g, '"'));
      } catch {
        return inner;
      }
    }
  }

  return trimmed;
}

function extractPropsScript(source) {
  // 提取 <script> 内容
  const scriptMatch = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return scriptMatch ? scriptMatch[1] : source;
}

function removeComments(str) {
  return str
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function findMatchedBrace(script, startIdx) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let commentType = '';

  for (let i = startIdx; i < script.length; i++) {
    const ch = script[i];
    const prev = script[i - 1];

    if (inComment) {
      if (commentType === '//' && ch === '\n') inComment = false;
      if (commentType === '/*' && ch === '*' && script[i + 1] === '/') {
        inComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (ch === stringChar && prev !== '\\') inString = false;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '/' && script[i + 1] === '/') {
      inComment = true;
      commentType = '//';
      i++;
      continue;
    }

    if (ch === '/' && script[i + 1] === '*') {
      inComment = true;
      commentType = '/*';
      i++;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function extractPropsBody(script) {
  const propsIdx = script.search(/(?:props|defineProps)\s*[:\(]/);
  if (propsIdx === -1) return '';

  // 找到 props: 或 defineProps( 之后的第一个 {
  const braceIdx = script.indexOf('{', propsIdx);
  if (braceIdx === -1) return '';

  const endIdx = findMatchedBrace(script, braceIdx);
  if (endIdx === -1) return '';

  return removeComments(script.slice(braceIdx + 1, endIdx));
}

function splitTopLevelFields(body) {
  const fields = [];
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let start = 0;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const prev = body[i - 1];

    if (inString) {
      if (ch === stringChar && prev !== '\\') inString = false;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '{' || ch === '(' || ch === '[') depth++;
    if (ch === '}' || ch === ')' || ch === ']') depth--;

    if (ch === ',' && depth === 0) {
      fields.push(body.slice(start, i));
      start = i + 1;
    }
  }

  fields.push(body.slice(start));
  return fields.filter(f => f.trim());
}

function parseProps(script) {
  const props = {};
  const body = extractPropsBody(script);
  if (!body) return props;

  const fields = splitTopLevelFields(body);

  fields.forEach(field => {
    const fieldMatch = field.match(/^\s*(\w+)\s*:\s*(.+)$/s);
    if (!fieldMatch) return;

    const name = fieldMatch[1];
    const rest = fieldMatch[2].trim();

    // 简写: title: String
    const shorthandMatch = rest.match(/^(String|Number|Boolean|Array|Object)$/);
    if (shorthandMatch) {
      props[name] = { type: TYPE_MAP[shorthandMatch[1]] };
      return;
    }

    // 对象形式: { type: String, default: 'xxx' }
    const typeMatch = rest.match(/type\s*:\s*(\w+)/);
    const defaultMatch = rest.match(/default\s*:\s*([^,\n]+)/);
    const requiredMatch = rest.match(/required\s*:\s*true/);

    const schema = {};
    if (typeMatch) {
      schema.type = TYPE_MAP[typeMatch[1]] || 'string';
    }
    if (defaultMatch) {
      schema.default = parseDefault(defaultMatch[1]);
    }
    if (requiredMatch) {
      schema.required = true;
    }

    props[name] = schema;
  });

  return props;
}

function generateSchema(widgetName, componentPath, options = {}) {
  const absolutePath = path.resolve(componentPath);
  const source = fs.readFileSync(absolutePath, 'utf-8');
  const script = extractPropsScript(source);
  const props = parseProps(script);

  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    name: widgetName,
    title: options.title || widgetName,
    description: options.description || `Auto-generated schema for ${widgetName}`,
    type: 'object',
    properties: props,
    required: Object.entries(props)
      .filter(([, cfg]) => cfg.required)
      .map(([name]) => name),
    layout: {
      defaultSize: options.defaultSize || DEFAULT_LAYOUT.defaultSize,
      minSize: options.minSize || DEFAULT_LAYOUT.minSize
    }
  };

  return schema;
}

function writeSchema(widgetName, componentPath, outputPath, options) {
  const schema = generateSchema(widgetName, componentPath, options);
  fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
  return schema;
}

module.exports = {
  generateSchema,
  writeSchema,
  DEFAULT_LAYOUT
};

// CLI 用法
if (require.main === module) {
  const [, , widgetName, componentPath, outputPath] = process.argv;
  if (!widgetName || !componentPath) {
    console.log('Usage: node schema-generator/index.js <widget-name> <component-path> [output-path]');
    process.exit(1);
  }
  const out = outputPath || `${widgetName}.schema.json`;
  writeSchema(widgetName, componentPath, out);
  console.log(`Schema written to ${out}`);
}
