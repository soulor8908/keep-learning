// @vitest-environment happy-dom
// 扁平化 props 协议测试：migration-skill 仅保留组件原有 props（无需新增聚合 prop），
// 给根元素加命名空间类名。migrate(widgetName, filePath, vueVersion) 三参数，
// report 无 mode 字段；changes 含"保留原有 props（扁平化 props 协议，无需新增聚合 prop）"。
// 不再导出 addConfigProp / hasConfigProp，无 config 模式分支。
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, 'fixtures');

// migration-skill/index.js 为 CommonJS（require），vitest 通过 CJS interop 桥接
// 扁平化 props 协议：仅导出 { migrate, addRootClass }
const { migrate, addRootClass } = await import('../index.js');

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
