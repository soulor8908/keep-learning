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
const { checkTarget: checkCssNamespace, formatIssues: formatCssIssues } = require('../css-namespace-checker');

export function generateVue3Wrapper(widgetName, vueGlobal) {
  return `
import { createApp, h, ref } from 'vue';
import Component from '__WIDGET_COMPONENT__';
import { createWidgetScope } from 'wc-widget-scope';
import { onLocaleChange } from 'wc-i18n';

// ─── 重要：禁止使用 Shadow DOM ───
// 不要改用 Vue3 官方的 defineCustomElement()——它默认调用 attachShadow()，
// 会把物料样式完全隔离，导致基座注入的 element-plus 全局样式 / 主题变量 / 字体图标无法穿透。
// 本包装层手写 HTMLElement + createApp().mount(this)，挂载到 light DOM，
// 与"不开启 Shadow DOM"的架构决策保持一致。

// camelCase → kebab-case，把 prop 名映射为可观察的 attribute 名
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// 提取业务组件声明的 prop 名列表（数组 / 对象 / <script setup> defineProps 产物）
function getDeclaredPropNames(Component) {
  const props = Component && Component.props;
  if (!props) return [];
  if (Array.isArray(props)) return props.filter(p => typeof p === 'string');
  return Object.keys(props);
}

// 取某个 prop 的声明类型构造器（简写 / 简写数组 / 完整形式）
function getPropType(Component, name) {
  const props = Component && Component.props;
  if (!props || Array.isArray(props)) return null;
  const def = props[name];
  if (!def) return null;
  if (Array.isArray(def)) return def;
  if (typeof def === 'function') return def;
  return def.type || null;
}

// 按属性值与 prop 类型解析为最终值
function parseAttrValue(raw, type) {
  if (type === Boolean) {
    if (raw === '' || raw === 'true') return true;
    if (raw === 'false') return false;
    return true;
  }
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

class WidgetElement extends HTMLElement {
  constructor() {
    super();
    this.app = null;
    this._propsRef = null;
    this._offLocale = null;
    // 物料组件实例（public proxy）：locale 变化时对其 $forceUpdate 触发重渲染。
    // 注意：必须 forceUpdate 物料组件本身，而非外壳 root——Vue3 的 shouldUpdateComponent
    // 在 props 未变时会跳过子组件重渲染，仅替换 _propsRef.value 无法让物料重渲染。
    this._widgetInstance = null;
    // 稳定的 ref 回调（同一函数引用，避免每次渲染都触发 ref 重设），
    // 首次挂载时拿到物料组件实例，卸载时置 null。
    this._captureWidget = (el) => { this._widgetInstance = el; };
    // 每个物料实例创建独立的 widgetScope 软隔离对象，
    // 物料组件通过 props.scope 接收，而非直接访问 window。
    // scope 含 context/bus/log/t/request/loader（嵌套加载带循环检测）
    this._scope = createWidgetScope({ name: '${widgetName}' });
    this._widgetScope = this._scope;
  }

  static get observedAttributes() {
    // 仅观察组件声明的独立 prop 的 kebab attribute（剔除 scope）
    return getDeclaredPropNames(Component)
      .filter(n => n !== 'scope')
      .map(camelToKebab);
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

  // 挂载：仅首次创建 app 与 reactive props ref
  _mount() {
    if (this.app) return; // 已挂载，属性变化由 _updateProp 处理
    // props 用 ref 承载，render 中访问 .value 建立响应式依赖；
    // 任一 prop 变化时整体替换 ref.value，Vue3 自动触发重渲染，无需 unmount/remount
    this._propsRef = ref(this._collectProps());
    this.app = createApp({
      render: () => h(Component, {
        ref: this._captureWidget,
        ...this._propsRef.value,
        scope: this._scope
      })
    });
    // 注册基座提供的 element-plus 组件到物料 app（Vue3 app 隔离，基座注册的组件对物料 app 不可见）
    // window.ElementPlus 由基座 setupElementPlus 挂载，含物料用到的 ElCard/ElButton 等
    if (typeof window !== 'undefined' && window.ElementPlus) {
      Object.keys(window.ElementPlus).forEach(name => {
        const comp = window.ElementPlus[name];
        if (comp && (comp.name || comp.install)) {
          // 优先用组件自身的 name（如 'ElCard'），也注册 kebab 别名（如 'el-card'）兼容
          this.app.component(comp.name || name, comp);
        }
      });
    }
    this.app.mount(this);
    // locale 变化时对物料组件实例本身调用 $forceUpdate 触发重渲染，
    // 组件内 t() 自然返回新语言文案（物料组件无需自建 localeTick/onLocaleChange）。
    // 不能只重赋值 _propsRef.value：props 值未变时 Vue3 的 shouldUpdateComponent 会跳过
    // 子组件重渲染，物料模板里的 t() 不会被重新求值（已用真实 Vue3 验证）。
    this._offLocale = onLocaleChange(() => {
      if (this._widgetInstance && this._widgetInstance.$forceUpdate) {
        this._widgetInstance.$forceUpdate();
      }
    });
  }

  // 收集所有已设置的独立 prop 属性，按声明类型解析为值
  _collectProps() {
    const result = {};
    const names = getDeclaredPropNames(Component).filter(n => n !== 'scope');
    for (const propName of names) {
      const attrName = camelToKebab(propName);
      if (this.hasAttribute(attrName)) {
        result[propName] = parseAttrValue(this.getAttribute(attrName), getPropType(Component, propName));
      }
    }
    return result;
  }

  // 独立 prop 属性变化时更新对应键，整体替换 value 触发重渲染
  _updateProp(propName, newValue) {
    if (!this._propsRef) return;
    this._propsRef.value = {
      ...this._propsRef.value,
      [propName]: parseAttrValue(newValue, getPropType(Component, propName))
    };
  }

  disconnectedCallback() {
    if (this._offLocale) { this._offLocale(); this._offLocale = null; }
    if (this.app) {
      this.app.unmount();
      this.app = null;
      this._propsRef = null;
      this._widgetInstance = null;
      this._scope = null;
      this._widgetScope = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // 首次挂载前 connectedCallback 会统一收集，这里只处理挂载后的变化
    if (oldValue === newValue) return;
    const names = getDeclaredPropNames(Component).filter(n => n !== 'scope');
    const propName = names.find(n => camelToKebab(n) === name);
    if (propName && this.app) {
      this._updateProp(propName, newValue);
    }
  }
}

customElements.define('${widgetName}', WidgetElement);
`;
}

export default function widgetVitePlugin(options = {}) {
  const { name, component, vueGlobal = 'Vue', autoNamespace = true, scanRisks = true, riskScanPaths, failOnHighRisk = false, enforceScoped = 'error', scopedScanPaths, enforceCssNamespace = 'warn', cssNamespaceScanPaths } = options;
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
          formats: ['umd']
          // 注意：lib.cssFileName 是 Vite 6+ 才支持的选项，Vite 5.4 会静默忽略，
          // CSS 默认输出为 style.css。此处不配置，改由下方 closeBundle 钩子重命名为 ${name}.css。
        },
        rollupOptions: {
          // 高频第三方库（lodash/axios）external 化，基座统一加载一份，
          // 避免 N 个物料各自打包导致体积膨胀与多版本冲突
          external: ['vue', 'element-plus', 'wc-i18n', 'wc-widget-scope', 'lodash', 'axios'],
          output: {
            globals: {
              vue: vueGlobal,
              'element-plus': 'ElementPlus',
              // 国际化运行时：基座提供 window.__wcI18n__，物料共享同一实例与 locale 状态
              'wc-i18n': '__wcI18n__',
              // 软隔离 scope 运行时：基座提供 window.__wcWidgetScope__ = { createWidgetScope }
              'wc-widget-scope': '__wcWidgetScope__',
              // 高频库全局变量：lodash → window._，axios → window.axios
              'lodash': '_',
              'axios': 'axios'
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
      const outputDir = path.resolve(process.cwd(), 'dist');

      // ─── CSS 文件重命名（Vite 5.4 兼容）───
      // Vite 5.4 的 LibraryOptions 不支持 cssFileName（Vite 6+ 才支持），
      // lib 模式下 CSS 默认输出为 style.css。多个物料构建到同一 dist 会互相覆盖，
      // 且与 widget registry 约定的 ${name}.css 命名不一致。
      // 此处在产物写入后重命名为 ${name}.css。
      try {
        const defaultCssPath = path.join(outputDir, 'style.css');
        const targetCssPath = path.join(outputDir, `${name}.css`);
        if (fs.existsSync(defaultCssPath)) {
          fs.renameSync(defaultCssPath, targetCssPath);
        }
      } catch (e) {
        console.warn('[widget-vite-plugin] CSS 重命名失败:', e.message);
      }

      try {
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

      // ─── CSS 命名空间检查（构建期）───
      // 检查 .vue 中选择器是否含 .{name} 命名空间前缀（物料级隔离），
      // 与 postcss-namespace 自动加前缀互补：postcss 负责"自动修复"，
      // 此检查负责"发现遗漏"（如 autoNamespace=false 或全局样式泄漏）。
      // policy: 'error' 报错 / 'warn' 告警(默认) / 'off' 关闭
      if (enforceCssNamespace && enforceCssNamespace !== 'off') {
        let nsIssues = [];
        try {
          const scanPaths = (cssNamespaceScanPaths && cssNamespaceScanPaths.length)
            ? cssNamespaceScanPaths
            : [path.dirname(componentPath)];
          scanPaths.forEach(p => {
            const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
            const { issues } = checkCssNamespace(abs, name);
            nsIssues = nsIssues.concat(issues);
          });
        } catch (nsErr) {
          console.warn('[widget-vite-plugin] 命名空间检查失败（不影响构建）:', nsErr.message);
        }
        if (nsIssues.length > 0) {
          const report = formatCssIssues(nsIssues);
          if (enforceCssNamespace === 'error') {
            throw new Error(
              `[widget-vite-plugin] 物料 ${name} 存在 ${nsIssues.length} 个未加命名空间的选择器，构建被中止（设置 enforceCssNamespace:'warn' 降级，或确认 autoNamespace 已开启）:\n${report}`
            );
          } else {
            console.warn(`\n[widget-vite-plugin] 物料 ${name} 存在未加命名空间的选择器（仅告警）:\n${report}`);
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
