/**
 * Vite 物料自动包装插件
 *
 * 使用方式（vite.config.js）：
 * import widgetVitePlugin from '@your-scope/widget-wrapper-plugin/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     widgetVitePlugin({
 *       name: 'bi-finance-panel',
 *       component: './src/components/FinancePanel.vue',
 *       vueGlobal: 'Vue' // 可选，默认 'Vue'
 *     })
 *   ]
 * });
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';
import { createNamespacePlugin } from './postcss-namespace.js';

const require = createRequire(import.meta.url);
const { writeSchema } = require('../schema-generator');
const { scanTarget, formatFindings } = require('../js-risk-scanner');
const { checkScopedDir, formatScopedResults } = require('../scoped-style-checker');

function generateVue3Wrapper(widgetName, vueGlobal) {
  return `
import { createApp, h, ref } from 'vue';
import Component from '__WIDGET_COMPONENT__';

// ─── 重要：禁止使用 Shadow DOM ───
// 不要改用 Vue3 官方的 defineCustomElement()——它默认调用 attachShadow()，
// 会把物料样式完全隔离，导致基座注入的 element-plus 全局样式 / 主题变量 / 字体图标无法穿透。
// 本包装层手写 HTMLElement + createApp().mount(this)，挂载到 light DOM，
// 与"不开启 Shadow DOM"的架构决策保持一致。
function parseConfig(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

class WidgetElement extends HTMLElement {
  constructor() {
    super();
    this.app = null;
    this._configRef = null;
  }

  static get observedAttributes() {
    return ['config'];
  }

  connectedCallback() {
    // 防御性守卫：若未来误引入 attachShadow / defineCustomElement，立即告警
    if (this.shadowRoot) {
      console.error(
        '[widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，' +
        'element-plus 全局样式将无法穿透。请勿使用 defineCustomElement 或 attachShadow。'
      );
    }
    this._mount();
  }

  // 挂载：仅首次创建 app 与 reactive config ref
  _mount() {
    if (this.app) return; // 已挂载，config 变化由 _updateConfig 处理
    // 使用 ref 承载 config，render 中访问 .value 建立响应式依赖
    // config 变化时只需更新 ref.value，Vue3 自动触发重渲染，无需 unmount/remount
    this._configRef = ref(parseConfig(this.getAttribute('config')));
    this.app = createApp({
      render: () => h(Component, { config: this._configRef.value })
    });
    this.app.mount(this);
  }

  // config 变化时更新 ref，避免 unmount/remount 带来的性能损耗与状态丢失
  _updateConfig(newValue) {
    if (this._configRef) {
      this._configRef.value = parseConfig(newValue);
    }
  }

  disconnectedCallback() {
    if (this.app) {
      this.app.unmount();
      this.app = null;
      this._configRef = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // config 变化：更新 reactive ref，走标准公开 API，不触碰内部 _instance
    if (name === 'config' && this.app && oldValue !== newValue) {
      this._updateConfig(newValue);
    }
  }
}

customElements.define('${widgetName}', WidgetElement);
`;
}

export default function widgetVitePlugin(options = {}) {
  const { name, component, vueGlobal = 'Vue', cssFileName = name, autoNamespace = true, scanRisks = true, riskScanPaths, failOnHighRisk = false, enforceScoped = 'error', scopedScanPaths } = options;
  if (!name || !component) {
    throw new Error('[widget-vite-plugin] 请配置 name 和 component');
  }

  const componentPath = path.resolve(process.cwd(), component);
  const wrapperCode = generateVue3Wrapper(name, vueGlobal);
  const tmpFile = path.join(os.tmpdir(), `widget-wrapper-${name}-${Date.now()}.js`);
  fs.writeFileSync(tmpFile, wrapperCode);

  // PostCSS 自动命名空间插件实例（构建期为所有 CSS 选择器自动添加 .{name} 前缀）
  const namespacePlugin = autoNamespace ? createNamespacePlugin(name) : null;

  return {
    name: 'widget-wrapper-plugin',
    config: () => ({
      build: {
        sourcemap: true, // 开启 source map，方便本地调试物料
        cssCodeSplit: false,
        lib: {
          entry: tmpFile,
          name,
          fileName: () => `${name}.js`,
          formats: ['umd'],
          cssFileName
        },
        rollupOptions: {
          external: ['vue', 'element-plus', 'wc-i18n'],
          output: {
            globals: {
              vue: vueGlobal,
              'element-plus': 'ElementPlus',
              // 国际化运行时：基座提供 window.__wcI18n__，物料共享同一实例与 locale 状态
              'wc-i18n': '__wcI18n__'
            }
          }
        }
      },
      resolve: {
        alias: {
          __WIDGET_COMPONENT__: componentPath
        }
      },
      // PostCSS 自动命名空间：vite 内部用 postcss 处理 CSS，
      // 通过 css.postcss.plugins 注入命名空间插件
      ...(namespacePlugin ? {
        css: {
          postcss: {
            plugins: [namespacePlugin]
          }
        }
      } : {})
    }),
    // 构建完成后自动生成 schema.json
    closeBundle() {
      try {
        const outputDir = path.resolve(process.cwd(), 'dist');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        writeSchema(name, componentPath, path.join(outputDir, `${name}.schema.json`));
      } catch (e) {
        console.warn('[widget-vite-plugin] 自动生成 schema.json 失败:', e.message);
      }

      // ─── 强制 Vue scoped CSS 检测（构建期）───
      // 物料 <style> 不加 scoped 会泄漏全局污染基座；
      // policy: 'error' 报错(默认) / 'auto-add' 自动补 scoped / 'warn' 告警 / 'off' 关闭
      if (enforceScoped && enforceScoped !== 'off') {
        let scopedResults = [];
        try {
          const scanPaths = (scopedScanPaths && scopedScanPaths.length)
            ? scopedScanPaths
            : [path.dirname(componentPath)];
          scanPaths.forEach(p => {
            const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
            const { results } = checkScopedDir(abs, { policy: enforceScoped });
            scopedResults = scopedResults.concat(results);
          });
        } catch (scopedErr) {
          console.warn('[widget-vite-plugin] scoped 检测失败（不影响构建）:', scopedErr.message);
        }
        if (scopedResults.length > 0) {
          const report = formatScopedResults(scopedResults);
          if (enforceScoped === 'error') {
            throw new Error(
              `[widget-vite-plugin] 物料 ${name} 存在未加 scoped 的 <style>，构建被中止（设置 enforceScoped:'auto-add' 可自动补全，'warn' 仅告警）:\n${report}`
            );
          } else if (enforceScoped === 'auto-add') {
            console.warn(`\n[widget-vite-plugin] 物料 ${name} 已自动为 <style> 补上 scoped:\n${report}`);
          } else {
            console.warn(`\n[widget-vite-plugin] 物料 ${name} 存在未加 scoped 的 <style>（仅告警）:\n${report}`);
          }
        }
      }

      // ─── JS 危险 API 静态扫描（构建期）───
      // 扫描物料源码中的危险模式（document.body 挂载、window 赋值、全局注册等），
      // 默认仅告警；failOnHighRisk=true 时发现高风险则抛错让构建失败。
      if (scanRisks) {
        try {
          const scanPaths = (riskScanPaths && riskScanPaths.length)
            ? riskScanPaths
            : [path.dirname(componentPath)];
          const allFindings = [];
          scanPaths.forEach(p => {
            const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
            const { findings } = scanTarget(abs);
            allFindings.push(...findings);
          });
          if (allFindings.length > 0) {
            const highCount = allFindings.filter(f => f.level === 'high').length;
            const report = formatFindings(allFindings);
            if (highCount > 0) {
              console.warn(`\n[widget-vite-plugin] 物料 ${name} 危险 API 扫描发现高风险:\n${report}`);
              if (failOnHighRisk) {
                throw new Error(
                  `[widget-vite-plugin] 物料 ${name} 存在 ${highCount} 个高风险 API 调用，构建被中止（设置 failOnHighRisk:false 可降级为告警）:\n${report}`
                );
              }
            } else {
              console.warn(`\n[widget-vite-plugin] 物料 ${name} 危险 API 扫描（仅中风险，告警）:\n${report}`);
            }
          }
        } catch (scanErr) {
          if (failOnHighRisk && scanErr && scanErr.message && scanErr.message.includes('高风险')) {
            throw scanErr;
          }
          console.warn('[widget-vite-plugin] 危险 API 扫描失败（不影响构建）:', scanErr.message);
        }
      }

      // 清理临时 wrapper 文件，避免 tmp 目录堆积
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  };
}
