// @vitest-environment happy-dom
// 扁平化 props 协议测试：migration-skill 仅保留组件原有 props（无需新增聚合 prop），
// 给根元素加命名空间类名。migrate(widgetName, filePath, vueVersion) 三参数，
// report 无 mode 字段；changes 含"保留原有 props（扁平化 props 协议，无需新增聚合 prop）"。
// 不再导出 addConfigProp / hasConfigProp，无 config 模式分支。
import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, 'fixtures');

// migration-skill/index.js 为 CommonJS（require），vitest 通过 CJS interop 桥接
// 扁平化 props 协议：导出 { migrate, addRootClass, generateBuildConfig, toKebab, inferWidgetName, scanMigrationPatterns }
const { migrate, addRootClass, scanMigrationPatterns } = await import('../index.js');

const PROPS_VUE = path.join(FIXTURES, 'props-component.vue');
const NO_PROPS_VUE = path.join(FIXTURES, 'no-props-component.vue');
const HAS_CONFIG_VUE = path.join(FIXTURES, 'has-config-component.vue');

function readSource(file) {
  return fs.readFileSync(file, 'utf-8');
}

describe('migration-skill addRootClass', () => {
  it('给根元素添加 bi-xxx 类名', () => {
    const result = addRootClass(readSource(NO_PROPS_VUE), 'bi-info-card');
    // fixture 已有 class="info-card"，应追加 bi-info-card
    expect(result).toContain('bi-info-card');
    expect(result).toContain('info-card');
  });

  it('已有 class 时追加命名空间', () => {
    const result = addRootClass(readSource(PROPS_VUE), 'bi-sales-panel');
    expect(result).toContain('bi-sales-panel');
    expect(result).toContain('sales-panel'); // 原 class 保留
  });

  it('已含目标类名时不重复添加', () => {
    const source = '<template><div class="bi-x">hi</div></template>';
    const result = addRootClass(source, 'bi-x');
    // 不应出现两次 bi-x
    const matches = result.match(/bi-x/g) || [];
    expect(matches.length).toBe(1);
  });

  it('A3：根元素没有 class 时直接添加 class="${widgetName}"', () => {
    // 现有 fixture 根元素都已有 class，这里用内联 source 覆盖无 class 分支
    const source = '<template><div><span>hi</span></div></template>';
    const result = addRootClass(source, 'bi-a3');
    // 直接添加 class="bi-a3"
    expect(result).toContain('class="bi-a3"');
    // 不应破坏原有结构
    expect(result).toContain('<span>hi</span>');
  });
});

describe('migration-skill migrate - 扁平化 props 协议（单一模式）', () => {
  it('有独立 props 的组件：保留原有 props，不新增 config prop，仅加根类名', () => {
    const { migrated, report } = migrate('bi-sales-panel', PROPS_VUE, '2');
    // 扁平化 props 协议：不应新增 config prop
    expect(migrated).not.toMatch(/config:\s*\{\s*type:\s*Object\s*,\s*default/);
    // 原有 props 保留
    expect(migrated).toContain('title');
    expect(migrated).toContain('isVisible');
    // 根类名已加
    expect(migrated).toContain('bi-sales-panel');
    // 扁平化 props 协议：report 无 mode 字段（单一模式）
    expect(report).not.toHaveProperty('mode');
    expect(report.changes).toContain('保留原有 props（扁平化 props 协议，无需新增聚合 prop）');
    expect(report.changes).toContain('给根元素添加 class="bi-sales-panel"');
  });

  it('无 props 的组件：同样不新增 config prop', () => {
    const { migrated, report } = migrate('bi-info-card', NO_PROPS_VUE, '3');
    expect(migrated).not.toMatch(/config:\s*\{\s*type:\s*Object/);
    expect(migrated).toContain('bi-info-card');
    expect(report).not.toHaveProperty('mode');
    expect(report.changes).toContain('保留原有 props（扁平化 props 协议，无需新增聚合 prop）');
  });

  it('已有 config prop 的组件：保留原 config，不重复添加', () => {
    const { migrated, report } = migrate('bi-config-panel', HAS_CONFIG_VUE, '2');
    // 扁平化 props 协议：migrate 不改动 props，原 config prop 保留（原有一个）
    const configMatches = migrated.match(/config:\s*\{\s*type:\s*Object/g) || [];
    expect(configMatches.length).toBe(1);
    expect(report.changes).toContain('保留原有 props（扁平化 props 协议，无需新增聚合 prop）');
  });
});

describe('migration-skill migrate - 报告完整性', () => {
  it('report 含 widgetName / filePath / vueVersion / changes / warnings（无 mode）', () => {
    const { report } = migrate('bi-x', PROPS_VUE, '2');
    expect(report).toHaveProperty('widgetName', 'bi-x');
    expect(report).toHaveProperty('filePath', PROPS_VUE);
    expect(report).toHaveProperty('vueVersion', '2');
    // 扁平化 props 协议：单一模式，report 无 mode 字段
    expect(report).not.toHaveProperty('mode');
    expect(Array.isArray(report.changes)).toBe(true);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(Array.isArray(report.warnings)).toBe(true);
  });
});

// 用内联 source 写入临时 .vue 文件，覆盖 migrate 的命名空间与风险扫描分支
const tmpFiles = [];
function writeTmpVue(content) {
  const file = path.join(
    os.tmpdir(),
    `migrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}.vue`
  );
  fs.writeFileSync(file, content, 'utf-8');
  tmpFiles.push(file);
  return file;
}

afterEach(() => {
  // 清理本批次创建的临时文件
  while (tmpFiles.length) {
    const f = tmpFiles.pop();
    try { fs.unlinkSync(f); } catch (_) { /* 忽略清理失败 */ }
  }
});

describe('migration-skill migrate - 命名空间与风险扫描分支', () => {
  it('M2：根元素已包含命名空间类名时 push 提示且不改写源码', () => {
    const source = [
      '<template><div class="bi-test-panel"><span>x</span></div></template>',
      '<script>export default { name: "T" };</script>'
    ].join('\n');
    const file = writeTmpVue(source);
    const { migrated, report } = migrate('bi-test-panel', file, '3');
    // 走"已包含命名空间类名"分支
    expect(report.changes).toContain('根元素已包含命名空间类名');
    // 源码未被改写：class="bi-test-panel" 仅出现一次（未追加、未重复）
    const matches = migrated.match(/class="bi-test-panel"/g) || [];
    expect(matches.length).toBe(1);
  });

  it('M3：CSS 选择器未加命名空间时给出 warning', () => {
    // 裸 h3 选择器不以 .bi-css-test 开头，触发 checkCssNamespace 命名空间问题
    const source = [
      '<template>',
      '  <div class="root"><h3>title</h3></div>',
      '</template>',
      '<script>export default { name: "X" };</script>',
      '<style>',
      'h3 { color: red; }',
      '</style>'
    ].join('\n');
    const file = writeTmpVue(source);
    const { report } = migrate('bi-css-test', file, '3');
    // 命名空间已加到根元素
    expect(report.changes).toContain('给根元素添加 class="bi-css-test"');
    // warning 分支：发现 1 个 CSS 选择器未加命名空间
    expect(report.warnings).toContain('发现 1 个 CSS 选择器未加命名空间');
  });

  it('M4：JS 风险扫描发现问题时给出 warning（含高危计数）', () => {
    // window.foo = 1 触发 scanJsRisk 的"window 全局变量赋值"高危规则
    const source = [
      '<template>',
      '  <div class="root"><span>x</span></div>',
      '</template>',
      '<script>',
      'export default {',
      '  mounted() { window.foo = 1; }',
      '};',
      '</script>'
    ].join('\n');
    const file = writeTmpVue(source);
    const { report } = migrate('bi-js-test', file, '3');
    // warning 分支：发现 N 个 JS 风险（其中 1 个高危）
    expect(report.warnings.some(w => /发现 \d+ 个 JS 风险/.test(w))).toBe(true);
    expect(report.warnings.some(w => /其中 1 个高危/.test(w))).toBe(true);
  });
});

describe('migration-skill scanMigrationPatterns（M1）', () => {
  it('检测 this.$store / this.$router / this.$route 高危模式', () => {
    const source = [
      '<template><div>x</div></template>',
      '<script>',
      'export default {',
      '  mounted() {',
      '    this.$store.dispatch("a");',
      '    this.$router.push("/b");',
      '    const r = this.$route.params;',
      '  }',
      '};',
      '</script>'
    ].join('\n');
    const findings = scanMigrationPatterns(source);
    const highFindings = findings.filter(f => f.level === 'high');
    expect(highFindings.length).toBeGreaterThanOrEqual(3);
    expect(findings.some(f => f.message.includes('this.$store'))).toBe(true);
    expect(findings.some(f => f.message.includes('this.$router'))).toBe(true);
    expect(findings.some(f => f.message.includes('this.$route'))).toBe(true);
  });

  it('检测 Vue.use() 全局注册高危模式', () => {
    const source = '<script>Vue.use(SomePlugin);</script>';
    const findings = scanMigrationPatterns(source);
    expect(findings.some(f => f.level === 'high' && f.message.includes('Vue.use'))).toBe(true);
  });

  it('检测 this.$emit / this.$t 中危模式', () => {
    const source = [
      '<script>',
      'export default {',
      '  methods: {',
      '    onClick() { this.$emit("click"); },',
      '    label() { return this.$t("ok"); }',
      '  }',
      '};',
      '</script>'
    ].join('\n');
    const findings = scanMigrationPatterns(source);
    expect(findings.some(f => f.level === 'medium' && f.message.includes('this.$emit'))).toBe(true);
    expect(findings.some(f => f.level === 'medium' && f.message.includes('this.$t'))).toBe(true);
  });

  it('findings 含行号（line 字段）', () => {
    const source = [
      '<template><div>x</div></template>',
      '<script>',
      'export default {',
      '  mounted() { this.$store.dispatch("a"); }',
      '};',
      '</script>'
    ].join('\n');
    const findings = scanMigrationPatterns(source);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(f => typeof f.line === 'number' && f.line > 0)).toBe(true);
  });

  it('无迁移模式的源码返回空数组', () => {
    const source = '<template><div>hi</div></template><script>export default { name: "X" };</script>';
    const findings = scanMigrationPatterns(source);
    expect(findings).toEqual([]);
  });

  it('migrate 集成：report.migrationPatterns 含检测到的迁移点', () => {
    const source = [
      '<template><div class="root">x</div></template>',
      '<script>',
      'export default {',
      '  mounted() { this.$store.dispatch("a"); }',
      '};',
      '</script>'
    ].join('\n');
    const file = writeTmpVue(source);
    const { report } = migrate('bi-mig-pattern', file, '3');
    expect(report.migrationPatterns).toBeDefined();
    expect(report.migrationPatterns.length).toBeGreaterThan(0);
    expect(report.migrationPatterns.some(f => f.message.includes('this.$store'))).toBe(true);
    expect(report.warnings.some(w => /迁移点需人工确认/.test(w))).toBe(true);
  });
});
