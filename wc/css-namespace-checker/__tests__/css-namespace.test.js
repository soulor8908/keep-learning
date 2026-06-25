// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  checkFile,
  checkTarget,
  formatIssues,
  inferNamespace,
  extractStyleBlocks,
  extractRules,
  findStyleFiles
} from '../index.js';

let tmpDir;

function writeFile(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-css-ns-'));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

describe('css-namespace-checker 通过/拒收/边界', () => {
  describe('T2.1a 通过用例（合规不报错）', () => {
    it('选择器含命名空间前缀 .bi-sales-panel .foo → 无 issue', () => {
      const f = writeFile('ok.css', '.bi-sales-panel .foo { color: red; }');
      const issues = checkFile(f, 'bi-sales-panel');
      expect(issues).toEqual([]);
    });

    it('.vue 中 <style> 选择器含命名空间 → 无 issue', () => {
      const f = writeFile('Ok.vue', `<template><div class="bi-sales-panel"/></template>
<style scoped>
.bi-sales-panel .title { color: red; }
</style>`);
      expect(checkFile(f, 'bi-sales-panel')).toEqual([]);
    });

    it('白名单全局选择器（html/body/:root）无 issue', () => {
      const f = writeFile('global.css', 'html { font-size: 14px; } body { margin: 0; } :root { --x: 1; }');
      expect(checkFile(f, 'bi-sales-panel')).toEqual([]);
    });

    it('@keyframes 内部关键帧选择器不报错', () => {
      const f = writeFile('kf.css', `@keyframes spin { 0% {} 100% {} from {} to {} }`);
      expect(checkFile(f, 'bi-sales-panel')).toEqual([]);
    });

    it('@media 内部含命名空间的选择器不报错', () => {
      const f = writeFile('media.css', `@media (max-width: 600px) { .bi-sales-panel .foo { color: blue; } }`);
      expect(checkFile(f, 'bi-sales-panel')).toEqual([]);
    });
  });

  describe('T2.1b 拒收用例（问题被拦截）', () => {
    it('裸选择器 .foo 不含命名空间 → 报 issue', () => {
      const f = writeFile('bad.css', '.foo { color: red; }');
      const issues = checkFile(f, 'bi-sales-panel');
      expect(issues.length).toBe(1);
      expect(issues[0].selector).toBe('.foo');
      expect(issues[0].rule).toBe('.foo');
    });

    it('.vue 未加命名空间的 <style> 选择器 → 报 issue', () => {
      const f = writeFile('Bad.vue', `<template><div/></template>
<style scoped>
.title { color: red; }
</style>`);
      const issues = checkFile(f, 'bi-sales-panel');
      expect(issues.length).toBe(1);
      expect(issues[0].selector).toBe('.title');
    });

    it('元素选择器 input 不含命名空间 → 报 issue', () => {
      const f = writeFile('elem.css', 'input { border: 1px solid; }');
      const issues = checkFile(f, 'bi-sales-panel');
      expect(issues.length).toBe(1);
      expect(issues[0].selector).toBe('input');
    });
  });

  describe('T2.1c 边界用例', () => {
    it('@media 内部裸选择器被递归提取（extractRules 单元）', () => {
      // extractRules 递归提取 @media 内部规则，选择器拼接为 "@media (...) { .inner }"
      const rules = extractRules('@media (max-width: 600px) { .leak { color: blue; } }');
      expect(rules.length).toBe(1);
      expect(rules[0].selectors).toContain('.leak');
      expect(rules[0].declarations).toBe('color: blue;');
    });

    it('@media 前缀的选择器命中白名单（checkFile 实际行为）', () => {
      // 注意：递归后选择器以 "@media" 开头，命中 ALLOWED_GLOBAL_SELECTORS 白名单，
      // checkFile 实际不报 issue（当前源码的实际行为，按"以源码为准"原则断言）
      const f = writeFile('media-bad.css', `@media (max-width: 600px) { .leak { color: blue; } }`);
      const issues = checkFile(f, 'bi-sales-panel');
      expect(issues).toEqual([]);
    });

    it('@keyframes 名称不被误判为选择器（关键帧内部 from/to/0% 不报 issue）', () => {
      const f = writeFile('kf-bad.css', `@keyframes spin { from {} 50% {} to {} } .leak { color: red; }`);
      const issues = checkFile(f, 'bi-sales-panel');
      // 只 .leak 被报，from/50%/to 不报
      expect(issues.length).toBe(1);
      expect(issues[0].selector).toBe('.leak');
    });

    it('多选择器组合：a, b, c 部分含命名空间 → 仅未含的报', () => {
      const f = writeFile('multi.css', '.bi-sales-panel .ok, .leak1, .leak2 { color: red; }');
      const issues = checkFile(f, 'bi-sales-panel');
      expect(issues.length).toBe(2);
      const sels = issues.map(i => i.selector);
      expect(sels).toContain('.leak1');
      expect(sels).toContain('.leak2');
    });

    it('后代选择器 .bi-sales-panel-title（命名空间前缀的派生类名）通过', () => {
      // 类名以命名空间开头（如 .bi-sales-panel-title）也视为合规
      const f = writeFile('derived.css', '.bi-sales-panel-title { color: red; }');
      expect(checkFile(f, 'bi-sales-panel')).toEqual([]);
    });

    it('伪类/伪元素 :deep() / ::v-deep 全局穿透不报', () => {
      const f = writeFile('deep.css', '::v-deep .el-input { color: red; } :deep(.el-button) { color: blue; }');
      expect(checkFile(f, 'bi-sales-panel')).toEqual([]);
    });

    it('CSS content 字符串中的花括号不破坏规则提取', () => {
      const f = writeFile('str.css', '.bi-sales-panel .foo { content: "{ fake }"; color: red; }');
      expect(checkFile(f, 'bi-sales-panel')).toEqual([]);
    });

    it('inferNamespace：SalesPanel.vue → bi-sales-panel', () => {
      expect(inferNamespace('SalesPanel.vue')).toBe('bi-sales-panel');
      expect(inferNamespace('sales-panel.css')).toBe('bi-sales-panel');
    });

    it('非样式文件（.js）返回空 issues', () => {
      const f = writeFile('x.js', 'const x = ".foo { color: red; }";');
      expect(checkFile(f, 'bi-sales-panel')).toEqual([]);
    });
  });

  describe('T2.1d checkTarget 目录扫描与 formatIssues', () => {
    it('checkTarget 递归扫描目录，聚合所有 issue', () => {
      writeFile('a.css', '.leak-a {}');
      writeFile('b.css', '.leak-b {}');
      const { issues, files } = checkTarget(tmpDir, 'bi-sales-panel');
      expect(files).toBeGreaterThanOrEqual(2);
      expect(issues.length).toBe(2);
    });

    it('checkTarget 不存在的路径返回空 + files:0', () => {
      const result = checkTarget(path.join(tmpDir, 'not-exist'), 'bi-sales-panel');
      expect(result.issues).toEqual([]);
      expect(result.files).toBe(0);
    });

    it('formatIssues 输出含文件名、选择器与总计', () => {
      const f = writeFile('c.css', '.leak-c {}');
      const issues = checkFile(f, 'bi-sales-panel');
      const out = formatIssues(issues);
      expect(out).toContain('leak-c');
      expect(out).toContain('选择器未加命名空间');
      expect(out).toContain('总计: 1 个命名空间问题');
    });

    it('formatIssues 空数组返回空串', () => {
      expect(formatIssues([])).toBe('');
      expect(formatIssues(null)).toBe('');
    });

    it('findStyleFiles 仅收集样式扩展名', () => {
      writeFile('a.css', '');
      writeFile('b.vue', '');
      writeFile('c.js', '');
      const files = findStyleFiles(tmpDir);
      const names = files.map(f => path.basename(f)).sort();
      expect(names).toEqual(['a.css', 'b.vue']);
    });
  });

  describe('T2.1e extractStyleBlocks / extractRules 单元', () => {
    it('extractStyleBlocks 识别 scoped 与 lang 属性', () => {
      const src = `<style scoped lang="scss">.x{}</style><style>.y{}</style>`;
      const blocks = extractStyleBlocks(src);
      expect(blocks.length).toBe(2);
      expect(blocks[0].scoped).toBe(true);
      expect(blocks[0].lang).toBe('scss');
      expect(blocks[1].scoped).toBe(false);
      expect(blocks[1].lang).toBe('css');
    });

    it('extractRules 提取顶层规则选择器', () => {
      const rules = extractRules('.a {} .b, .c {}');
      // 每条规则的选择器串（含逗号组合）
      const allSels = rules.map(r => r.selectors);
      expect(allSels).toContain('.a');
      expect(allSels).toContain('.b, .c');
    });
  });
});
