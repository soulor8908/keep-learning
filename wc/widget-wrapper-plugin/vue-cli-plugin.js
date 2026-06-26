/**
 * Vue CLI 物料自动包装插件
 *
 * 使用方式（vue.config.js）：
 * const WidgetPlugin = require('@your-scope/widget-wrapper-plugin/vue-cli-plugin');
 *
 * module.exports = {
 *   chainWebpack: WidgetPlugin({
 *     name: 'bi-sales-panel',
 *     component: './src/components/SalesPanel.vue',
 *     vueGlobal: 'Vue' // 可选，默认 'Vue'
 *   })
 * };
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { writeSchema } = require('../schema-generator');
const { createNamespacePlugin } = require('./postcss-namespace');
const { scanTarget, formatFindings } = require('../js-risk-scanner');
const { checkScopedDir, formatScopedResults } = require('../scoped-style-checker');
const { checkTarget: checkCssNamespace, formatIssues: formatCssIssues } = require('../css-namespace-checker');

function generateVue2Wrapper(widgetName, vueGlobal) {
  return `
import Vue from 'vue';
import Component from '__WIDGET_COMPONENT__';
import { createWidgetScope } from 'wc-widget-scope';
import { onLocaleChange } from 'wc-i18n';

// 告诉 Vue2 编译器 el-* 是自定义元素，不要当 Vue 组件解析
// 使用合并而非覆盖，避免污染基座或其他物料的 ignoredElements 配置
// 去重检查：同页多物料加载时避免重复添加 /^el-/
const _existing = Array.isArray(Vue.config.ignoredElements) ? Vue.config.ignoredElements : [];
const _hasEl = _existing.some(re => re instanceof RegExp && re.source === '^el-');
if (!_hasEl) Vue.config.ignoredElements = [..._existing, /^el-/];

// camelCase → kebab-case，把 prop 名映射为可观察的 attribute 名
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// 提取业务组件声明的 prop 名列表（数组 / 对象）
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
    this.vm = null;
    this._offLocale = null;
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

  connectedCallback() {
    // 不使用 Shadow DOM，直接挂载到 light DOM，让 ElementUI 全局样式能穿透
    // 使用 reactive data 承载 props 与 scope，attributeChangedCallback 中更新
    // this.vm.widgetProps 即可触发响应式重渲染
    this.vm = new Vue({
      data: { widgetProps: this._collectProps(), widgetScope: this._scope },
      render(h) {
        return h(Component, { props: { ...this.widgetProps, scope: this.widgetScope } });
      }
    });
    this.vm.$mount();
    this.appendChild(this.vm.$el);
    // locale 变化时强制重渲染，组件内 t() 自然返回新语言文案
    // （物料组件无需自建 localeTick/onLocaleChange，由 wrapper 基础设施层统一处理）
    this._offLocale = onLocaleChange(() => {
      if (this.vm) this.vm.$forceUpdate();
    });
  }

  disconnectedCallback() {
    if (this._offLocale) { this._offLocale(); this._offLocale = null; }
    if (this.vm) {
      this.vm.$destroy();
      this.vm = null;
      this._scope = null;
      this._widgetScope = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.vm || oldValue === newValue) return;
    // 独立 prop 属性变化：反查 prop 名，整体替换 widgetProps 触发重渲染
    const names = getDeclaredPropNames(Component).filter(n => n !== 'scope');
    const propName = names.find(n => camelToKebab(n) === name);
    if (propName) {
      this.vm.widgetProps = {
        ...this.vm.widgetProps,
        [propName]: parseAttrValue(newValue, getPropType(Component, propName))
      };
    }
  }
}

customElements.define('${widgetName}', WidgetElement);
`;
}

module.exports = function widgetVueCliPlugin(options = {}) {
  if (!options.name || !options.component) {
    throw new Error('[widget-vue-cli-plugin] 请配置 name 和 component');
  }

  const { name, component, vueGlobal = 'Vue', autoNamespace = true, scanRisks = true, riskScanPaths, failOnHighRisk = false, enforceScoped = 'error', scopedScanPaths, enforceCssNamespace = 'warn', cssNamespaceScanPaths } = options;

  return function chainWebpack(config) {
    const wrapperCode = generateVue2Wrapper(name, vueGlobal);
    const tmpFile = path.join(os.tmpdir(), `widget-wrapper-${name}-${Date.now()}.js`);
    fs.writeFileSync(tmpFile, wrapperCode);

    // 替换入口为 wrapper：不假设入口名为 'app'，读取实际入口并替换
    // 避免用户自定义入口名（如 'main'）时残留旧入口导致多 chunk 打包
    // 注意：webpack-chain 的 entryPoints.store 是底层 Map，不同版本 entryPoints 无 keys()
    const entryStore = config.entryPoints.store;
    const entryNames = Array.from(entryStore.keys());
    if (entryNames.length === 0) {
      config.entry('app').add(tmpFile);
    } else {
      const keep = entryNames[0];
      // 删除除第一个外的所有入口，避免产出多余 chunk
      for (const n of entryNames) {
        if (n !== keep) entryStore.delete(n);
      }
      config.entry(keep).clear().add(tmpFile);
    }
    config.output
      .filename(`${name}.js`)
      .library(name)
      .libraryTarget('umd');

    // external 公共依赖，允许自定义 Vue 全局变量名
    // 高频第三方库（lodash/axios）external 化，基座统一加载一份，
    // 避免 N 个物料各自打包导致体积膨胀与多版本冲突
    config.externals({
      vue: vueGlobal,
      'element-ui': 'ELEMENT',
      // 国际化运行时：基座提供 window.__wcI18n__，物料共享同一实例与 locale 状态
      'wc-i18n': '__wcI18n__',
      // 软隔离 scope 运行时：基座提供 window.__wcWidgetScope__ = { createWidgetScope }
      // 物料 wrapper 通过 createWidgetScope 创建独立 scope，作为 prop 注入业务组件
      'wc-widget-scope': '__wcWidgetScope__',
      // 高频库全局变量：lodash → window._，axios → window.axios
      'lodash': '_',
      'axios': 'axios'
    });

    // 注入组件路径别名
    const componentPath = path.resolve(process.cwd(), component);
    config.resolve.alias.set('__WIDGET_COMPONENT__', componentPath);

    // 开启 source map，方便本地调试物料
    config.devtool('source-map');

    // PostCSS 自动命名空间：构建期为所有 CSS 选择器自动添加 .{name} 前缀，
    // 防止不同物料之间的全局样式冲突（样式冲突是生产必现问题）
    // 处理 css/scss/less/stylus 四种预处理器规则链
    if (autoNamespace) {
      const namespacePlugin = createNamespacePlugin(name);
      ['css', 'scss', 'sass', 'less', 'stylus'].forEach(ruleName => {
        const rule = config.module.rules.get(ruleName);
        if (!rule) return;
        // vue-cli 对每种 lang 有 oneOf（normal/modules），逐个注入 postcss-loader
        rule.oneOfs.values().forEach(oneOf => {
          const postcssLoader = oneOf.uses.get('postcss-loader');
          if (postcssLoader) {
            postcssLoader.tap(options => {
              const postcssOptions = options.postcssOptions || options;
              const plugins = (postcssOptions.plugins || []).slice();
              plugins.push(namespacePlugin);
              return {
                ...options,
                postcssOptions: { ...postcssOptions, plugins }
              };
            });
          }
        });
      });
    }

    // 清理 html 插件，避免生成 index.html
    config.plugins.delete('html');

    // 自动生成 schema.json
    try {
      const outputDir = path.resolve(process.cwd(), 'dist');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      writeSchema(name, componentPath, path.join(outputDir, `${name}.schema.json`));
    } catch (e) {
      console.warn('[widget-vue-cli-plugin] 自动生成 schema.json 失败:', e.message);
    }

    // 构建完成后清理临时 wrapper 文件
    // 使用 webpack done hook 而非 process.once('exit')，后者在 kill -9 /
    // 进程崩溃时不会触发，导致 /tmp 目录堆积临时文件
    config.plugin('widget-wrapper-cleanup').use(class {
      apply(compiler) {
        compiler.hooks.done.tap('widget-wrapper-cleanup', stats => {
          // watch 模式下保留文件，避免后续重编译找不到入口
          if (compiler.options.watch) return;
          try { fs.unlinkSync(tmpFile); } catch (_) {}

          // ─── 强制 Vue scoped CSS 检测（构建期）───
          // 物料 <style> 不加 scoped 会泄漏全局污染基座；
          // policy: 'error' 报错(默认) / 'auto-add' 自动补 scoped / 'warn' 告警 / 'off' 关闭
          if (enforceScoped && enforceScoped !== 'off') {
            try {
              const scanPaths = (scopedScanPaths && scopedScanPaths.length)
                ? scopedScanPaths
                : [path.dirname(componentPath)];
              let allResults = [];
              scanPaths.forEach(p => {
                const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
                const { results } = checkScopedDir(abs, { policy: enforceScoped });
                allResults = allResults.concat(results);
              });
              if (allResults.length > 0) {
                const report = formatScopedResults(allResults);
                if (enforceScoped === 'error') {
                  console.error(`\n[widget-vue-cli-plugin] 物料 ${name} 存在未加 scoped 的 <style>:\n${report}`);
                  if (stats && stats.compilation) {
                    stats.compilation.errors.push(new Error(
                      `[widget-vue-cli-plugin] 物料 ${name} 存在未加 scoped 的 <style>，构建被中止（设置 enforceScoped:'auto-add' 可自动补全，'warn' 仅告警）:\n${report}`
                    ));
                  }
                } else if (enforceScoped === 'auto-add') {
                  console.warn(`\n[widget-vue-cli-plugin] 物料 ${name} 已自动为 <style> 补上 scoped:\n${report}`);
                } else {
                  console.warn(`\n[widget-vue-cli-plugin] 物料 ${name} 存在未加 scoped 的 <style>（仅告警）:\n${report}`);
                }
              }
            } catch (scopedErr) {
              console.warn('[widget-vue-cli-plugin] scoped 检测失败（不影响构建）:', scopedErr.message);
            }
          }

          // ─── CSS 命名空间检查（构建期）───
          // 检查 .vue 中选择器是否含 .{name} 命名空间前缀（物料级隔离），
          // 与 postcss-namespace 自动加前缀互补：postcss 负责"自动修复"，
          // 此检查负责"发现遗漏"（如 autoNamespace=false 或全局样式泄漏）。
          // policy: 'error' 报错 / 'warn' 告警(默认) / 'off' 关闭
          if (enforceCssNamespace && enforceCssNamespace !== 'off') {
            try {
              const scanPaths = (cssNamespaceScanPaths && cssNamespaceScanPaths.length)
                ? cssNamespaceScanPaths
                : [path.dirname(componentPath)];
              let allIssues = [];
              scanPaths.forEach(p => {
                const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
                const { issues } = checkCssNamespace(abs, name);
                allIssues = allIssues.concat(issues);
              });
              if (allIssues.length > 0) {
                const report = formatCssIssues(allIssues);
                if (enforceCssNamespace === 'error') {
                  console.error(`\n[widget-vue-cli-plugin] 物料 ${name} 存在未加命名空间的选择器:\n${report}`);
                  if (stats && stats.compilation) {
                    stats.compilation.errors.push(new Error(
                      `[widget-vue-cli-plugin] 物料 ${name} 存在 ${allIssues.length} 个未加命名空间的选择器，构建被中止（设置 enforceCssNamespace:'warn' 降级，或确认 autoNamespace 已开启）:\n${report}`
                    ));
                  }
                } else {
                  console.warn(`\n[widget-vue-cli-plugin] 物料 ${name} 存在未加命名空间的选择器（仅告警）:\n${report}`);
                }
              }
            } catch (nsErr) {
              console.warn('[widget-vue-cli-plugin] 命名空间检查失败（不影响构建）:', nsErr.message);
            }
          }

          // ─── JS 危险 API 静态扫描（构建期）───
          // 扫描物料源码中的危险模式（document.body 挂载、window 赋值、全局注册等），
          // 默认仅告警；failOnHighRisk=true 时发现高风险则让构建失败。
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
                  console.warn(`\n[widget-vue-cli-plugin] 物料 ${name} 危险 API 扫描发现高风险:\n${report}`);
                  if (failOnHighRisk && stats && stats.compilation) {
                    stats.compilation.errors.push(new Error(
                      `[widget-vue-cli-plugin] 物料 ${name} 存在 ${highCount} 个高风险 API 调用，构建被中止（设置 failOnHighRisk:false 可降级为告警）:\n${report}`
                    ));
                  }
                } else {
                  console.warn(`\n[widget-vue-cli-plugin] 物料 ${name} 危险 API 扫描（仅中风险，告警）:\n${report}`);
                }
              }
            } catch (scanErr) {
              console.warn('[widget-vue-cli-plugin] 危险 API 扫描失败（不影响构建）:', scanErr.message);
            }
          }
        });
      }
    });
  };
};

// 兼容 configureWebpack 对象写法
module.exports.generateVue2Wrapper = generateVue2Wrapper;
