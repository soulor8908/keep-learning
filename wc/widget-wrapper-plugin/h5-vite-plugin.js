/**
 * H5 物料自动包装 Vite 插件（无框架依赖）
 *
 * 与 vue2/vue3 的 vite-plugin 对应，但面向原生 H5 物料：
 * - 物料入口只需 default 导出 render 函数或配置对象，无需手写
 *   createH5Widget + customElements.define 样板代码
 * - 构建期自动生成 wrapper：解析入口 → 创建 scope → 定义 Custom Element
 * - 输出 UMD 格式，light DOM（禁止 Shadow DOM）
 *
 * 入口约定（entry 指向的源文件）：
 *   方式 A：导出 render 函数
 *     export default function render(props, scope) {
 *       return `<div class="bi-weather-card">...</div>`;
 *     }
 *   方式 B：导出配置对象
 *     export default {
 *       props: ['title', 'items'],
 *       render(props, scope) { return `<div>...</div>`; },
 *       onMount(el, props, scope) { /* 绑定事件 *\/ },
 *       onUnmount(el, scope) { /* 清理 *\/ },
 *       onPropsChange(el, newProps, oldProps, scope) {}
 *     };
 *
 * 用法（vite.config.js）：
 *   import h5WidgetPlugin from 'wc/widget-wrapper-plugin/h5-vite-plugin';
 *   export default {
 *     plugins: [
 *       h5WidgetPlugin({
 *         name: 'bi-weather-card',
 *         entry: './src/weather-card.js'
 *       })
 *     ]
 *   };
 *
 * 构建产物：dist/{name}.js（UMD）+ dist/{name}.css
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';
import { createNamespacePlugin } from './postcss-namespace.js';

const require = createRequire(import.meta.url);
const { scanTarget, formatFindings } = require('../js-risk-scanner');
const { checkTarget: checkCssNamespace, formatIssues: formatCssIssues } = require('../css-namespace-checker');

/**
 * 生成 H5 物料 wrapper 代码
 *
 * 策略：内联 createH5Widget 逻辑（与 h5-widget-template/widget-wrapper.js 一致），
 * 避免运行时依赖 h5-widget-template 模块，保持 H5 物料"无框架、自包含"特性。
 * scope 优先用 wc-widget-scope（基座提供 window.__wcWidgetScope__），不可用时
 * 回退到内建最小 scope（仅 meta/log，保证可独立运行）。
 *
 * @param {string} widgetName 物料名（Custom Element 标签名）
 * @returns {string} wrapper 源码
 */
export function generateH5Wrapper(widgetName) {
  return `
import widgetEntry from '__WIDGET_ENTRY__';
import { createWidgetScope } from 'wc-widget-scope';

// ─── 重要：禁止使用 Shadow DOM ───
// H5 物料挂载到 light DOM，与基座共享全局样式（主题、字体图标等）。
// 若未来误引入 attachShadow，element-plus / 基座主题样式将无法穿透。

// ─── 内建最小 scope（wc-widget-scope 不可用时的兜底）───
// 结构与 wc/widget-scope 一致，仅提供 meta + log + no-op 的 context/bus/t/request。
// 物料项目若需完整能力，基座应注入 window.__wcWidgetScope__ = { createWidgetScope }。
function createMinimalScope(widgetName) {
  const meta = Object.freeze({
    name: widgetName,
    version: '',
    host: '',
    __isWidgetScope: true,
    __minimal: true
  });
  const noopAsync = () => Promise.resolve();
  return Object.freeze({
    meta,
    log: {
      info: (...a) => console.log('[' + widgetName + ']', ...a),
      warn: (...a) => console.warn('[' + widgetName + ']', ...a),
      error: (...a) => console.error('[' + widgetName + ']', ...a),
      debug: () => {}
    },
    context: { get: () => Promise.resolve({}), onChange: () => Promise.resolve(() => {}) },
    bus: { emit: noopAsync, on: () => Promise.resolve(() => {}), once: () => Promise.resolve(() => {}) },
    t: (k) => Promise.resolve(k),
    request: (url, options) => {
      if (typeof globalThis.fetch !== 'function') {
        return Promise.reject(new Error('[h5-widget-scope] fetch unavailable'));
      }
      return Promise.resolve(globalThis.fetch(url, options));
    },
    __noGlobalAccess: true
  });
}

// ─── 解析入口：函数 → { render: fn }；对象 → 原样 ───
const widgetOpts = typeof widgetEntry === 'function'
  ? { render: widgetEntry }
  : (widgetEntry && typeof widgetEntry === 'object' ? widgetEntry : {});

const { render, onMount, onUnmount, onPropsChange, props: declaredProps } = widgetOpts;

if (typeof render !== 'function') {
  throw new Error('[h5-widget-wrapper] 物料入口必须 default 导出 render 函数或含 render 的配置对象');
}

// camelCase → kebab-case，把 prop 名映射为可观察的 attribute 名
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// 按属性值解析为最终值：优先 JSON.parse，失败回退原始字符串
function parseAttrValue(raw) {
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

// 独立 prop 的 kebab attribute 名 → camel prop 名 映射
const propAttrMap = new Map(
  (Array.isArray(declaredProps) ? declaredProps : []).map(p => [camelToKebab(p), p])
);

class H5WidgetElement extends HTMLElement {
  constructor() {
    super();
    this._props = null;
    this._cleanup = null;
    // 每个物料实例创建独立的 widgetScope 软隔离对象。
    // 优先用完整 scope（基座提供 wc-widget-scope），否则用最小 scope 兜底。
    // scope 含 context/bus/log/t/request/loader（嵌套加载带循环检测）
    try {
      this._scope = createWidgetScope({ name: '${widgetName}' });
    } catch (e) {
      this._scope = createMinimalScope('${widgetName}');
    }
    this._widgetScope = this._scope;
  }

  static get observedAttributes() {
    // 仅观察声明的独立 prop 的 kebab attribute
    return [...propAttrMap.keys()];
  }

  // 收集所有已设置的独立 prop 属性，解析为扁平 props 对象传给 render
  _collectProps() {
    const result = {};
    for (const [attrName, propName] of propAttrMap) {
      if (this.hasAttribute(attrName)) {
        result[propName] = parseAttrValue(this.getAttribute(attrName));
      }
    }
    return result;
  }

  connectedCallback() {
    // 防御性守卫：若未来误引入 attachShadow，立即告警
    if (this.shadowRoot) {
      console.error(
        '[h5-widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，' +
        '基座全局样式将无法穿透。请勿使用 attachShadow。'
      );
    }
    this._props = this._collectProps();
    this._render();
    if (typeof onMount === 'function') {
      this._cleanup = onMount(this, this._props, this._scope) || null;
    }
  }

  disconnectedCallback() {
    if (typeof onUnmount === 'function') {
      onUnmount(this, this._scope);
    }
    if (typeof this._cleanup === 'function') {
      this._cleanup();
      this._cleanup = null;
    }
    this._props = null;
    this._scope = null;
    this._widgetScope = null;
  }

  attributeChangedCallback(attrName, oldValue, newValue) {
    if (oldValue === newValue) return;
    const oldProps = this._props;
    this._props = this._collectProps();
    this._render();
    if (typeof onPropsChange === 'function') {
      onPropsChange(this, this._props, oldProps, this._scope);
    }
  }

  _render() {
    if (typeof render !== 'function') return;
    const html = render(this._props, this._scope);
    if (typeof html === 'string') {
      this.innerHTML = html;
    }
  }

  getProps() {
    return this._props ? Object.assign({}, this._props) : {};
  }

  getScope() {
    return this._scope;
  }
}

if (!customElements.get('${widgetName}')) {
  customElements.define('${widgetName}', H5WidgetElement);
}
`;
}

/**
 * H5 物料 Vite 插件
 * @param {object} options
 * @param {string} options.name 物料名（Custom Element 标签名，如 bi-weather-card）
 * @param {string} options.entry 物料入口文件路径（导出 render 函数或配置对象）
 * @param {string} [options.cssFileName] CSS 输出文件名，默认同 name
 * @param {boolean} [options.autoNamespace=true] 是否开启 PostCSS 自动命名空间
 * @param {boolean} [options.scanRisks=true] 是否开启危险 API 扫描
 * @param {string[]} [options.riskScanPaths] 危险 API 扫描路径（默认入口所在目录）
 * @param {boolean} [options.failOnHighRisk=false] 高危项是否构建报错
 * @param {string} [options.enforceCssNamespace='warn'] CSS 命名空间检查策略：'error'/'warn'/'off'
 * @param {string[]} [options.cssNamespaceScanPaths] CSS 命名空间检查路径
 */
export default function h5WidgetVitePlugin(options = {}) {
  const {
    name,
    entry,
    cssFileName = name,
    autoNamespace = true,
    scanRisks = true,
    riskScanPaths,
    failOnHighRisk = false,
    enforceCssNamespace = 'warn',
    cssNamespaceScanPaths
  } = options;

  if (!name || !entry) {
    throw new Error('[h5-widget-vite-plugin] 请配置 name 和 entry');
  }

  const entryPath = path.resolve(process.cwd(), entry);
  if (!fs.existsSync(entryPath)) {
    throw new Error(`[h5-widget-vite-plugin] 入口文件不存在: ${entryPath}`);
  }

  const wrapperCode = generateH5Wrapper(name);
  const tmpFile = path.join(os.tmpdir(), `h5-widget-wrapper-${name}-${Date.now()}.js`);
  fs.writeFileSync(tmpFile, wrapperCode);

  // PostCSS 自动命名空间插件实例
  const namespacePlugin = autoNamespace ? createNamespacePlugin(name) : null;

  return {
    name: 'h5-widget-wrapper-plugin',
    config: () => ({
      build: {
        sourcemap: true,
        cssCodeSplit: false,
        lib: {
          entry: tmpFile,
          name,
          fileName: () => `${name}.js`,
          formats: ['umd'],
          cssFileName
        },
        rollupOptions: {
          // H5 物料无 Vue 依赖；wc-widget-scope 由基座提供（window.__wcWidgetScope__）
          // 高频第三方库（lodash/axios）同样 external 化，基座统一加载一份
          external: ['wc-widget-scope', 'lodash', 'axios'],
          output: {
            globals: {
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
          __WIDGET_ENTRY__: entryPath
        }
      },
      ...(namespacePlugin ? {
        css: {
          postcss: {
            plugins: [namespacePlugin]
          }
        }
      } : {})
    }),

    closeBundle() {
      // ─── CSS 命名空间检查（构建期）───
      // H5 物料无 .vue 文件，不适用 scoped-style-checker；
      // css-namespace-checker 已支持 .css/.scss/.less 文件，检查选择器是否含 .{name} 前缀。
      if (enforceCssNamespace && enforceCssNamespace !== 'off') {
        let nsIssues = [];
        try {
          const scanPaths = (cssNamespaceScanPaths && cssNamespaceScanPaths.length)
            ? cssNamespaceScanPaths
            : [path.dirname(entryPath)];
          scanPaths.forEach(p => {
            const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
            const { issues } = checkCssNamespace(abs, name);
            nsIssues = nsIssues.concat(issues);
          });
        } catch (nsErr) {
          console.warn('[h5-widget-vite-plugin] 命名空间检查失败（不影响构建）:', nsErr.message);
        }
        if (nsIssues.length > 0) {
          const report = formatCssIssues(nsIssues);
          if (enforceCssNamespace === 'error') {
            throw new Error(
              `[h5-widget-vite-plugin] 物料 ${name} 存在 ${nsIssues.length} 个未加命名空间的选择器，构建被中止:\n${report}`
            );
          } else {
            console.warn(`\n[h5-widget-vite-plugin] 物料 ${name} 存在未加命名空间的选择器（仅告警）:\n${report}`);
          }
        }
      }

      // ─── JS 危险 API 静态扫描（构建期）───
      if (scanRisks) {
        try {
          const scanPaths = (riskScanPaths && riskScanPaths.length)
            ? riskScanPaths
            : [path.dirname(entryPath)];
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
              console.warn(`\n[h5-widget-vite-plugin] 物料 ${name} 危险 API 扫描发现高风险:\n${report}`);
              if (failOnHighRisk) {
                throw new Error(
                  `[h5-widget-vite-plugin] 物料 ${name} 存在 ${highCount} 个高风险 API 调用，构建被中止:\n${report}`
                );
              }
            } else {
              console.warn(`\n[h5-widget-vite-plugin] 物料 ${name} 危险 API 扫描（仅中风险，告警）:\n${report}`);
            }
          }
        } catch (scanErr) {
          if (failOnHighRisk && scanErr && scanErr.message && scanErr.message.includes('高风险')) {
            throw scanErr;
          }
          console.warn('[h5-widget-vite-plugin] 危险 API 扫描失败（不影响构建）:', scanErr.message);
        }
      }

      // 清理临时 wrapper 文件
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  };
}
