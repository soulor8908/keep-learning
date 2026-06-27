#!/usr/bin/env node
/**
 * 物料迁移辅助工具
 *
 * 把现有 Vue2/Vue3 业务组件快速迁移为看板物料组件。
 * 当前能力：
 * - 给根元素添加命名空间类名
 * - 保留组件原有 props（扁平化 props 协议：宿主把每个 prop 作为独立 kebab-case
 *   attribute 传入，包装层按声明类型解析后注入业务组件原有 props，组件无需新增
 *   任何聚合 prop）
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

/**
 * 扫描 Vue2/Vue3 业务组件源码中与物料环境不兼容的 API 模式（M1）
 *
 * 物料运行在独立 Custom Element 内，无 Vue 根实例、无 router/store/parent。
 * 以下模式在原业务组件中可用，但迁移为物料后会失效或产生副作用：
 * - this.$store / this.$router / this.$route：Vue 根实例注入，物料无根实例
 * - this.$emit：物料无父组件，事件应走 scope.bus
 * - Vue.use()：全局注册污染基座
 * - this.$t：vue-i18n 全局实例，物料应改用 scope.t()
 * - this.t()：自定义翻译方法，确认是否应迁移到 scope.t()
 *
 * @param {string} source .vue 源码
 * @returns {Array<{level:string,message:string,line:number}>}
 */
function scanMigrationPatterns(source) {
  const patterns = [
    { regex: /this\.\$store\b/g, level: 'high', message: 'this.$store：物料无 Vuex store，改用 scope.context.get() 读取基座上下文' },
    { regex: /this\.\$router\b/g, level: 'high', message: 'this.$router：物料无路由实例，基座应通过 scope 提供导航能力' },
    { regex: /this\.\$route\b/g, level: 'high', message: 'this.$route：物料无路由对象，改用 scope.context.get("route") 获取路由信息' },
    { regex: /\bVue\.use\s*\(/g, level: 'high', message: 'Vue.use()：全局注册会污染基座 Vue 实例，物料应局部引入组件而非全局注册' },
    { regex: /this\.\$emit\s*\(/g, level: 'medium', message: 'this.$emit：物料无父组件接收事件，改用 scope.bus.emit() 进行跨物料通信' },
    { regex: /this\.\$t\b/g, level: 'medium', message: 'this.$t：vue-i18n 全局实例在物料中不可用，改用 scope.t()' },
    { regex: /this\.t\s*\(/g, level: 'low', message: 'this.t()：若为自定义翻译方法，确认是否应迁移到 scope.t()' },
    { regex: /this\.\$nextTick/g, level: 'low', message: 'this.$nextTick：可用但注意物料卸载后回调不再生效，建议在 onUnmount 中清理' },
  ];
  const findings = [];
  for (const { regex, level, message } of patterns) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      findings.push({ level, message, line });
    }
  }
  return findings;
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
    warnings: [],
    migrationPatterns: []
  };

  let migrated = source;

  // 1. props 协议：保留组件原有 props，无需新增任何聚合 prop。
  //    扁平化 props 协议下，宿主把每个 prop 作为独立 kebab-case attribute 传入，
  //    包装层按声明类型解析后注入业务组件原有 props，组件源码无需改动 props 部分。
  report.changes.push('保留原有 props（扁平化 props 协议，无需新增聚合 prop）');

  // 2. 检查根元素命名空间
  const rootClassRegex = new RegExp(`class=["'][^"']*\\b${widgetName}\\b`);
  if (!rootClassRegex.test(migrated)) {
    migrated = addRootClass(migrated, widgetName);
    report.changes.push(`给根元素添加 class="${widgetName}"`);
  } else {
    report.changes.push('根元素已包含命名空间类名');
  }

  // 3. CSS 命名空间检查（扫描迁移后的内容，而非原始文件）
  const tmpMigrated = path.join(require('os').tmpdir(), `widget-migrate-check-${Date.now()}.vue`);
  fs.writeFileSync(tmpMigrated, migrated);
  let cssIssues = [];
  let jsRisks = [];
  try {
    cssIssues = checkCssNamespace(tmpMigrated, widgetName);
    jsRisks = scanJsRisk(tmpMigrated);
  } finally {
    try { fs.unlinkSync(tmpMigrated); } catch (_) {}
  }
  if (cssIssues.length > 0) {
    report.warnings.push(`发现 ${cssIssues.length} 个 CSS 选择器未加命名空间`);
  }

  // 4. JS 风险扫描
  if (jsRisks.length > 0) {
    const highRisks = jsRisks.filter(r => r.level === 'high').length;
    report.warnings.push(`发现 ${jsRisks.length} 个 JS 风险（其中 ${highRisks} 个高危）`);
  }

  // 5. 迁移模式扫描（M1）：检测 this.$store/Vue.use 等物料环境不兼容的 API
  const migrationPatterns = scanMigrationPatterns(source);
  if (migrationPatterns.length > 0) {
    const highCount = migrationPatterns.filter(p => p.level === 'high').length;
    report.migrationPatterns = migrationPatterns;
    report.warnings.push(
      `发现 ${migrationPatterns.length} 个迁移点需人工确认（${highCount} 个高危，详见下方"迁移模式"）`
    );
  }

  return { migrated, report };
}

function main() {
  // 用法：node wc/migration-skill/index.js <widget-name> <vue-file> [vue-version:2|3]
  const positional = process.argv.slice(2);
  let [widgetName, filePath, vueVersion] = positional;

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

  // 迁移模式详情（M1）
  if (report.migrationPatterns && report.migrationPatterns.length > 0) {
    console.log('\n迁移模式（需人工确认）:');
    report.migrationPatterns.forEach(p => {
      const icon = p.level === 'high' ? '🔴' : (p.level === 'medium' ? '🟡' : '⚪');
      console.log(`  ${icon} [行${p.line}] ${p.message}`);
    });
  }

  console.log('\n========== 推荐打包配置 ==========');
  console.log(generateBuildConfig(widgetName, filePath, vueVersion));

  // 迁移成功即退出 0；CSS/JS 风险仅为警告（提示人工复核），不视为失败，
  // 否则会中断 `&&` 串联的脚本（如 npm run migrate && cp ...）。
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { migrate, addRootClass, generateBuildConfig, toKebab, inferWidgetName, scanMigrationPatterns };
