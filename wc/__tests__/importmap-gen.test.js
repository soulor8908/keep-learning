import { describe, it, expect } from 'vitest';
import {
  loadUiGroups,
  buildComponentToGroup,
  generateImportmap,
  createGroupResolver,
  createManualCheckPlugin
} from '../importmap-gen.js';

// 纯逻辑测试，不依赖 DOM。分组策略以 wc/ui-groups.json 为唯一来源。

describe('importmap-gen', () => {
  describe('loadUiGroups', () => {
    it('读取 ui-groups.json，含 element-plus 与 element-ui 两库', () => {
      const groups = loadUiGroups();
      expect(groups['element-plus']).toBeDefined();
      expect(groups['element-ui']).toBeDefined();
      expect(groups['element-plus'].groups.common).toContain('ElButton');
      expect(groups['element-ui'].groups.common).toContain('Button');
    });

    it('跳过以 _ 开头的注释键（不当作库处理）', () => {
      const groups = loadUiGroups();
      // loadUiGroups 透传 JSON，_comment 等注释键仍存在（字符串类型）
      expect(typeof groups._comment).toBe('string');
      // 但下游 buildComponentToGroup / generateImportmap 必须忽略 _ 开头的键
      const map = buildComponentToGroup(groups);
      expect(Object.keys(map).some((k) => k.startsWith('_'))).toBe(false);
      const { imports } = generateImportmap(groups);
      expect(Object.keys(imports).some((k) => k.startsWith('_'))).toBe(false);
    });
  });

  describe('buildComponentToGroup', () => {
    it('构建 组件→组 反查表，key 形如 lib:Component', () => {
      const groups = loadUiGroups();
      const map = buildComponentToGroup(groups);
      expect(map['element-plus:ElTable']).toBe('table');
      expect(map['element-plus:ElButton']).toBe('common');
      expect(map['element-ui:Button']).toBe('common');
      expect(map['element-ui:Table']).toBe('table');
    });
  });

  describe('generateImportmap', () => {
    it('顶层 imports 含 vue/lodash/axios 及各分组 canonical URL', () => {
      const groups = loadUiGroups();
      const { imports } = generateImportmap(groups);

      expect(imports.vue).toBe('https://esm.sh/vue@3.4.21');
      expect(imports.lodash).toBe('https://esm.sh/lodash@4.17.21');
      expect(imports.axios).toBe('https://esm.sh/axios@1.7.7');

      // 分组 specifier：全项目唯一 URL
      expect(imports['element-plus/common']).toContain('esm.sh/element-plus@2.7.0');
      expect(imports['element-plus/common']).toContain('exports=');
      expect(imports['element-plus/common']).toContain('deps=vue@3.4.21');
      expect(imports['element-ui/common']).toContain('esm.sh/element-ui@2.15.14');
    });

    it('scopes 把 Vue2/Vue3 物料的 bare vue 分流到不同版本', () => {
      const groups = loadUiGroups();
      const { scopes } = generateImportmap(groups);

      expect(scopes['/widgets/vue2/'].vue).toBe('https://esm.sh/vue@2.6.14');
      expect(scopes['/widgets/vue3/'].vue).toBe('https://esm.sh/vue@3.4.21');
    });

    it('cdnBase 覆盖默认 esm.sh（用于离线/内网自托管）', () => {
      const groups = loadUiGroups();
      const { imports, scopes } = generateImportmap(groups, { cdnBase: 'http://internal-cdn' });
      expect(imports.vue).toBe('http://internal-cdn/vue@3.4.21');
      expect(scopes['/widgets/vue2/'].vue).toBe('http://internal-cdn/vue@2.6.14');
    });

    it('hostStack=vue2 时顶层 vue 解析到 Vue2（vue2 单栈基座）', () => {
      const groups = loadUiGroups();
      const { imports } = generateImportmap(groups, { hostStack: 'vue2' });
      expect(imports.vue).toBe('https://esm.sh/vue@2.6.14');
    });

    it('hostStack=none 时顶层不声明 vue（h5 基座无框架）', () => {
      const groups = loadUiGroups();
      const { imports } = generateImportmap(groups, { hostStack: 'none' });
      expect(imports.vue).toBeUndefined();
      // 组 specifier 仍齐全，跨栈物料依赖不受影响
      expect(imports['element-plus/common']).toBeDefined();
      expect(imports['element-ui/common']).toBeDefined();
    });

    it('顶层含全量 element-plus / element-ui bare 入口（基座 app.use 用）', () => {
      const groups = loadUiGroups();
      const { imports } = generateImportmap(groups);
      expect(imports['element-plus']).toContain('esm.sh/element-plus@2.7.0');
      expect(imports['element-plus']).toContain('deps=vue@3.4.21');
      expect(imports['element-ui']).toContain('esm.sh/element-ui@2.15.14');
      expect(imports['element-ui']).toContain('deps=vue@2.6.14');
    });

    it('同一组件全项目唯一归属一组 → 同组 specifier 同一 URL（跨物料去重前提）', () => {
      const groups = loadUiGroups();
      const { imports } = generateImportmap(groups);
      // ElTable 只在 table 组，不在 common 组
      expect(imports['element-plus/table']).toContain('ElTable');
      expect(imports['element-plus/common']).not.toContain('ElTable');
    });
  });

  describe('createGroupResolver', () => {
    it('vue3：<el-button> → from element-plus/common，导出名带 El 前缀', () => {
      const groups = loadUiGroups();
      const resolver = createGroupResolver(groups, 'vue3');
      expect(resolver.type).toBe('component');
      expect(resolver.resolve('ElButton')).toEqual({
        name: 'ElButton',
        from: 'element-plus/common'
      });
    });

    it('vue2：<el-button> → from element-ui/common，as 还原 ElButton 注册名', () => {
      const groups = loadUiGroups();
      const resolver = createGroupResolver(groups, 'vue2');
      expect(resolver.resolve('ElButton')).toEqual({
        name: 'Button',
        from: 'element-ui/common',
        as: 'ElButton'
      });
    });

    it('未分组的组件返回 null（交回其他 resolver）', () => {
      const groups = loadUiGroups();
      const r3 = createGroupResolver(groups, 'vue3');
      const r2 = createGroupResolver(groups, 'vue2');
      expect(r3.resolve('ElNonexistent')).toBeNull();
      expect(r2.resolve('ElNonexistent')).toBeNull();
    });
  });

  describe('createManualCheckPlugin', () => {
    // 构造一个最小 rollup 上下文：this.error 收集错误信息
    function makeContext() {
      const errors = [];
      return {
        errors,
        error(msg) { errors.push(String(msg)); throw new Error(msg); }
      };
    }

    it('裸 import element-plus 触发报错', () => {
      const groups = loadUiGroups();
      const plugin = createManualCheckPlugin(groups, 'vue3');
      const ctx = makeContext();
      const code = `import { ElButton } from 'element-plus';`;
      expect(() => plugin.transform.call(ctx, code, 'a.vue')).toThrow();
      expect(ctx.errors.join('')).toContain('禁止裸 import');
    });

    it('合法组 specifier 不报错', () => {
      const groups = loadUiGroups();
      const plugin = createManualCheckPlugin(groups, 'vue3');
      const ctx = makeContext();
      const code = `import { ElButton } from 'element-plus/common';`;
      expect(() => plugin.transform.call(ctx, code, 'a.vue')).not.toThrow();
      expect(ctx.errors).toHaveLength(0);
    });

    it('未声明的组 specifier 触发报错', () => {
      const groups = loadUiGroups();
      const plugin = createManualCheckPlugin(groups, 'vue3');
      const ctx = makeContext();
      const code = `import { ElButton } from 'element-plus/nonexistent';`;
      expect(() => plugin.transform.call(ctx, code, 'a.vue')).toThrow();
      expect(ctx.errors.join('')).toContain('未声明的组 specifier');
    });

    it('非 js/vue/ts 文件直接跳过', () => {
      const groups = loadUiGroups();
      const plugin = createManualCheckPlugin(groups, 'vue3');
      const ctx = makeContext();
      expect(plugin.transform.call(ctx, `import 'element-plus'`, 'a.css')).toBeNull();
      expect(ctx.errors).toHaveLength(0);
    });
  });
});
