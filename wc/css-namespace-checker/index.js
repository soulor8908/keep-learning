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

    const rules = extractRules(block.content);
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
