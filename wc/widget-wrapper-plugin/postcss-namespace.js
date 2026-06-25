/**
 * PostCSS 自动命名空间插件
 *
 * 构建期自动为物料 CSS 选择器添加命名空间前缀（如 .bi-sales-panel），
 * 防止不同物料之间的全局样式冲突。
 *
 * 设计要点：
 * - 不依赖外部 postcss 插件包，返回标准 postcss 8 插件对象，可直接放入
 *   postcssOptions.plugins 数组
 * - 白名单复用 css-namespace-checker 的 ALLOWED_GLOBAL_SELECTORS 逻辑，
 *   保证检查器与构建期改写行为一致
 * - 已含命名空间前缀的选择器不重复添加
 * - @media / @supports 内部规则递归处理（PostCSS AST 天然支持）
 * - @keyframes / @font-face 内部不是样式选择器，跳过
 *
 * 用法（vue-cli）：
 *   const { createNamespacePlugin } = require('./postcss-namespace');
 *   config.module.rule('css').oneOf('normal').use('postcss-loader').tap(opts => ({
 *     ...opts,
 *     postcssOptions: { plugins: [createNamespacePlugin('bi-sales-panel')] }
 *   }));
 *
 * 用法（vite）：
 *   import { createNamespacePlugin } from './postcss-namespace';
 *   css: { postcss: { plugins: [createNamespacePlugin('bi-finance-panel')] } }
 */

// 全局选择器白名单：不加命名空间前缀
// 与 css-namespace-checker/index.js 的 ALLOWED_GLOBAL_SELECTORS 保持一致
const GLOBAL_SELECTOR_PATTERNS = [
  /^:host\b/,
  /^:root\b/,
  /^html\b/,
  /^body\b/,
  /^\*/,
  /^::(?:before|after|v-deep|v-global|v-slotted|v-enter|v-leave)\b/,
  /^>>>/,
  /^\/deep\//,
  /^:deep\(/,
  /^:global\(/,
  /^:slotted\(/,
  /^@media\b/,
  /^@supports\b/,
  /^@keyframes\b/,
  /^@-webkit-keyframes\b/,
  /^@font-face\b/,
  /^@page\b/,
  /^@import\b/,
  /^@charset\b/,
  /^@namespace\b/
];

/**
 * 判断单个选择器是否在白名单中（不加前缀）
 * @param {string} selector
 * @returns {boolean}
 */
function isGlobalSelector(selector) {
  const trimmed = selector.trim();
  if (!trimmed) return true;
  return GLOBAL_SELECTOR_PATTERNS.some(re => re.test(trimmed));
}

/**
 * 判断选择器是否已包含命名空间前缀
 * @param {string} selector
 * @param {string} namespaceClass 如 "bi-sales-panel"
 * @returns {boolean}
 */
function hasNamespace(selector, namespaceClass) {
  const trimmed = selector.trim();
  if (!trimmed) return true;
  // 选择器以 .bi-xxx 开头，或包含 .bi-xxx（后代选择器）
  return trimmed.includes(`.${namespaceClass}`);
}

/**
 * 为单个选择器添加命名空间前缀
 * 策略：在选择器最前面插入 .{namespaceClass} + 空格（后代选择器）
 * 不用 & 拼接，保持简单可预测
 *
 * @param {string} selector
 * @param {string} namespaceClass
 * @returns {string}
 */
function prefixSelector(selector, namespaceClass) {
  const trimmed = selector.trim();
  if (!trimmed) return selector;
  if (isGlobalSelector(trimmed)) return selector;
  if (hasNamespace(trimmed, namespaceClass)) return selector;

  // 后代选择器拼接：.bi-xxx 原选择器
  // 这样 .title → .bi-sales-panel .title
  //      .title.active → .bi-sales-panel .title.active
  //      input[type="text"] → .bi-sales-panel input[type="text"]
  return `.${namespaceClass} ${trimmed}`;
}

/**
 * 创建 PostCSS 命名空间插件实例
 * @param {string} widgetName 物料名，如 "bi-sales-panel"
 * @returns {object} postcss 8 插件对象
 */
function createNamespacePlugin(widgetName) {
  if (!widgetName) {
    throw new Error('[postcss-namespace] widgetName is required');
  }
  // widgetName 就是命名空间类名（bi-sales-panel）
  const namespaceClass = widgetName;

  return {
    postcssPlugin: 'postcss-widget-namespace',
    Rule(rule) {
      // @keyframes / @font-frame 内部的规则（如 0%, from, to）不是样式选择器，跳过
      const parent = rule.parent;
      if (parent && parent.type === 'atrule') {
        const atruleName = parent.name;
        if (atruleName === 'keyframes' || atruleName === '-webkit-keyframes' || atruleName === 'font-face') {
          return;
        }
      }

      // rule.selectors 是已按逗号拆分的选择器数组
      rule.selectors = rule.selectors.map(selector =>
        prefixSelector(selector, namespaceClass)
      );
    }
  };
}

// postcss 8 要求标记 postcss 属性为 true（用于识别为 postcss 插件）
createNamespacePlugin.postcss = true;

module.exports = { createNamespacePlugin, prefixSelector, isGlobalSelector, hasNamespace, GLOBAL_SELECTOR_PATTERNS };
