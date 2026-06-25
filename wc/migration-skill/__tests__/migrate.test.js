// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, 'fixtures');

// migration-skill/index.js 为 CommonJS（require），vitest 通过 CJS interop 桥接
const { migrate, addConfigProp, addRootClass, hasConfigProp } = await import('../index.js');

const PROPS_VUE = path.join(FIXTURES, 'props-component.vue');
const NO_PROPS_VUE = path.join(FIXTURES, 'no-props-component.vue');
const HAS_CONFIG_VUE = path.join(FIXTURES, 'has-config-component.vue');

function readSource(file) {
  return fs.readFileSync(file, 'utf-8');
}

describe('migration-skill hasConfigProp', () => {
  it('检测对象式 props 中的 config', () => {
    expect(hasConfigProp(readSource(HAS_CONFIG_VUE))).toBe(true);
  });

  it('无 config prop 时返回 false', () => {
    expect(hasConfigProp(readSource(PROPS_VUE))).toBe(false);
    expect(hasConfigProp(readSource(NO_PROPS_VUE))).toBe(false);
  });
});

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

describe('migration-skill addConfigProp', () => {
  it('给无 props 的组件添加 config prop', () => {
    const result = addConfigProp(readSource(NO_PROPS_VUE));
    expect(result).toMatch(/config:\s*\{\s*type:\s*Object/);
  });

  it('给已有 props 的组件在 props 对象中插入 config', () => {
    const result = addConfigProp(readSource(PROPS_VUE));
    expect(result).toMatch(/config:\s*\{\s*type:\s*Object/);
    // 原 props 保留
    expect(result).toContain('title');
    expect(result).toContain('isVisible');
  });
});

describe('migration-skill migrate - props 模式（默认）', () => {
  it('有独立 props 的组件：不新增 config prop，仅加根类名', () => {
    const { migrated, report } = migrate('bi-sales-panel', PROPS_VUE, '2', 'props');
    // 不应新增 config prop
    expect(migrated).not.toMatch(/config:\s*\{\s*type:\s*Object\s*,\s*default/);
    // 原有 props 保留
    expect(migrated).toContain('title');
    expect(migrated).toContain('isVisible');
    // 根类名已加
    expect(migrated).toContain('bi-sales-panel');
    expect(report.mode).toBe('props');
    expect(report.changes).toContain('props 模式：保留原有 props，未新增 config prop');
    expect(report.changes).toContain('给根元素添加 class="bi-sales-panel"');
  });

  it('无 props 的组件：同样不新增 config prop', () => {
    const { migrated, report } = migrate('bi-info-card', NO_PROPS_VUE, '3', 'props');
    expect(migrated).not.toMatch(/config:\s*\{\s*type:\s*Object/);
    expect(migrated).toContain('bi-info-card');
    expect(report.mode).toBe('props');
    expect(report.changes).toContain('props 模式：保留原有 props，未新增 config prop');
  });

  it('已有 config prop 的组件：保留 config，不重复添加', () => {
    const { migrated, report } = migrate('bi-config-panel', HAS_CONFIG_VUE, '2', 'props');
    // config prop 应保留（原有一个），不重复添加
    const configMatches = migrated.match(/config:\s*\{\s*type:\s*Object/g) || [];
    expect(configMatches.length).toBe(1);
    expect(report.changes).toContain('已存在 config prop，与 props 模式兼容，保留');
  });

  it('默认 mode 为 props（不传第四参数）', () => {
    const { report } = migrate('bi-sales-panel', PROPS_VUE, '2');
    expect(report.mode).toBe('props');
  });
});

describe('migration-skill migrate - config 模式', () => {
  it('无 config prop 的组件：补充 config prop', () => {
    const { migrated, report } = migrate('bi-sales-panel', PROPS_VUE, '2', 'config');
    expect(migrated).toMatch(/config:\s*\{\s*type:\s*Object/);
    expect(report.mode).toBe('config');
    expect(report.changes).toContain('补充 config prop（config 模式）');
  });

  it('无 props 的组件：补充 config prop', () => {
    const { migrated, report } = migrate('bi-info-card', NO_PROPS_VUE, '3', 'config');
    expect(migrated).toMatch(/config:\s*\{\s*type:\s*Object/);
    expect(report.changes).toContain('补充 config prop（config 模式）');
  });

  it('已有 config prop 的组件：不重复添加', () => {
    const { migrated, report } = migrate('bi-config-panel', HAS_CONFIG_VUE, '2', 'config');
    const configMatches = migrated.match(/config:\s*\{\s*type:\s*Object/g) || [];
    expect(configMatches.length).toBe(1);
    expect(report.changes).toContain('已存在 config prop，无需补充');
  });
});

describe('migration-skill migrate - 报告完整性', () => {
  it('report 含 widgetName / filePath / vueVersion / mode / changes / warnings', () => {
    const { report } = migrate('bi-x', PROPS_VUE, '2', 'props');
    expect(report).toHaveProperty('widgetName', 'bi-x');
    expect(report).toHaveProperty('filePath', PROPS_VUE);
    expect(report).toHaveProperty('vueVersion', '2');
    expect(report).toHaveProperty('mode', 'props');
    expect(Array.isArray(report.changes)).toBe(true);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(Array.isArray(report.warnings)).toBe(true);
  });
});
