// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  extractStyleBlocks,
  addScopedAttr,
  checkScopedFile,
  checkScopedDir,
  formatScopedResults
} from '../index.js';

let tmpDir;

function writeFile(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-scoped-'));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

describe('scoped-style-checker scoped/namespace 双策略', () => {
  describe('T2.3a extractStyleBlocks / addScopedAttr 纯函数', () => {
    it('extractStyleBlocks 识别 scoped 属性', () => {
      const blocks = extractStyleBlocks('<style scoped>.a{}</style><style>.b{}</style>');
      expect(blocks.length).toBe(2);
      expect(blocks[0].scoped).toBe(true);
      expect(blocks[1].scoped).toBe(false);
    });

    it('extractStyleBlocks 识别 lang 属性', () => {
      const blocks = extractStyleBlocks('<style lang="scss" scoped>.a{}</style>');
      expect(blocks[0].lang).toBe('scss');
      expect(blocks[0].scoped).toBe(true);
    });

    it('extractStyleBlocks 无 style 块返回空数组', () => {
      expect(extractStyleBlocks('<template><div/></template>')).toEqual([]);
    });

    it('addScopedAttr 空属性串返回 " scoped"', () => {
      expect(addScopedAttr('')).toBe(' scoped');
      expect(addScopedAttr('   ')).toBe(' scoped');
    });

    it('addScopedAttr 已含 scoped 不重复添加', () => {
      expect(addScopedAttr(' scoped')).toBe(' scoped');
      expect(addScopedAttr(' lang="scss" scoped')).toBe(' lang="scss" scoped');
      // 大小写不敏感
      expect(addScopedAttr(' SCOPED')).toBe(' SCOPED');
    });

    it('addScopedAttr 在已有属性后追加 scoped', () => {
      // 实际行为：trim 后再 ` ${trimmed} scoped` 拼接，结果带前导空格
      expect(addScopedAttr(' lang="scss"')).toBe(' lang="scss" scoped');
    });
  });

  describe('T2.3b checkScopedFile policy=error（默认）', () => {
    it('未加 scoped 的 <style> 被记录为 violation', () => {
      const f = writeFile('bad.vue', '<template><div/></template><style>.a{color:red;}</style>');
      const r = checkScopedFile(f, { policy: 'error' });
      expect(r.violations.length).toBe(1);
      expect(r.violations[0].lang).toBe('css');
      expect(r.modified).toBe(false);
    });

    it('已加 scoped 的 <style> 不报 violation', () => {
      const f = writeFile('ok.vue', '<template><div/></template><style scoped>.a{}</style>');
      const r = checkScopedFile(f, { policy: 'error' });
      expect(r.violations).toEqual([]);
    });

    it('多个 <style>，部分未加 scoped → 仅未加的报', () => {
      const f = writeFile('mix.vue', '<style scoped>.a{}</style><style>.b{}</style><style scoped lang="scss">.c{}</style>');
      const r = checkScopedFile(f, { policy: 'error' });
      expect(r.violations.length).toBe(1);
    });

    it('无 <style> 块的 .vue 不报 violation', () => {
      const f = writeFile('nosyle.vue', '<template><div/></template><script>export default {}</script>');
      const r = checkScopedFile(f, { policy: 'error' });
      expect(r.violations).toEqual([]);
    });
  });

  describe('T2.3c checkScopedFile policy=auto-add（自动补 scoped 并回写）', () => {
    it('未加 scoped 的 <style> 被自动补上 scoped，文件回写', () => {
      const f = writeFile('auto.vue', '<template><div/></template><style>.a{color:red;}</style>');
      const r = checkScopedFile(f, { policy: 'auto-add' });
      expect(r.modified).toBe(true);
      expect(r.violations.length).toBe(1); // 记录已修复
      const after = fs.readFileSync(f, 'utf-8');
      expect(after).toContain('<style scoped>');
    });

    it('已加 scoped 的 <style> 不重复添加，文件不变', () => {
      const f = writeFile('autook.vue', '<style scoped>.a{}</style>');
      const before = fs.readFileSync(f, 'utf-8');
      const r = checkScopedFile(f, { policy: 'auto-add' });
      expect(r.modified).toBe(false);
      expect(fs.readFileSync(f, 'utf-8')).toBe(before);
    });

    it('多 <style> 全部补上 scoped', () => {
      const f = writeFile('multiauto.vue', '<style>.a{}</style><style lang="scss">.b{}</style>');
      const r = checkScopedFile(f, { policy: 'auto-add' });
      expect(r.modified).toBe(true);
      const after = fs.readFileSync(f, 'utf-8');
      expect(after).toContain('<style scoped>');
      expect(after).toContain('lang="scss" scoped');
    });
  });

  describe('T2.3d checkScopedFile policy=warn / off', () => {
    it('policy=warn 仅记录 violation，不回写文件', () => {
      const f = writeFile('warn.vue', '<style>.a{}</style>');
      const before = fs.readFileSync(f, 'utf-8');
      const r = checkScopedFile(f, { policy: 'warn' });
      expect(r.violations.length).toBe(1);
      expect(r.modified).toBe(false);
      expect(fs.readFileSync(f, 'utf-8')).toBe(before);
    });

    it('policy=off 直接返回空结果，不检测', () => {
      const f = writeFile('off.vue', '<style>.a{}</style>');
      const r = checkScopedFile(f, { policy: 'off' });
      expect(r.violations).toEqual([]);
      expect(r.modified).toBe(false);
    });
  });

  describe('T2.3e checkScopedDir 目录扫描与 formatScopedResults', () => {
    it('checkScopedDir 递归扫描，聚合有 violation 的文件', () => {
      writeFile('ok.vue', '<style scoped>.a{}</style>');
      writeFile('bad.vue', '<style>.b{}</style>');
      fs.mkdirSync(path.join(tmpDir, 'sub'));
      fs.writeFileSync(path.join(tmpDir, 'sub', 'bad2.vue'), '<style>.c{}</style>', 'utf-8');
      const { results, hasViolation } = checkScopedDir(tmpDir, { policy: 'error' });
      expect(hasViolation).toBe(true);
      expect(results.length).toBe(2); // ok.vue 不入 results
      const names = results.map(r => path.basename(r.file)).sort();
      expect(names).toEqual(['bad.vue', 'bad2.vue']);
    });

    it('checkScopedDir 无 violation 时 hasViolation=false', () => {
      writeFile('ok.vue', '<style scoped>.a{}</style>');
      const { results, hasViolation } = checkScopedDir(tmpDir, { policy: 'error' });
      expect(hasViolation).toBe(false);
      expect(results).toEqual([]);
    });

    it('checkScopedDir 不存在的目录返回空', () => {
      const { results, hasViolation } = checkScopedDir(path.join(tmpDir, 'no-exist'), { policy: 'error' });
      expect(results).toEqual([]);
      expect(hasViolation).toBe(false);
    });

    it('formatScopedResults 输出含文件名、行号、lang', () => {
      const f = writeFile('fmt.vue', '<style lang="scss">.a{}</style>');
      const r = checkScopedFile(f, { policy: 'error' });
      const out = formatScopedResults([{ file: f, ...r }]);
      expect(out).toContain('fmt.vue');
      expect(out).toContain('行');
      expect(out).toContain('lang=scss');
      expect(out).toContain('未加 scoped');
    });

    it('formatScopedResults auto-add 模式标记 "已自动修复"', () => {
      const f = writeFile('fixed.vue', '<style>.a{}</style>');
      const r = checkScopedFile(f, { policy: 'auto-add' });
      const out = formatScopedResults([{ file: f, ...r }]);
      expect(out).toContain('已自动修复');
    });

    it('formatScopedResults 空数组返回空串', () => {
      expect(formatScopedResults([])).toBe('');
      expect(formatScopedResults(null)).toBe('');
    });
  });

  describe('T2.3f scoped 与 namespace 双层策略区分', () => {
    it('scoped-style-checker 关注 <style scoped> 属性（组件级隔离），不检查选择器内容', () => {
      // 即使选择器是 .leak（缺命名空间），只要加了 scoped，scoped-style-checker 就不报
      const f = writeFile('scoped-leak.vue', '<style scoped>.leak { color: red; }</style>');
      const r = checkScopedFile(f, { policy: 'error' });
      expect(r.violations).toEqual([]);
    });

    it('未加 scoped 的 <style> 即使选择器含命名空间也报 violation（namespace 不能替代 scoped）', () => {
      const f = writeFile('ns-no-scoped.vue', '<style>.bi-sales-panel .foo { color: red; }</style>');
      const r = checkScopedFile(f, { policy: 'error' });
      expect(r.violations.length).toBe(1);
    });

    it('policy 默认值为 error', () => {
      const f = writeFile('default.vue', '<style>.a{}</style>');
      const r = checkScopedFile(f); // 不传 policy
      expect(r.violations.length).toBe(1);
    });

    it('文件不存在时返回空结果（不抛错）', () => {
      const r = checkScopedFile(path.join(tmpDir, 'no-exist.vue'), { policy: 'error' });
      expect(r.violations).toEqual([]);
      expect(r.modified).toBe(false);
    });
  });
});
