#!/usr/bin/env node
/**
 * 物料迁移辅助工具
 *
 * 把现有 Vue2/Vue3 业务组件快速迁移为看板物料组件。
 * 当前能力：
 * - 检查并补充 config prop
 * - 给根元素添加命名空间类名
 * - 调用 css-namespace-checker / js-risk-scanner 做质量扫描
 * - 输出推荐的 vue.config.js / vite.config.js 配置
 *
 * 用法：
 *   node wc/migration-skill/index.js <widget-name> <vue-file> [vue-version]
 *
 * 示例：
 *   node wc/migration-skill/index.js bi-sales-panel demo/vue2-widget-lib/src/components/SalesPanel.vue 2
 *   node wc/migration-skill/index.js bi-finance-panel demo/vue3-widget-lib/src/components/FinancePanel.vue 3
 */

const fs = require('fs');
const path = require('path');
const { checkFile: checkCssNamespace } = require('../css-namespace-checker');
const { scanFile: scanJsRisk } = require('../js-risk-scanner');

function toKebab(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function inferWidgetName(filePath) {
  const base = path.basename(filePath, '.vue');
  return `bi-${toKebab(base)}`;
}

function hasConfigProp(source) {
  const scriptMatch = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return false;
  const script = scriptMatch[1];
  return /(?:props|defineProps)\s*[:(]\s*\{[\s\S]*?\bconfig\b[\s\S]*?\}/.test(script) ||
         /\bconfig\s*:\s*\{[^}]*type\s*:\s*Object/.test(script);
}

function addConfigProp(source) {
  const scriptRegex = /(<script[^>]*>)([\s\S]*?)(<\/script>)/;
  return source.replace(scriptRegex, (match, open, script, close) => {
    // 情况 1：已有 props: { ... }
    const propsRegex = /props\s*:\s*\{/;
    if (propsRegex.test(script)) {
      return match.replace(propsRegex, `props: {\n    config: { type: Object, default: () => ({}) },`);
    }

    // 情况 2：export default { ... } 但没有 props
    const exportMatch = script.match(/export\s+default\s*\{/);
    if (exportMatch) {
      const insertIdx = exportMatch.index + exportMatch[0].length;
      const before = script.slice(0, insertIdx);
      const after = script.slice(insertIdx);
      return `${open}${before}\n  props: {\n    config: { type: Object, default: () => ({}) }\n  },${after}${close}`;
    }

    // 情况 3：Vue3 Composition API defineProps({ ... })
    const definePropsMatch = script.match(/defineProps\s*\(\s*\{/);
    if (definePropsMatch) {
      const insertIdx = definePropsMatch.index + definePropsMatch[0].length;
      const before = script.slice(0, insertIdx);
      const after = script.slice(insertIdx);
      return `${open}${before}\n  config: { type: Object, default: () => ({}) },${after}${close}`;
    }

    return match;
  });
}

function addRootClass(source, widgetName) {
  // 匹配 <template> 中的第一个标签
  const templateRegex = /(<template[^>]*>)([\s\S]*?)(<\/template>)/;
  return source.replace(templateRegex, (match, open, content, close) => {
    // 找到第一个非注释、非空白的元素开始标签
    const firstTagRegex = /(<[a-zA-Z][^>]*?)(\s*\/?>)/;
    const newContent = content.replace(firstTagRegex, (tagMatch, tagStart, tagEnd) => {
      if (/class\s*=\s*["']/.test(tagStart)) {
        // 已有 class，追加命名空间
        return tagStart.replace(
          /class\s*=\s*["']([^"']*)["']/,
          (classMatch, classes) => {
            if (classes.split(/\s+/).includes(widgetName)) {
              return classMatch;
            }
            return `class="${classes} ${widgetName}"`;
          }
        ) + tagEnd;
      }
      // 没有 class，直接添加
      return `${tagStart} class="${widgetName}"${tagEnd}`;
    });

    return open + newContent + close;
  });
}

function generateBuildConfig(widgetName, componentPath, vueVersion) {
  const relativeComponent = componentPath; // 建议用户改成相对路径

  if (vueVersion === '2') {
    return `
// vue.config.js
const widgetPlugin = require('./wc/widget-wrapper-plugin/vue-cli-plugin');

module.exports = {
  chainWebpack: widgetPlugin({
    name: '${widgetName}',
    component: '${relativeComponent}',
    vueGlobal: 'Vue2'
  })
};
`;
  }

  return `
// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import widgetVitePlugin from './wc/widget-wrapper-plugin/vite-plugin.js';

export default defineConfig({
  plugins: [
    vue(),
    widgetVitePlugin({
      name: '${widgetName}',
      component: '${relativeComponent}',
      vueGlobal: 'Vue3'
    })
  ]
});
`;
}

function migrate(widgetName, filePath, vueVersion) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const report = {
    widgetName,
    filePath,
    vueVersion,
    changes: [],
    warnings: []
  };

  let migrated = source;

  // 1. 检查 config prop
  if (!hasConfigProp(source)) {
    migrated = addConfigProp(migrated);
    report.changes.push('补充 config prop');
  } else {
    report.changes.push('已存在 config prop，无需补充');
  }

  // 2. 检查根元素命名空间
  const rootClassRegex = new RegExp(`class=["'][^"']*\\b${widgetName}\\b`);
  if (!rootClassRegex.test(migrated)) {
    migrated = addRootClass(migrated, widgetName);
    report.changes.push(`给根元素添加 class="${widgetName}"`);
  } else {
    report.changes.push('根元素已包含命名空间类名');
  }

  // 3. CSS 命名空间检查
  const cssIssues = checkCssNamespace(filePath, widgetName);
  if (cssIssues.length > 0) {
    report.warnings.push(`发现 ${cssIssues.length} 个 CSS 选择器未加命名空间`);
  }

  // 4. JS 风险扫描
  const jsRisks = scanJsRisk(filePath);
  if (jsRisks.length > 0) {
    const highRisks = jsRisks.filter(r => r.level === 'high').length;
    report.warnings.push(`发现 ${jsRisks.length} 个 JS 风险（其中 ${highRisks} 个高危）`);
  }

  return { migrated, report };
}

function main() {
  let [widgetName, filePath, vueVersion] = process.argv.slice(2);

  if (!filePath) {
    console.log('用法：node wc/migration-skill/index.js <widget-name> <vue-file> [vue-version:2|3]');
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`文件不存在: ${absolutePath}`);
    process.exit(1);
  }

  widgetName = widgetName || inferWidgetName(absolutePath);
  vueVersion = vueVersion || '3';

  const { migrated, report } = migrate(widgetName, absolutePath, vueVersion);

  // 输出迁移后的文件
  const outPath = absolutePath.replace(/\.vue$/, '.migrated.vue');
  fs.writeFileSync(outPath, migrated);

  // 输出报告
  console.log('\n========== 物料迁移报告 ==========');
  console.log(`物料名称: ${report.widgetName}`);
  console.log(`Vue 版本: ${report.vueVersion}`);
  console.log(`源文件: ${report.filePath}`);
  console.log(`迁移后文件: ${outPath}`);
  console.log('\n变更:');
  report.changes.forEach(c => console.log(`  ✅ ${c}`));

  if (report.warnings.length > 0) {
    console.log('\n警告:');
    report.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  } else {
    console.log('\n✅ 未发现 CSS/JS 风险');
  }

  console.log('\n========== 推荐打包配置 ==========');
  console.log(generateBuildConfig(widgetName, filePath, vueVersion));

  process.exit(report.warnings.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { migrate, addConfigProp, addRootClass, hasConfigProp };
