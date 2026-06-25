/**
 * Vue scoped CSS 检测/强制工具
 *
 * 物料使用 <style> 而不加 scoped 时，选择器会泄漏到全局，污染基座与其他物料。
 * 本工具解析 .vue 文件中的所有 <style> 块，检测是否带 scoped 属性，按策略处理：
 *   - 'error'    ：发现未加 scoped 的 <style> 抛错（默认）
 *   - 'auto-add' ：自动给未加 scoped 的 <style> 补上 scoped 属性并回写文件
 *   - 'warn'     ：仅控制台告警
 *   - 'off'      ：关闭检测
 *
 * 注意：本工具与 postcss-namespace 互补——
 *   scoped 提供组件级隔离（Vue 编译期加 [data-v-xxx] 属性选择器），
 *   namespace 提供物料级隔离（构建期给选择器加 .bi-xxx 前缀）。
 *   两者同时使用可形成"组件级 + 物料级"双层样式隔离。
 */

const fs = require('fs');

/**
 * 提取 .vue 文件中所有 <style> 块信息
 * @param {string} source 文件内容
 * @returns {Array<{raw:string, attrs:string, content:string, start:number, end:number, scoped:boolean, lang:string}>}
 */
function extractStyleBlocks(source) {
  const blocks = [];
  const regex = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const attrs = match[1] || '';
    const content = match[2] || '';
    const scoped = /\bscoped\b/i.test(attrs);
    const langMatch = attrs.match(/lang=["']([^"']+)["']/i);
    blocks.push({
      raw: match[0],         // 完整 <style ...>...</style>
      attrs,                 // 属性字符串（含前后空格）
      content,
      start: match.index,
      end: regex.lastIndex,
      scoped,
      lang: langMatch ? langMatch[1] : 'css'
    });
  }
  return blocks;
}

/**
 * 给单个 <style> 块的属性串补上 scoped
 * 保持其它属性（lang、module 等）不变，仅在合适位置插入 scoped
 * @param {string} attrs 原属性串（如 ' lang="scss"'）
 * @returns {string} 补上 scoped 后的属性串
 */
function addScopedAttr(attrs) {
  const trimmed = attrs.trim();
  if (!trimmed) return ' scoped';
  // 已含 scoped（大小写不敏感）则不再添加
  if (/\bscoped\b/i.test(trimmed)) return attrs;
  return ` ${trimmed} scoped`;
}

/**
 * 检测单个 .vue 文件
 * @param {string} filePath
 * @param {object} [opts]
 * @param {'error'|'auto-add'|'warn'|'off'} [opts.policy='error']
 * @returns {{violations: Array<{line:number, lang:string}>, modified: boolean, source: string}}
 *   - violations：未加 scoped 的 style 块（含行号）；policy='auto-add' 时为已修复记录
 *   - modified：auto-add 模式下是否回写了文件
 */
function checkScopedFile(filePath, opts = {}) {
  const { policy = 'error' } = opts;
  const result = { violations: [], modified: false, source: '' };

  if (policy === 'off') return result;

  let source;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return result;
  }
  result.source = source;

  const blocks = extractStyleBlocks(source);
  if (blocks.length === 0) return result; // 无 style 块，不报错

  const unscoped = blocks.filter(b => !b.scoped);
  if (unscoped.length === 0) return result;

  // 计算每个未加 scoped 块的起始行号
  unscoped.forEach(b => {
    const line = source.substring(0, b.start).split('\n').length;
    result.violations.push({ line, lang: b.lang });
  });

  if (policy === 'auto-add') {
    // 从后往前替换，避免索引偏移
    let newSource = source;
    for (let i = unscoped.length - 1; i >= 0; i--) {
      const b = unscoped[i];
      const newAttrs = addScopedAttr(b.attrs);
      const newRaw = `<style${newAttrs}>${b.content}</style>`;
      newSource = newSource.slice(0, b.start) + newRaw + newSource.slice(b.end);
    }
    try {
      fs.writeFileSync(filePath, newSource, 'utf-8');
      result.modified = true;
    } catch (e) {
      // 回写失败则降级为告警
      console.warn(`[scoped-checker] 自动添加 scoped 失败(${filePath}): ${e.message}`);
    }
  }

  return result;
}

/**
 * 批量检测目录下所有 .vue 文件（递归）
 * @param {string} dir
 * @param {object} [opts] 同 checkScopedFile
 * @param {Array<string>} [opts.files] 已收集的文件列表（内部递归用）
 * @returns {{results: Array, hasViolation: boolean}}
 */
function checkScopedDir(dir, opts = {}) {
  const { policy = 'error' } = opts;
  const results = [];
  let hasViolation = false;

  function walk(current) {
    let stat;
    try {
      stat = fs.statSync(current);
    } catch (e) {
      return;
    }
    if (stat.isFile()) {
      if (current.endsWith('.vue')) {
        const r = checkScopedFile(current, opts);
        if (r.violations.length > 0) {
          hasViolation = true;
          results.push({ file: current, ...r });
        }
      }
      return;
    }
    if (stat.isDirectory()) {
      let children = [];
      try { children = fs.readdirSync(current); } catch (e) { return; }
      children.forEach(child => walk(require('path').join(current, child)));
    }
  }

  walk(dir);
  return { results, hasViolation };
}

/**
 * 格式化检测结果为可读字符串
 * @param {Array} results checkScopedDir 返回的 results
 * @returns {string}
 */
function formatScopedResults(results) {
  if (!results || results.length === 0) return '';
  const path = require('path');
  const lines = [];
  results.forEach(r => {
    lines.push(`  ⚠️  ${path.relative(process.cwd(), r.file)}`);
    r.violations.forEach(v => {
      const tag = r.modified ? '已自动修复' : '未加 scoped';
      lines.push(`     行 ${v.line} (lang=${v.lang}): ${tag}`);
    });
  });
  return lines.join('\n');
}

module.exports = {
  extractStyleBlocks,
  addScopedAttr,
  checkScopedFile,
  checkScopedDir,
  formatScopedResults
};
