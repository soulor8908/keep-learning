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

// TypeScript 类型 -> JSON Schema type 映射（用于 defineProps<{...}>() 泛型语法）
const TS_TYPE_MAP = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  bool: 'boolean',
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Array: 'array',
  Object: 'object',
  any: 'string',
  unknown: 'string',
  null: 'null'
};

/**
 * 把 JS 风格的对象/数组字面量（单引号字符串）安全转成 JSON 字符串。
 * 逐字符扫描，仅在字符串字面量边界替换单引号，避免破坏字符串内部的单引号。
 * 例如 "it's" 内部的单引号不会被误转。
 */
function singleQuoteToJson(str) {
  let result = '';
  let i = 0;
  while (i < str.length) {
    const ch = str[i];

    // 双引号字符串：原样复制，处理转义
    if (ch === '"') {
      result += ch;
      i++;
      while (i < str.length) {
        const c = str[i];
        if (c === '\\' && i + 1 < str.length) {
          result += c + str[i + 1];
          i += 2;
          continue;
        }
        result += c;
        i++;
        if (c === '"') break;
      }
      continue;
    }

    // 单引号字符串：转成双引号字符串
    if (ch === "'") {
      result += '"';
      i++;
      while (i < str.length) {
        const c = str[i];
        if (c === '\\' && i + 1 < str.length) {
          const next = str[i + 1];
          if (next === "'") {
            // \' -> ' （JSON 双引号字符串里不需要转义单引号）
            result += "'";
            i += 2;
            continue;
          }
          result += c + next;
          i += 2;
          continue;
        }
        if (c === "'") {
          result += '"';
          i++;
          break;
        }
        if (c === '"') {
          // 字符串内部的双引号需要转义
          result += '\\"';
          i++;
          continue;
        }
        result += c;
        i++;
      }
      continue;
    }

    result += ch;
    i++;
  }
  return result;
}

/**
 * 尝试把 JS 字面量解析为 JS 值：先按 JSON 解析，失败再用单引号转换重试。
 * 仍失败则返回 null。
 */
function tryParseJsonLike(raw) {
  try { return JSON.parse(raw); } catch (_) { /* fallthrough */ }
  try { return JSON.parse(singleQuoteToJson(raw)); } catch (_) { return null; }
}

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

  // 数组/对象：先按 JSON 解析，失败再用单引号感知转换，避免破坏字符串内部单引号
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = tryParseJsonLike(trimmed);
    if (parsed !== null) return parsed;
    return trimmed;
  }

  // 处理 ({}) 这种箭头函数返回对象的写法
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner.startsWith('{') || inner.startsWith('[')) {
      const parsed = tryParseJsonLike(inner);
      if (parsed !== null) return parsed;
      return inner;
    }
  }

  return trimmed;
}

function extractPropsScript(source) {
  // 优先匹配 <script setup>（Vue3 组合式 API 定义 props 的位置）
  // 避免组件同时有 <script> 和 <script setup> 时只解析到无 props 的普通 <script>
  const setupMatch = source.match(/<script[^>]*\bsetup\b[^>]*>([\s\S]*?)<\/script>/);
  if (setupMatch) return setupMatch[1];
  // 回退到普通 <script>
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

    // 逗号（深度 0）作为字段分隔
    if (ch === ',' && depth === 0) {
      fields.push(body.slice(start, i));
      start = i + 1;
      continue;
    }

    // 分号（深度 0）：TS 接口字段以分号分隔（如 title?: string; count?: number）
    if (ch === ';' && depth === 0) {
      fields.push(body.slice(start, i));
      start = i + 1;
      continue;
    }

    // 换行（深度 0）：TS 接口字段以换行分隔。仅当下一段非空内容像
    // "标识符 ?:" 的新字段时才切分，避免把跨行的值（如联合类型 | string）误切。
    if (ch === '\n' && depth === 0) {
      const rest = body.slice(i + 1);
      if (/^\s*[\w$]+\s*\??\s*:/.test(rest)) {
        fields.push(body.slice(start, i));
        start = i + 1;
      }
    }
  }

  fields.push(body.slice(start));
  return fields.filter(f => f.trim());
}

/**
 * 把 TypeScript 类型字符串转成 JSON Schema type。
 * 支持：string/number/boolean 等基础类型、string[] 数组语法、Array<T> 泛型、
 * string | number 联合类型（返回数组）。
 */
function tsTypeToJsonType(tsType) {
  const t = tsType.trim().replace(/[;,]\s*$/, '');
  if (!t) return 'string';

  // 联合类型: string | number
  if (t.includes('|')) {
    const types = t
      .split('|')
      .map(s => tsTypeToJsonType(s.trim()))
      .filter(s => s && s !== 'string' || s === 'string');
    // 去重
    const unique = [...new Set(types)];
    return unique.length === 1 ? unique[0] : unique;
  }

  // string[] / number[] 等
  if (/^\w+\[\]$/.test(t)) {
    return 'array';
  }
  // Array<string> / Array<T>
  if (/^Array<.+>$/.test(t)) {
    return 'array';
  }
  // 对象类型字面量 { foo: string } 或 Record<...>
  if (t.startsWith('{') || /^Record<.+>$/.test(t)) {
    return 'object';
  }

  return TS_TYPE_MAP[t] || 'string';
}

/**
 * 提取 defineProps<{ ... }>() 泛型语法中的接口体（不含外层花括号）。
 */
function extractTsPropsBody(script) {
  const startIdx = script.search(/defineProps\s*<\s*\{/);
  if (startIdx === -1) return '';

  const braceIdx = script.indexOf('{', startIdx);
  if (braceIdx === -1) return '';

  const endIdx = findMatchedBrace(script, braceIdx);
  if (endIdx === -1) return '';

  return removeComments(script.slice(braceIdx + 1, endIdx));
}

/**
 * 提取 withDefaults(defineProps<{...}>(), { ... }) 中的默认值对象体。
 */
function extractWithDefaultsBody(script) {
  const m = script.match(/withDefaults\s*\(\s*defineProps[\s\S]*?\)\s*,\s*(\{)/);
  if (!m) return '';
  const braceIdx = m.index + m[0].length - 1;
  const endIdx = findMatchedBrace(script, braceIdx);
  if (endIdx === -1) return '';
  return removeComments(script.slice(braceIdx + 1, endIdx));
}

/**
 * 解析 defineProps<{...}>() 泛型语法的 props。
 * 支持：
 *   title?: string          -> { type: 'string' }
 *   count: number           -> { type: 'number', required: true }
 *   items?: string[]        -> { type: 'array' }
 *   tags?: Array<string>    -> { type: 'array' }
 *   flag?: string | number  -> { type: ['string','number'] }
 */
function parseTsProps(script) {
  const props = {};
  const body = extractTsPropsBody(script);
  if (!body) return props;

  const fields = splitTopLevelFields(body);
  fields.forEach(field => {
    // title?: string  /  title: string  /  title? : string
    const fieldMatch = field.match(/^\s*(\w+)\s*(\?)?\s*:\s*([\s\S]+?)\s*$/);
    if (!fieldMatch) return;

    const name = fieldMatch[1];
    const optional = !!fieldMatch[2];
    const typeStr = fieldMatch[3].replace(/[;,]\s*$/, '').trim();

    const schema = { type: tsTypeToJsonType(typeStr) };
    if (!optional) schema.required = true;
    props[name] = schema;
  });

  // 合并 withDefaults 提供的默认值
  const defaultsBody = extractWithDefaultsBody(script);
  if (defaultsBody) {
    const defaultFields = splitTopLevelFields(defaultsBody);
    defaultFields.forEach(field => {
      const fm = field.match(/^\s*(\w+)\s*:\s*([\s\S]+?)\s*$/);
      if (!fm) return;
      const name = fm[1];
      if (props[name]) {
        props[name].default = parseDefault(fm[2]);
      }
    });
  }

  return props;
}

function parseProps(script) {
  // TS 泛型语法: defineProps<{ title?: string }>() 或 withDefaults(defineProps<{...}>(), {...})
  if (/defineProps\s*</.test(script)) {
    return parseTsProps(script);
  }

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
    // 数组类型: type: [String, Number]
    const typeArrayMatch = rest.match(/type\s*:\s*\[([^\]]+)\]/);
    const typeMatch = rest.match(/type\s*:\s*(\w+)/);
    const defaultMatch = rest.match(/default\s*:\s*([^,\n]+)/);
    const requiredMatch = rest.match(/required\s*:\s*true/);

    const schema = {};
    if (typeArrayMatch) {
      const types = typeArrayMatch[1]
        .split(',')
        .map(t => t.trim())
        .map(t => TYPE_MAP[t] || t.toLowerCase())
        .filter(Boolean);
      schema.type = types.length === 1 ? types[0] : types;
    } else if (typeMatch) {
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
