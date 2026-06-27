/**
 * 根据 .vue 组件文件自动生成 schema.json
 *
 * 当前支持：
 * - Options API: props: { title: { type: String, default: 'xxx' } }
 * - Composition API: defineProps({ title: { type: String, default: 'xxx' } })
 * - <script setup> + TS 泛型 defineProps<{...}>() + withDefaults
 *
 * 解析策略：优先使用 @vue/compiler-sfc AST 解析（正确处理 setup/泛型/
 * withDefaults/多行注释/外部类型导入等复杂情况），不可用时回退到正则解析。
 * 安装：npm i -D @vue/compiler-sfc（可选，提升解析准确度）
 *
 * 局限：只能提取基础类型、默认值，无法自动推断业务标题/描述/枚举值，
 *       这些信息建议通过 AI 辅助或手动补充。
 */
const fs = require('fs');
const path = require('path');

// 尝试加载 @vue/compiler-sfc（可选依赖，提供 AST 解析能力）
// 不可用时回退到正则解析（已支持大部分场景，但无法处理外部类型导入等复杂情况）
let vueCompilerSfc = null;
try {
  vueCompilerSfc = require('@vue/compiler-sfc');
} catch (_) {
  // @vue/compiler-sfc 未安装，回退到正则解析
}

// 尝试加载 @babel/parser（@vue/compiler-sfc 的传递依赖，编译器在则它必在）
// 用于解析 compileScript 输出的编译后代码，准确定位归一化的 props 选项对象，
// 避免对原始源码做脆弱的正则匹配（修复 P0-7）。不可用时 extractPropsViaAST 回退正则。
let babelParser = null;
if (vueCompilerSfc) {
  try {
    babelParser = require('@babel/parser');
  } catch (_) {
    // @babel/parser 不可用，回退到正则解析
  }
}

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

/**
 * 使用 @vue/compiler-sfc 解析 SFC，提取 props 定义。
 *
 * 实现思路：先用 compileScript 把 <script setup> 的 defineProps / defineProps<泛型> /
 * withDefaults 以及 Options API 的 props 全部归一化编译为统一形态：
 *   export default { props: { 名称: { type: 构造器, required: 布尔, default: 值或工厂 } } }
 *   或 export default _defineComponent({ props: {...}, setup(...) {...} })
 * 再用 @babel/parser 解析该编译后代码，定位 props 选项对象并逐字段求值，
 * 避免对原始源码做脆弱的正则匹配（修复 P0-7）。
 * withDefaults 的默认值会被 compileScript 合并进 props（修复 P2-25）。
 *
 * 注意：实测 compileScript 并不会把 props 写到 script.props 字段（该字段为 undefined），
 * 而是输出到编译后的 content 字符串里，故需对 content 做二次解析。
 *
 * @param {string} source .vue 文件源码
 * @returns {Object|null} props 对象，解析失败返回 null（调用方回退到正则）
 */
function extractPropsViaAST(source) {
  if (!vueCompilerSfc) return null;
  try {
    const { parse, compileScript } = vueCompilerSfc;
    const { descriptor } = parse(source, { filename: 'component.vue' });
    // compileScript 统一处理 <script setup> 与普通 <script>，输出归一化后的代码
    const script = compileScript(descriptor, { id: 'schema-gen' });
    const compiled = script && script.content;
    if (!compiled) return null;

    // 优先用 @babel/parser 解析编译后代码的 AST，准确提取 props 选项
    if (babelParser) {
      const astProps = extractPropsFromCompiledCode(compiled);
      if (astProps && Object.keys(astProps).length > 0) return astProps;
    }
    // @babel/parser 不可用或未提取到：返回 null，由调用方对原始源码回退正则解析
    return null;
  } catch (e) {
    // AST 解析失败（语法不兼容、版本差异等），回退到正则
    return null;
  }
}

/**
 * 解析 compileScript 输出的编译后代码，定位 props 选项对象并求值每个 prop 定义。
 * @param {string} code 编译后 JS 代码
 * @returns {Object|null} { 名称: schemaProp } 或 null
 */
function extractPropsFromCompiledCode(code) {
  if (!babelParser) return null;
  let ast;
  try {
    ast = babelParser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript']
    });
  } catch (_) {
    return null;
  }
  const propsNode = findPropsOptionNode(ast.program.body);
  if (!propsNode || propsNode.type !== 'ObjectExpression') return null;
  const props = {};
  for (const prop of propsNode.properties) {
    if (prop.type !== 'ObjectProperty' && prop.type !== 'Property') continue;
    const name = prop.key && (prop.key.name || prop.key.value);
    if (!name) continue;
    const def = evalPropDef(prop.value);
    if (!def) continue;
    props[name] = normalizeAstProp(name, def);
  }
  return props;
}

/**
 * 在顶层语句中查找 export default 选项对象里的 props 属性节点。
 * 支持两种编译后形态：
 *   export default { props: {...} }                       （Options API）
 *   export default _defineComponent({ props: {...}, ... }) （<script setup>）
 * @param {Array} body 顶层语句数组
 * @returns {Object|null} props 选项的值节点（通常是 ObjectExpression）
 */
function findPropsOptionNode(body) {
  for (const stmt of body) {
    if (stmt.type !== 'ExportDefaultDeclaration') continue;
    const decl = stmt.declaration;
    let optionsNode = null;
    if (decl.type === 'ObjectExpression') {
      optionsNode = decl;
    } else if (decl.type === 'CallExpression' && decl.arguments.length > 0) {
      const arg = decl.arguments[0];
      if (arg.type === 'ObjectExpression') optionsNode = arg;
    }
    if (!optionsNode) continue;
    for (const p of optionsNode.properties) {
      if ((p.type === 'ObjectProperty' || p.type === 'Property') &&
          p.key && (p.key.name === 'props' || p.key.value === 'props')) {
        return p.value;
      }
    }
  }
  return null;
}

/**
 * 把单个 prop 定义节点求值为普通对象 { type, required, default }。
 * 支持对象形式 `{ type: String, required: false, default: 'x' }` 与简写 `String`。
 * @param {Object} def prop 定值的 AST 节点
 * @returns {Object|null}
 */
function evalPropDef(def) {
  if (!def) return null;
  if (def.type === 'ObjectExpression') {
    const result = {};
    for (const p of def.properties) {
      if (p.type !== 'ObjectProperty' && p.type !== 'Property') continue;
      const key = p.key && (p.key.name || p.key.value);
      if (!key) continue;
      result[key] = evalNode(p.value);
    }
    return result;
  }
  if (def.type === 'Identifier') {
    // 简写形式：prop: String —— 整个标识符即类型构造器
    return { type: def.name };
  }
  return null;
}

/**
 * 最小化的 AST 字面量求值器：把编译后 props 中的字面量/工厂函数求值为 JS 值。
 * 仅处理 props 定义里常见的节点类型，无法识别的返回 undefined（由调用方忽略）。
 */
function evalNode(node) {
  if (!node) return undefined;
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'Identifier':
      // undefined 字面量；其它标识符（String/Number/Array/Object 等构造器）按名字返回
      return node.name === 'undefined' ? undefined : node.name;
    case 'UnaryExpression':
      // 处理负数字面量，如 -1
      if (node.operator === '-') {
        const v = evalNode(node.argument);
        return typeof v === 'number' ? -v : undefined;
      }
      return undefined;
    case 'ArrayExpression':
      return node.elements.map(e => (e === null ? null : evalNode(e)));
    case 'ObjectExpression': {
      const obj = {};
      for (const p of node.properties) {
        if (p.type !== 'ObjectProperty' && p.type !== 'Property') continue;
        const k = p.key && (p.key.name || p.key.value);
        if (k) obj[k] = evalNode(p.value);
      }
      return obj;
    }
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      // props 默认值工厂函数：求值其返回表达式，取实际值
      return evalFunctionReturn(node);
    case 'ParenthesizedExpression':
      // 带括号的表达式体（部分 babel 配置会保留括号节点）
      return evalNode(node.expression);
    case 'TemplateLiteral':
      // 无插值的模板字符串
      if (node.expressions.length === 0 && node.quasis.length === 1) {
        return node.quasis[0].value.cooked;
      }
      return undefined;
    default:
      return undefined;
  }
}

/**
 * 求值函数体返回值：支持箭头函数表达式体、箭头/普通函数块体（取首个 return）。
 */
function evalFunctionReturn(node) {
  const body = node.body;
  if (!body) return undefined;
  if (body.type === 'BlockStatement') {
    const ret = body.body.find(s => s.type === 'ReturnStatement');
    return ret ? evalNode(ret.argument) : undefined;
  }
  // 表达式体（可能被括号包裹，evalNode 内部已处理 ParenthesizedExpression）
  return evalNode(body);
}

/**
 * 规范化 AST 求值后的单个 prop 定义为 schema 格式。
 * compileScript 归一化后 prop 定义形如：
 *   { type: 'String' | ['String','Number'], required: true|false, default: 值 }
 * 其中 type 是构造器名字符串或其数组，default 已对工厂函数求值取实际值。
 */
function normalizeAstProp(name, def) {
  const schema = {};
  if (def && def.type !== undefined && def.type !== null) {
    if (Array.isArray(def.type)) {
      const types = def.type
        .map(t => mapConstructorName(t))
        .filter(t => t);
      schema.type = types.length === 1 ? types[0] : types;
    } else {
      schema.type = mapConstructorName(def.type);
    }
  }
  if (def && def.required) schema.required = true;
  // 仅在 default 键存在且已成功求值（非 undefined）时写入，避免写入 undefined
  if (def && 'default' in def && def.default !== undefined) {
    schema.default = def.default;
  }
  return schema;
}

/**
 * 把构造器名字符串（String/Number/Boolean/Array/Object 或 TS 基础类型）映射为 JSON Schema type。
 * 无法识别的构造器名按小写兜底为字符串类型。
 */
function mapConstructorName(name) {
  if (name === undefined || name === null) return undefined;
  const typeName = typeof name === 'string' ? name : (name && name.name) || String(name);
  return TS_TYPE_MAP[typeName] || TYPE_MAP[typeName] ||
    (typeof typeName === 'string' ? typeName.toLowerCase() : 'string');
}

/**
 * PascalCase 组件名转 kebab-case（去前缀用）
 * ElButton → button，ElTableColumn → table-column
 */
function pascalToKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * 扫描 .vue 源码中使用的 ElementPlus/ElementUI 组件，收集去前缀、去重的组件名列表。
 *
 * 扫描范围（M3 增强）：
 * 1. <template> 内的 <el-xxx> kebab-case 标签
 * 2. <template> 内的 <ElXxx> PascalCase 标签
 * 3. <template> 内的 <component :is="'el-xxx'"> / <component :is="'ElXxx'"> 动态组件
 * 4. <script> 内的 h('el-xxx') / h('ElXxx') 渲染函数调用
 * 5. <script> 内的 resolveComponent('el-xxx') / resolveComponent('ElXxx')
 *
 * 用于自动生成 schema.uiDependencies.components 和构建期 __WIDGET_UI_DEPS__ 注入，
 * 让基座按声明精准加载 UI 组件，wrapper 按需注册。
 *
 * @param {string} source .vue 文件源码
 * @returns {string[]} 去前缀（去 el-）、去重的组件名数组，如 ['card','button','table-column']
 */
function extractUiDependencies(source) {
  if (!source) return [];
  const set = new Set();
  let m;

  // ─── 1. 扫描 <template> 块 ───
  const tplMatch = source.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  const tpl = tplMatch ? tplMatch[1] : source;
  // 移除 HTML 注释，避免注释中的标签被计入
  const cleanedTpl = tpl.replace(/<!--[\s\S]*?-->/g, '');

  // 1a. <el-xxx> kebab-case 开标签
  const kebabRe = /<el-([a-z][a-z0-9-]*)\b/g;
  while ((m = kebabRe.exec(cleanedTpl)) !== null) {
    set.add(m[1]);
  }

  // 1b. <ElXxx> PascalCase 开标签（不匹配 </El 闭合标签）
  const pascalRe = /<El([A-Z][a-zA-Z0-9]*)\b/g;
  while ((m = pascalRe.exec(cleanedTpl)) !== null) {
    set.add(pascalToKebab(m[1]));
  }

  // 1c. <component :is="'el-xxx'"> 或 :is="'ElXxx'" 动态组件
  // :is 的值是 Vue 表达式，字符串字面量含内层引号（如 :is="'el-button'"）
  // ['"]? 匹配可选的内层引号，使 el-xxx / ElXxx 直接跟在引号后也能命中
  const dynRe = /:is\s*=\s*["']\s*['"]?\s*(?:el-([a-z][a-z0-9-]*)|El([A-Z][a-zA-Z0-9]*))\s*['"]?\s*["']/g;
  while ((m = dynRe.exec(cleanedTpl)) !== null) {
    set.add(m[1] || pascalToKebab(m[2]));
  }

  // ─── 2. 扫描 <script> 块 ───
  const scriptMatch = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const script = scriptMatch ? scriptMatch[1] : '';

  // 2a. h('el-xxx') / h("ElXxx") 渲染函数调用
  // 匹配 h( 后跟引号包裹的组件名（kebab 或 PascalCase）
  const hRe = /\bh\s*\(\s*['"](?:el-([a-z][a-z0-9-]*)|El([A-Z][a-zA-Z0-9]*))['"]/g;
  while ((m = hRe.exec(script)) !== null) {
    set.add(m[1] || pascalToKebab(m[2]));
  }

  // 2b. resolveComponent('el-xxx') / resolveDynamicComponent('ElXxx')
  const rcRe = /(?:resolveComponent|resolveDynamicComponent)\s*\(\s*['"](?:el-([a-z][a-z0-9-]*)|El([A-Z][a-zA-Z0-9]*))['"]/g;
  while ((m = rcRe.exec(script)) !== null) {
    set.add(m[1] || pascalToKebab(m[2]));
  }

  return Array.from(set);
}

// UI 库默认版本与 lib 推断（与 docs/elementui-on-demand-loading.md 4.1 节一致）
const UI_LIB_DEFAULTS = {
  'element-ui': { version: '^2.15.0' },
  'element-plus': { version: '^2.7.0' }
};

function inferUiLib(vueVersion) {
  // vueVersion '2' → element-ui，'3' 或其它 → element-plus
  return vueVersion === '2' ? 'element-ui' : 'element-plus';
}

function generateSchema(widgetName, componentPath, options = {}) {
  const absolutePath = path.resolve(componentPath);
  const source = fs.readFileSync(absolutePath, 'utf-8');
  // 优先使用 @vue/compiler-sfc AST 解析（处理 setup/泛型/withDefaults/外部类型导入）
  // 不可用或解析失败时回退到正则解析
  let props = extractPropsViaAST(source);
  if (!props) {
    const script = extractPropsScript(source);
    props = parseProps(script);
  }

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

  // uiDependencies 自动扫描：仅当模板含 <el-*> 时写入，保持无 UI 依赖物料的 schema 与旧版一致
  const uiComponents = extractUiDependencies(source);
  if (uiComponents.length > 0) {
    const lib = options.uiLib || inferUiLib(options.vueVersion);
    const version = options.uiVersion || (UI_LIB_DEFAULTS[lib] ? UI_LIB_DEFAULTS[lib].version : '^2.7.0');
    schema.uiDependencies = {
      lib,
      version,
      components: uiComponents,
      styles: options.uiStyles || ['base']
    };
    if (options.uiFull === true) schema.uiDependencies.full = true;
  }

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
  extractUiDependencies,
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
