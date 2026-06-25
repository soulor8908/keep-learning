// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  scanFile,
  scanSourceFile,
  scanTarget,
  findVueFiles,
  formatFindings,
  extractScriptBlocks,
  RISK_PATTERNS
} from '../index.js';

let tmpDir;

function writeFile(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-risk-'));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

// 辅助：把 JS 代码包成 .vue 文件（scanner 只扫描 .vue 的 <script> 块）
function vueWithScript(js) {
  return `<template><div/></template>\n<script>\n${js}\n</script>`;
}

describe('js-risk-scanner 通过/拒收/边界', () => {
  describe('T2.2a 通过用例（合规代码不报错）', () => {
    it('纯净的 .vue 组件无 finding', () => {
      const f = writeFile('clean.vue', vueWithScript(`
        export default {
          data() { return { count: 0 }; },
          methods: { inc() { this.count++; } }
        }
      `));
      expect(scanFile(f)).toEqual([]);
    });

    it('使用 ref/computed 等 Composition API 无 finding', () => {
      const f = writeFile('comp.vue', vueWithScript(`
        import { ref, computed } from 'vue';
        const count = ref(0);
        const double = computed(() => count.value * 2);
      `));
      expect(scanFile(f)).toEqual([]);
    });

    it('局部 DOM 操作（组件内部 this.$el.querySelector）无 finding', () => {
      const f = writeFile('local.vue', vueWithScript(`
        export default {
          mounted() {
            this.$el.querySelector('.inner');
          }
        }
      `));
      expect(scanFile(f)).toEqual([]);
    });
  });

  describe('T2.2b 拒收用例（问题代码被拦截）', () => {
    it('document.body.appendChild 被识别为 high', () => {
      const f = writeFile('a.vue', vueWithScript(`document.body.appendChild(node);`));
      const findings = scanFile(f);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some(f => f.level === 'high' && f.name.includes('document.body'))).toBe(true);
    });

    it('window.myVar = 被识别为 high（全局变量赋值）', () => {
      const f = writeFile('b.vue', vueWithScript(`window.myCustomVar = 123;`));
      const findings = scanFile(f);
      expect(findings.some(f => f.level === 'high' && f.name.includes('window'))).toBe(true);
    });

    it('Vue.component / Vue.use 被识别为 high（全局注册）', () => {
      const f = writeFile('c.vue', vueWithScript(`Vue.component('MyComp', {}); Vue.use(MyPlugin);`));
      const findings = scanFile(f);
      const highs = findings.filter(f => f.level === 'high');
      expect(highs.length).toBeGreaterThanOrEqual(2);
    });

    it('document.getElementById 被识别为 medium（全局 DOM 查询）', () => {
      const f = writeFile('d.vue', vueWithScript(`const el = document.getElementById('app');`));
      const findings = scanFile(f);
      expect(findings.some(f => f.level === 'medium' && f.name.includes('DOM 查询'))).toBe(true);
    });

    it('new Vuex.Store / createPinia 被识别为 high（全局状态管理）', () => {
      const f = writeFile('e.vue', vueWithScript(`
        import { createStore } from 'vuex';
        import { createPinia } from 'pinia';
        createPinia();
      `));
      const findings = scanFile(f);
      // from 'pinia' 即触发 high
      expect(findings.some(f => f.level === 'high')).toBe(true);
    });
  });

  describe('T2.2c 边界用例', () => {
    it('行内注释 // document.body.appendChild 不被误报（注释被剥离）', () => {
      const f = writeFile('comment.vue', vueWithScript(`// document.body.appendChild(node);`));
      const findings = scanFile(f);
      expect(findings).toEqual([]);
    });

    it('字符串字面量 "document.body.appendChild" 不被误报（字符串被剥离）', () => {
      const f = writeFile('str.vue', vueWithScript(`const s = "document.body.appendChild(node)";`));
      const findings = scanFile(f);
      // 字符串内容被替换为空格，关键词不应匹配
      expect(findings).toEqual([]);
    });

    it('document.cookie 不被检测（scanner 未覆盖 cookie 读取，记录实际行为）', () => {
      const f = writeFile('cookie.vue', vueWithScript(`const c = document.cookie;`));
      const findings = scanFile(f);
      // 实际 scanner 不检测 document.cookie，确认不被误报
      expect(findings.find(f => f.name.includes('cookie'))).toBeUndefined();
    });

    it('eval 不被检测（scanner 未覆盖 eval，记录实际行为）', () => {
      const f = writeFile('eval.vue', vueWithScript(`eval('1+1');`));
      const findings = scanFile(f);
      expect(findings.find(f => f.name.includes('eval'))).toBeUndefined();
    });

    it('localStorage 不被检测（scanner 未覆盖 localStorage，记录实际行为）', () => {
      const f = writeFile('ls.vue', vueWithScript(`localStorage.setItem('k', 'v');`));
      const findings = scanFile(f);
      expect(findings.find(f => f.name.includes('localStorage'))).toBeUndefined();
    });

    it('普通 .innerHTML= 不被检测（仅 document.body.innerHTML= 才报，记录实际行为）', () => {
      const f = writeFile('ih.vue', vueWithScript(`el.innerHTML = '<b>x</b>';`));
      const findings = scanFile(f);
      // el.innerHTML 不匹配 document.body.innerHTML
      expect(findings.find(f => f.name.includes('document.body'))).toBeUndefined();
    });

    it('动态拼接 "document" + ".body" 不被检测（regex 无法匹配拼接结果）', () => {
      const f = writeFile('concat.vue', vueWithScript(`const t = 'document' + '.body'; const x = window[t];`));
      const findings = scanFile(f);
      // 拼接结果不会被静态 regex 命中（记录 scanner 的静态分析边界）
      expect(findings.find(f => f.name.includes('document.body'))).toBeUndefined();
    });

    it('new Vue({}).$mount 实际仍触发 EventBus（记录源码实际行为）', () => {
      // 注意：源码中 EventBus 的负向先行断言模式为 /new\s+Vue\s*\(\s*\{[^}]*\}\s*\)(?!\s*\.$mount)/，
      // 其中 $ 未转义（作为行尾锚点而非字面 $），导致 \s*\.$mount 永不匹配，
      // 进而负向断言始终成立。因此 new Vue({}).$mount 实际仍被识别为"全局事件总线"。
      // 按"以源码为准"原则，此处断言实际行为（而非 spec 预期）。
      const f = writeFile('mount.vue', vueWithScript(`const app = new Vue({ render: h => h(App) }).$mount('#app');`));
      const findings = scanFile(f);
      const eventBus = findings.find(f => f.name.includes('事件总线'));
      expect(eventBus).toBeDefined();
      expect(eventBus.level).toBe('high');
    });

    it('new Vue({}) 无 .$mount 时触发 EventBus（基线对照）', () => {
      const f = writeFile('nomount.vue', vueWithScript(`const bus = new Vue({});`));
      const findings = scanFile(f);
      const eventBus = findings.find(f => f.name.includes('事件总线'));
      expect(eventBus).toBeDefined();
    });

    it('document.body.innerHTML = 被识别为 high', () => {
      const f = writeFile('bih.vue', vueWithScript(`document.body.innerHTML = '';`));
      const findings = scanFile(f);
      expect(findings.some(f => f.level === 'high' && f.name.includes('document.body'))).toBe(true);
    });

    it('多行扫描：每行独立判定，行号正确', () => {
      const f = writeFile('multi.vue', vueWithScript(`
        const a = 1;
        window.x = 2;
        const b = 3;
        document.body.appendChild(node);
      `));
      const findings = scanFile(f);
      // window.x 在第 2 行（template + script 起始行偏移后）
      const win = findings.find(f => f.name.includes('window'));
      expect(win).toBeTruthy();
      expect(win.line).toBeGreaterThan(0);
      const body = findings.find(f => f.name.includes('document.body'));
      expect(body).toBeTruthy();
      expect(body.line).toBeGreaterThan(win.line);
    });
  });

  describe('T2.2d scanTarget / formatFindings / extractScriptBlocks', () => {
    it('scanTarget 递归扫描目录下 .vue 文件', () => {
      writeFile('a.vue', vueWithScript(`window.x = 1;`));
      fs.mkdirSync(path.join(tmpDir, 'sub'));
      fs.writeFileSync(path.join(tmpDir, 'sub', 'b.vue'), vueWithScript(`document.body.appendChild(n);`), 'utf-8');
      const { findings, files } = scanTarget(tmpDir);
      expect(files).toBe(2);
      expect(findings.length).toBeGreaterThanOrEqual(2);
    });

    it('scanTarget 不存在路径返回空 + files:0', () => {
      const r = scanTarget(path.join(tmpDir, 'no-exist'));
      expect(r.findings).toEqual([]);
      expect(r.files).toBe(0);
    });

    it('scanSourceFile 与 scanFile 行为一致', () => {
      const f = writeFile('same.vue', vueWithScript(`Vue.component('x', {});`));
      expect(scanSourceFile(f)).toEqual(scanFile(f));
    });

    it('formatFindings 输出含文件名、级别图标与总计', () => {
      const f = writeFile('fmt.vue', vueWithScript(`window.x = 1;\ndocument.getElementById('y');`));
      const findings = scanFile(f);
      const out = formatFindings(findings);
      expect(out).toContain('fmt.vue');
      expect(out).toContain('[HIGH]');
      expect(out).toContain('[MEDIUM]');
      expect(out).toContain('总计:');
      expect(out).toMatch(/个高风险/);
      expect(out).toMatch(/个中风险/);
    });

    it('formatFindings 空数组返回空串', () => {
      expect(formatFindings([])).toBe('');
      expect(formatFindings(null)).toBe('');
    });

    it('findVueFiles 仅收集 .vue 文件', () => {
      writeFile('a.vue', '');
      writeFile('b.js', '');
      writeFile('c.css', '');
      const files = findVueFiles(tmpDir);
      expect(files.map(f => path.basename(f))).toEqual(['a.vue']);
    });

    it('extractScriptBlocks 识别 lang 属性与多 script 块', () => {
      const src = `<script lang="ts">const a: number = 1;</script><script setup>const b = 2;</script>`;
      const blocks = extractScriptBlocks(src);
      expect(blocks.length).toBe(2);
      expect(blocks[0].lang).toBe('ts');
      expect(blocks[1].lang).toBe('js');
    });

    it('RISK_PATTERNS 已导出且含 high/medium 两级', () => {
      expect(Array.isArray(RISK_PATTERNS)).toBe(true);
      expect(RISK_PATTERNS.some(r => r.level === 'high')).toBe(true);
      expect(RISK_PATTERNS.some(r => r.level === 'medium')).toBe(true);
      // 每项都有 name 和 patterns 数组
      expect(RISK_PATTERNS.every(r => typeof r.name === 'string' && Array.isArray(r.patterns))).toBe(true);
    });

    it('非 .vue 文件（.js）scanFile 仍可扫描（extractScriptBlocks 找不到 script 块则返回空）', () => {
      const f = writeFile('plain.js', `window.x = 1;`);
      // .js 文件无 <script> 块，scanner 返回空（记录实际行为）
      expect(scanFile(f)).toEqual([]);
    });
  });
});
