#!/usr/bin/env node
/**
 * CSS 命名空间检查器
 *
 * 检查样式文件中的 CSS 选择器是否都包含指定的命名空间前缀，
 * 防止不同物料之间的全局样式冲突。
 *
 * 支持的文件类型：
 * - .vue / .html：提取 <style> 块（含 scoped 属性识别）
 * - .css / .scss / .less / .styl：整文件作为一个样式块
 *
 * 用法：
 *   node wc/css-namespace-checker/index.js <file-or-dir> [widget-name]
 *
 * 示例：
 *   node wc/css-namespace-checker/index.js demo/vue2-widget-lib/src/components/SalesPanel.vue bi-sales-panel
 *   node wc/css-namespace-checker/index.js demo/vue2-widget-lib/src/components
 *   node wc/css-namespace-checker/index.js h5-widget/src/weather-card.css bi-weather-card
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_GLOBAL_SELECTORS = [
  ':host',
  ':root',
  'html',
  'body',
  '*',
  '::before',
  '::after',
  '::v-deep',
  '::v-global',
  '::v-slotted',
  '::v-enter',
  '::v-leave',
  '>>',
  '/deep/',
  ':deep(',
  ':global(',
  ':slotted(',
  '@media',
  '@supports',
  '@keyframes',
  '@font-face',
  '@import',
  '@charset',
  '@namespace'
];

function extractStyleBlocks(source) {
  const blocks = [];
  const regex = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const attrs = match[1];
    const content = match[2];
    const scoped = /scoped/i.test(attrs);
    const langMatch = attrs.match(/lang=["']([^"']+)["']/i);
    const lang = langMatch ? langMatch[1] : 'css';
    blocks.push({ scoped, lang, content, start: match.index, end: regex.lastIndex });
  }
  return blocks;
}

function extractRules(css) {
  const rules = [];
  let depth = 0;
  let buffer = '';
  let selectors = '';
  // 记录每层嵌套的选择器，用于拼接原生 CSS nesting / SCSS & 的完整选择器
  const selectorStack = [];
  let inSelector = true;

  let inString = false;
  let stringChar = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];

    // 跳过字符串字面量内容（CSS 中 content: "..." 可能含花括号）
    if (inString) {
      if (ch === stringChar && css[i - 1] !== '\\') inString = false;
      buffer += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      buffer += ch;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) {
        selectors = buffer.trim();
        buffer = '';
        inSelector = false;
        selectorStack.push(selectors);
      } else {
        const parentSelector = selectorStack[selectorStack.length - 1] || '';
        // @media / @supports 内部内容作为原始 CSS 保留到 declarations，
        // 由下方 flattened 阶段递归 extractRules 重新解析，
        // 不走嵌套规则拼接（否则内部选择器会被错误拼接成 "@media ... .xxx"）
        if (parentSelector.startsWith('@media') || parentSelector.startsWith('@supports')) {
          buffer += ch;
          depth++;
          continue;
        }
        // 原生 CSS nesting / SCSS 嵌套：depth>0 时遇到 { 说明是嵌套规则
        // buffer 中是嵌套选择器（可能含 &），需与父选择器拼接
        const nestedSelector = buffer.trim();
        buffer = '';
        if (nestedSelector) {
          // SCSS & 语法：& 替换为父选择器；否则用后代选择器拼接
          const resolved = nestedSelector.includes('&')
            ? nestedSelector.replace(/&/g, parentSelector)
            : `${parentSelector} ${nestedSelector}`;
          selectorStack.push(resolved);
          // 嵌套规则本身也需检查命名空间
          rules.push({ selectors: resolved, declarations: '', nested: true });
        } else {
          selectorStack.push(selectors);
        }
      }
      depth++;
      continue;
    }

    if (ch === '}') {
      const parentSelector = selectorStack[selectorStack.length - 1] || '';
      const isInsideAtRule = parentSelector.startsWith('@media') || parentSelector.startsWith('@supports');
      // @media 内部的闭合括号保留到 buffer（非 @media 规则自身的闭合括号）
      if (isInsideAtRule && depth > 1) {
        buffer += ch;
        depth--;
        continue;
      }
      depth--;
      if (depth === 0) {
        const declarations = buffer.trim();
        rules.push({ selectors, declarations });
        buffer = '';
        inSelector = true;
        selectorStack.pop();
      } else {
        // 嵌套规则结束：把 buffer 作为声明（可能为空或含子规则）
        const declarations = buffer.trim();
        if (declarations && !declarations.includes('{')) {
          // 纯声明，附加到最近的嵌套规则
          const lastNested = [...rules].reverse().find(r => r.nested);
          if (lastNested) lastNested.declarations = declarations;
        }
        buffer = '';
        selectorStack.pop();
      }
      continue;
    }

    buffer += ch;
  }

  // 处理嵌套规则：@media / @supports 递归提取内部选择器；
  // @keyframes / @font-face / @page 内部是关键帧/字体声明，不是样式选择器，直接跳过
  const flattened = [];
  rules.forEach(rule => {
    if (rule.selectors.startsWith('@media') || rule.selectors.startsWith('@supports')) {
      const innerRules = extractRules(rule.declarations);
      innerRules.forEach(inner => {
        flattened.push({
          selectors: `${rule.selectors} { ${inner.selectors} }`,
          declarations: inner.declarations,
          nested: true
        });
      });
    } else if (
      rule.selectors.startsWith('@keyframes') ||
      rule.selectors.startsWith('@-webkit-keyframes') ||
      rule.selectors.startsWith('@font-face') ||
      rule.selectors.startsWith('@page')
    ) {
      // 关键帧/字体声明内部的选择器（0%/from/to/@font-face 内部）不是样式选择器，跳过
      return;
    } else {
      flattened.push(rule);
    }
  });

  return flattened;
}

/**
 * 用 postcss AST 解析 CSS 提取规则，修复 P2-26（不支持原生 nesting）。
 *
 * 与手写 extractRules 的差异：
 * - 通过 AST 准确识别 Rule / AtRule / Declaration，避免状态机在复杂 nesting 下的拼接错误
 * - 原生 CSS nesting（& 选择器）通过父级 Rule 选择器替换 & 得到完整选择器路径
 * - @media / @supports 内部规则递归遍历，选择器以 "@media ..." 前缀包装（兼容现有白名单判断）
 * - @keyframes / @font-face / @page 等内部跳过（非样式选择器）
 *
 * 解析失败（SCSS/Less 非标准语法、严重语法错误）或 postcss 不可用时返回 null，
 * 由调用方回退到 extractRules 手写实现。
 */
function extractRulesViaPostcss(css) {
  let postcss;
  try {
    postcss = require('postcss');
  } catch (e) {
    return null; // postcss 不可用，触发回退
  }

  let root;
  try {
    root = postcss.parse(css);
  } catch (e) {
    // postcss 解析失败（SCSS/Less 非标准语法、未闭合块等），返回 null 触发回退
    return null;
  }

  const rules = [];

  // 这些 at-rule 内部不是样式选择器（关键帧百分比 / 字体描述 / 计数器样式等），跳过
  const SKIP_ATRULES = new Set([
    'keyframes',
    '-webkit-keyframes',
    '-moz-keyframes',
    'font-face',
    'page',
    'counter-style',
    'font-feature-values',
    'property',
    'color-profile'
  ]);

  // 拼接 at-rule 文本：@media (max-width: 600px) / @supports (display: grid) 等
  function atRuleText(node) {
    return node.params ? `@${node.name} ${node.params}` : `@${node.name}`;
  }

  // 取父链中最近的 Rule 选择器（用于 & 替换或后代拼接）
  function nearestRuleSelector(parentChain) {
    for (let i = parentChain.length - 1; i >= 0; i--) {
      if (parentChain[i].type === 'rule') return parentChain[i].selector;
    }
    return null;
  }

  // 判断父链中是否存在 Rule 节点（用于标识 nesting）
  function hasRuleAncestor(parentChain) {
    return parentChain.some(p => p.type === 'rule');
  }

  // 解析当前 Rule 的完整选择器：
  // 1. 含 & 时替换 & 为父 Rule 选择器（SCSS / 原生 nesting 语法）
  // 2. 不含 & 但直接父节点是 Rule 时，按后代选择器拼接（原生 nesting 隐式后代）
  // 3. 否则原样返回（顶层规则 / @media 内的顶层规则）
  function resolveSelector(parentChain, selector) {
    const parentRule = nearestRuleSelector(parentChain);
    if (selector.includes('&') && parentRule) {
      return selector.replace(/&/g, parentRule);
    }
    const directParent = parentChain[parentChain.length - 1];
    if (parentRule && directParent && directParent.type === 'rule') {
      return `${parentRule} ${selector}`;
    }
    return selector;
  }

  // 用 at-rule 前缀包装选择器：单层 → "@media (...) { selector }"，
  // 多层 at-rule 嵌套按层级包裹（兼容现有"@media 前缀命中白名单"的判断逻辑）
  function wrapWithAtRules(parentChain, selector) {
    const atRuleTexts = parentChain
      .filter(p => p.type === 'atrule')
      .map(p => p.text);
    if (atRuleTexts.length === 0) return selector;
    const open = atRuleTexts.join(' { ') + ' { ';
    const close = ' }'.repeat(atRuleTexts.length);
    return `${open}${selector}${close}`;
  }

  // 收集 Rule 节点直接子声明（不递归到嵌套规则），用于调试输出
  function extractDeclarations(ruleNode) {
    const decls = [];
    ruleNode.each(child => {
      if (child.type === 'decl') {
        const important = child.important ? ' !important' : '';
        decls.push(`${child.prop}: ${child.value}${important};`);
      }
    });
    return decls.join(' ');
  }

  // 递归遍历 AST，按 Rule / AtRule 分别处理
  function walk(node, parentChain) {
    node.each(child => {
      if (child.type === 'rule') {
        const resolved = resolveSelector(parentChain, child.selector);
        const fullSelector = wrapWithAtRules(parentChain, resolved);
        const declarations = extractDeclarations(child);
        const nested = hasRuleAncestor(parentChain) || parentChain.some(p => p.type === 'atrule');
        rules.push({ selectors: fullSelector, declarations, nested });
        // 递归处理嵌套规则，把当前已解析的选择器作为父选择器入栈
        walk(child, [...parentChain, { type: 'rule', selector: resolved }]);
      } else if (child.type === 'atrule') {
        if (SKIP_ATRULES.has(child.name)) {
          return; // 关键帧 / 字体声明内部不是样式选择器，跳过
        }
        walk(child, [...parentChain, { type: 'atrule', text: atRuleText(child) }]);
      }
      // declaration / comment 节点不参与选择器提取
    });
  }

  walk(root, []);
  return rules;
}

function isAllowedSelector(selector, namespaceClass) {
  const trimmed = selector.trim();
  if (!trimmed) return true;

  // 伪类 / 深度选择器
  if (ALLOWED_GLOBAL_SELECTORS.some(s => trimmed === s || trimmed.startsWith(s))) {
    return true;
  }

  // 每个逗号分隔的选择器片段必须以命名空间类开头（修复 P1-14）。
  // 旧逻辑用 includes 判断，会把 `.title .bi-sales-panel` 这类首 token 非命名空间
  // 的选择器误判为合法（只要字符串里出现命名空间子串就放行）。
  // 现改为取选择器首个 token（按后代/子/兄弟组合器 + 属性选择器边界切分），
  // 要求它以 `.${namespaceClass}` 开头：
  //   合法：.bi-sales-panel / .bi-sales-panel .title / .bi-sales-panel-title (BEM) / .bi-sales-panel:hover
  //   违规：.title .bi-sales-panel / .other > .bi-sales-panel / .title
  if (namespaceClass) {
    const firstToken = trimmed.split(/[\s>+~\[:]/)[0] || '';
    if (firstToken.startsWith(`.${namespaceClass}`)) {
      return true;
    }
  }

  return false;
}

function checkFile(filePath, namespace) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  // 确定样式块来源：
  // - .vue / .html：提取 <style> 块（可能多个，含 scoped 属性）
  // - .css / .scss / .less / .styl：整文件作为一个样式块
  let styleBlocks;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.vue' || ext === '.html' || ext === '.htm') {
    styleBlocks = extractStyleBlocks(source);
  } else if (ext === '.css' || ext === '.scss' || ext === '.less' || ext === '.styl') {
    const lang = ext === '.styl' ? 'stylus' : ext.slice(1);
    styleBlocks = [{ scoped: false, lang, content: source, start: 0, end: source.length }];
  } else {
    // 其它文件类型（如 .js）不检查
    return issues;
  }

  styleBlocks.forEach((block, idx) => {
    if (block.lang !== 'css' && block.lang !== 'scss' && block.lang !== 'less' && block.lang !== 'stylus') {
      return;
    }

    // 优先用 postcss AST 提取规则（准确支持原生 nesting & 选择器）；
    // postcss 解析失败（SCSS/Less 非标准语法、未闭合块等）时回退到手写 extractRules
    let rules = extractRulesViaPostcss(block.content);
    if (rules === null) {
      rules = extractRules(block.content);
    }
    rules.forEach(rule => {
      const selectorList = rule.selectors.split(',');
      selectorList.forEach(selector => {
        if (!isAllowedSelector(selector, namespace)) {
          issues.push({
            file: filePath,
            selector: selector.trim(),
            rule: rule.selectors.trim(),
            styleBlockIndex: idx,
            scoped: block.scoped
          });
        }
      });
    });
  });

  return issues;
}

// 支持的样式文件扩展名（.vue 含 <style> 块，.css/.scss 等整文件作为样式块）
const STYLE_EXTENSIONS = ['.vue', '.html', '.htm', '.css', '.scss', '.less', '.styl'];

function findStyleFiles(dir) {
  const files = [];
  function walk(current) {
    const stat = fs.statSync(current);
    if (stat.isFile() && STYLE_EXTENSIONS.includes(path.extname(current).toLowerCase())) {
      files.push(current);
      return;
    }
    if (stat.isDirectory()) {
      fs.readdirSync(current).forEach(child => {
        walk(path.join(current, child));
      });
    }
  }
  walk(dir);
  return files;
}

// 向后兼容别名（旧代码可能引用 findVueFiles）
const findVueFiles = findStyleFiles;

/**
 * 扫描文件或目录，聚合所有命名空间问题（供构建插件调用）
 * @param {string} target 文件或目录绝对路径
 * @param {string} namespace 命名空间类名（如 bi-sales-panel）
 * @returns {{issues: Array, files: number}}
 */
function checkTarget(target, namespace) {
  const targetPath = path.resolve(target);
  if (!fs.existsSync(targetPath)) {
    return { issues: [], files: 0 };
  }
  const files = fs.statSync(targetPath).isDirectory() ? findStyleFiles(targetPath) : [targetPath];
  const issues = [];
  files.forEach(file => {
    // 目录扫描时按文件名推断命名空间；单文件用传入的 namespace
    const ns = namespace || inferNamespace(file);
    issues.push(...checkFile(file, ns));
  });
  return { issues, files: files.length };
}

/**
 * 格式化扫描结果为可读字符串（供构建插件输出）
 * @param {Array} issues
 * @returns {string}
 */
function formatIssues(issues) {
  if (!issues || issues.length === 0) return '';
  const byFile = new Map();
  issues.forEach(i => {
    if (!byFile.has(i.file)) byFile.set(i.file, []);
    byFile.get(i.file).push(i);
  });
  const lines = [];
  byFile.forEach((fileIssues, file) => {
    lines.push(`  ❌ ${path.relative(process.cwd(), file)}`);
    fileIssues.forEach(i => {
      lines.push(`     选择器未加命名空间: "${i.selector}"`);
      lines.push(`     所在规则: ${i.rule}`);
      if (i.scoped) {
        lines.push(`     提示: 该样式块已开启 scoped，但仍建议以 .${inferNamespace(file)} 开头`);
      }
    });
  });
  lines.push(`  总计: ${issues.length} 个命名空间问题`);
  return lines.join('\n');
}

function inferNamespace(filePath) {
  // 去除已知样式文件扩展名（.vue/.css/.scss/.less/.styl/.html）
  const ext = path.extname(filePath);
  const basename = ext ? path.basename(filePath, ext) : path.basename(filePath);
  // 常见命名：SalesPanel.vue / sales-panel.css -> bi-sales-panel
  const kebab = basename
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
  return `bi-${kebab}`;
}

function main() {
  const [target, namespaceArg] = process.argv.slice(2);
  if (!target) {
    console.log('用法：node wc/css-namespace-checker/index.js <vue-file-or-dir> [widget-name]');
    process.exit(1);
  }

  const targetPath = path.resolve(target);
  if (!fs.existsSync(targetPath)) {
    console.error(`路径不存在: ${targetPath}`);
    process.exit(1);
  }

  const files = fs.statSync(targetPath).isDirectory() ? findVueFiles(targetPath) : [targetPath];
  if (files.length === 0) {
    console.log('未找到样式文件（.vue/.css/.scss/.less/.styl）');
    process.exit(0);
  }

  let totalIssues = 0;
  files.forEach(file => {
    const namespace = namespaceArg || inferNamespace(file);
    const issues = checkFile(file, namespace);
    if (issues.length > 0) {
      console.log(`\n❌ ${path.relative(process.cwd(), file)} (namespace: ${namespace})`);
      issues.forEach(issue => {
        console.log(`   选择器未加命名空间: "${issue.selector}"`);
        console.log(`   所在规则: ${issue.rule}`);
        if (issue.scoped) {
          console.log(`   提示: 该样式块已开启 scoped，但仍建议以 .${namespace} 开头，避免意外污染`);
        }
      });
      totalIssues += issues.length;
    } else {
      console.log(`\n✅ ${path.relative(process.cwd(), file)} (namespace: ${namespace})`);
    }
  });

  console.log(`\n总计: ${files.length} 个文件, ${totalIssues} 个问题`);
  process.exit(totalIssues > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { checkFile, checkTarget, formatIssues, inferNamespace, extractStyleBlocks, extractRules, findStyleFiles, findVueFiles };
