/* Verify mermaid blocks: no raw <el-*> HTML that would break rendering. */
const fs = require('fs');
const path = require('path');

const files = [
  '/workspace/docs/elementui-on-demand-loading.md',
  '/workspace/docs/elementui-migration-strategy.md',
];

let totalIssues = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf-8');
  const fenceRe = /```mermaid\n([\s\S]*?)```/g;
  let m;
  let blockIdx = 0;
  const issues = [];
  while ((m = fenceRe.exec(src)) !== null) {
    blockIdx++;
    const body = m[1];
    // Strip backtick-quoted spans so we don't flag `el-button` inside backticks
    const stripped = body.replace(/`[^`]*`/g, '');
    const rawTagRe = /<el-[a-z]/g;
    let t;
    while ((t = rawTagRe.exec(stripped)) !== null) {
      const ctx = stripped.slice(Math.max(0, t.index - 10), t.index + 25).replace(/\n/g, '\\n');
      issues.push(`mermaid block #${blockIdx}: raw <el-*> tag found near: "${ctx}"`);
    }
    const otherHtmlRe = /<(div|span|p|table|tr|td|svg|img)\b/gi;
    while ((t = otherHtmlRe.exec(stripped)) !== null) {
      const ctx = stripped.slice(Math.max(0, t.index - 10), t.index + 25).replace(/\n/g, '\\n');
      issues.push(`mermaid block #${blockIdx}: raw <${t[1]}> tag found near: "${ctx}"`);
    }
  }
  console.log(`\n=== ${path.basename(file)} ===`);
  console.log(`mermaid blocks found: ${blockIdx}`);
  if (issues.length === 0) {
    console.log('OK: no raw <el-*> / forbidden HTML in mermaid blocks');
  } else {
    totalIssues += issues.length;
    issues.forEach(i => console.log('  - ' + i));
  }
}

console.log(`\nTOTAL MERMAID ISSUES: ${totalIssues}`);
process.exit(totalIssues > 0 ? 1 : 0);
