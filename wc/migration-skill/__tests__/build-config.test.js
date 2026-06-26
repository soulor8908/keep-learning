// generateBuildConfig 纯函数测试：默认 node 环境（无 DOM 依赖）
import { describe, it, expect } from 'vitest';

const { generateBuildConfig } = await import('../index.js');

describe('generateBuildConfig - Vue2 分支', () => {
  it('vueVersion="2" 返回 vue.config.js 模板，含 vue-cli-plugin 与 Vue2 占位符', () => {
    const config = generateBuildConfig('bi-sales-panel', 'src/components/SalesPanel.vue', '2');
    // 顶层注释标识 vue.config.js
    expect(config).toContain('// vue.config.js');
    // 引用 vue-cli-plugin
    expect(config).toContain('./wc/widget-wrapper-plugin/vue-cli-plugin');
    // vueGlobal 为 Vue2
    expect(config).toContain("vueGlobal: 'Vue2'");
    // 占位符替换：widgetName / componentPath 出现在输出中
    expect(config).toContain("name: 'bi-sales-panel'");
    expect(config).toContain("component: 'src/components/SalesPanel.vue'");
  });
});

describe('generateBuildConfig - Vue3 分支', () => {
  it('vueVersion="3" 返回 vite.config.js 模板，含 vite-plugin 与 @vitejs/plugin-vue', () => {
    const config = generateBuildConfig('bi-finance-panel', 'src/components/FinancePanel.vue', '3');
    // 顶层注释标识 vite.config.js
    expect(config).toContain('// vite.config.js');
    // 引用 vite-plugin.js
    expect(config).toContain('./wc/widget-wrapper-plugin/vite-plugin.js');
    // 引入 @vitejs/plugin-vue
    expect(config).toContain('@vitejs/plugin-vue');
    // vueGlobal 为 Vue3
    expect(config).toContain("vueGlobal: 'Vue3'");
    // 占位符替换：widgetName / componentPath 出现在输出中
    expect(config).toContain("name: 'bi-finance-panel'");
    expect(config).toContain("component: 'src/components/FinancePanel.vue'");
  });

  it('vueVersion 为非 "2" 的其他值时同样走 vite 分支', () => {
    // 源码仅判断 vueVersion === '2'，其他值均回落 vite 配置
    const config = generateBuildConfig('bi-x', 'src/X.vue', 'other');
    expect(config).toContain('// vite.config.js');
    expect(config).toContain("vueGlobal: 'Vue3'");
    expect(config).toContain("name: 'bi-x'");
  });
});
