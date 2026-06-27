/**
 * Vue CLI 物料自动包装插件（Vue2 专用）
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
const { createNamespacePlugin } = require('./postcss-namespace');

function generateVue2Wrapper(widgetName, vueGlobal) {
  return `
import Vue from 'vue';
import Component from '__WIDGET_COMPONENT__';
import { createWidgetScope } from 'wc-widget-scope';
import { onLocaleChange } from 'wc-i18n';

// 告诉 Vue2 编译器 el-* 是自定义元素，不要当 Vue 组件解析
const _existing = Array.isArray(Vue.config.ignoredElements) ? Vue.config.ignoredElements : [];
const _hasEl = _existing.some(re => re instanceof RegExp && re.source === '^el-');
if (!_hasEl) Vue.config.ignoredElements = [..._existing, /^el-/];

// camelCase → kebab-case
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// 提取业务组件声明的 prop 名列表
function getDeclaredPropNames(Component) {
  const props = Component && Component.props;
  if (!props) return [];
  if (Array.isArray(props)) return props.filter(p => typeof p === 'string');
  return Object.keys(props);
}

// 取某个 prop 的声明类型构造器
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

// 预计算 prop 映射
const individualPropNames = getDeclaredPropNames(Component).filter(n => n !== 'scope');
const attrToProp = new Map(individualPropNames.map(n => [camelToKebab(n), n]));
const observedAttrs = [...new Set(individualPropNames.map(camelToKebab))];

class WidgetElement extends HTMLElement {
  constructor() {
    super();
    this.vm = null;
    this._offLocale = null;
    this._scope = createWidgetScope({ name: '${widgetName}' });
    this._widgetScope = this._scope;
  }

  static get observedAttributes() {
    return observedAttrs;
  }

  _collectProps() {
    const result = {};
    for (const [attrName, propName] of attrToProp) {
      if (this.hasAttribute(attrName)) {
        result[propName] = parseAttrValue(this.getAttribute(attrName), getPropType(Component, propName));
      }
    }
    return result;
  }

  connectedCallback() {
    if (this.shadowRoot) {
      console.error(
        '[widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，' +
        'ElementUI 全局样式将无法穿透。请勿使用 attachShadow。'
      );
    }
    this.vm = new Vue({
      data: { widgetProps: this._collectProps(), widgetScope: this._scope },
      render(h) {
        return h(Component, { props: { ...this.widgetProps, scope: this.widgetScope } });
      }
    });
    this.vm.$mount();
    this.appendChild(this.vm.$el);
    this._offLocale = onLocaleChange(() => {
      const widget = this.vm && this.vm.$children && this.vm.$children[0];
      if (widget) widget.$forceUpdate();
    });
  }

  disconnectedCallback() {
    if (this._offLocale) { this._offLocale(); this._offLocale = null; }
    if (this.vm) {
      this.vm.$destroy();
      this.vm = null;
      if (this._scope && typeof this._scope.destroy === 'function') this._scope.destroy();
      this._scope = null;
      this._widgetScope = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.vm || oldValue === newValue) return;
    const propName = attrToProp.get(name);
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

// ─── Dev-Preview 入口模板（Vue2）───
function generateDevPreviewEntryVue2(widgetName, componentPath) {
  return `
import Vue from 'vue';
import wrap from '@vue/web-component-wrapper';
import Component from '${componentPath.replace(/\\/g, '/')}';

// 桥接组件：把宿主 attribute 透传给业务组件
const BridgeComponent = {
  props: Object.keys(Component.props || {}),
  render(h) {
    return h(Component, { props: this.$props });
  }
};

if (!customElements.get('${widgetName}')) {
  customElements.define('${widgetName}', wrap(Vue, BridgeComponent));
}

// 自动挂载预览
new Vue({
  el: '#app',
  template: '<div><h2>${widgetName} - Dev Preview</h2><${widgetName}></${widgetName}></div>'
});
`;
}

module.exports = function widgetVueCliPlugin(options = {}) {
  if (!options.name || !options.component) {
    throw new Error('[widget-vue-cli-plugin] 请配置 name 和 component');
  }

  const { name, component, vueGlobal = 'Vue2', autoNamespace = true } = options;
  // dev-preview 模式判定：仅在 vue-cli-service serve（NODE_ENV=development 且存在 VUE_CLI_SERVICE）时启用
  // 避免纯测试环境（NODE_ENV 未设置）误入 dev 路径
  const isDev = process.env.NODE_ENV === 'development' && !!process.env.VUE_CLI_SERVICE;

  return function chainWebpack(config) {
    const componentPath = path.resolve(process.cwd(), component);

    // ─── Dev-Preview 模式：自动生成预览入口，不打包 UMD ───
    if (isDev) {
      const devEntryCode = generateDevPreviewEntryVue2(name, componentPath);
      const devEntryFile = path.join(os.tmpdir(), `widget-dev-entry-${name}-${Date.now()}.js`);
      fs.writeFileSync(devEntryFile, devEntryCode);

      // 替换入口为 dev preview
      const entryStore = config.entryPoints.store;
      const entryNames = Array.from(entryStore.keys());
      if (entryNames.length === 0) {
        config.entry('app').add(devEntryFile);
      } else {
        const keep = entryNames[0];
        for (const n of entryNames) {
          if (n !== keep) entryStore.delete(n);
        }
        config.entry(keep).clear().add(devEntryFile);
      }

      // dev 模式保留 html 插件（由 vue-cli-service 默认提供），不设置 UMD/externals
      // PostCSS 命名空间仍启用
      if (autoNamespace) {
        const namespacePlugin = createNamespacePlugin(name);
        ['css', 'scss', 'sass', 'less', 'stylus'].forEach(ruleName => {
          const rule = config.module.rules.get(ruleName);
          if (!rule) return;
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

      // 构建完成后清理临时文件
      config.plugin('widget-dev-cleanup').use(class {
        apply(compiler) {
          compiler.hooks.done.tap('widget-dev-cleanup', () => {
            if (compiler.options.watch) return;
            try { fs.unlinkSync(devEntryFile); } catch (_) {}
          });
        }
      });
      return;
    }

    // ─── Build 模式：UMD 打包 ───
    const wrapperCode = generateVue2Wrapper(name, vueGlobal);
    const tmpFile = path.join(os.tmpdir(), `widget-wrapper-${name}-${Date.now()}.js`);
    fs.writeFileSync(tmpFile, wrapperCode);

    // 替换入口为 wrapper
    const entryStore = config.entryPoints.store;
    const entryNames = Array.from(entryStore.keys());
    if (entryNames.length === 0) {
      config.entry('app').add(tmpFile);
    } else {
      const keep = entryNames[0];
      for (const n of entryNames) {
        if (n !== keep) entryStore.delete(n);
      }
      config.entry(keep).clear().add(tmpFile);
    }
    config.output
      .filename(`${name}.js`)
      .library(name)
      .libraryTarget('umd');

    // external 公共依赖
    config.externals({
      vue: vueGlobal,
      'element-ui': 'ELEMENT',
      'wc-i18n': '__wcI18n__',
      'wc-widget-scope': '__wcWidgetScope__',
      'lodash': '_',
      'axios': 'axios'
    });

    config.resolve.alias.set('__WIDGET_COMPONENT__', componentPath);
    config.devtool('source-map');

    // PostCSS 自动命名空间
    if (autoNamespace) {
      const namespacePlugin = createNamespacePlugin(name);
      ['css', 'scss', 'sass', 'less', 'stylus'].forEach(ruleName => {
        const rule = config.module.rules.get(ruleName);
        if (!rule) return;
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

    // 清理 html 插件
    config.plugins.delete('html');

    // 构建完成后清理临时 wrapper 文件
    config.plugin('widget-wrapper-cleanup').use(class {
      apply(compiler) {
        compiler.hooks.done.tap('widget-wrapper-cleanup', stats => {
          if (compiler.options.watch) return;
          try { fs.unlinkSync(tmpFile); } catch (_) {}
        });
      }
    });
  };
};

module.exports.generateVue2Wrapper = generateVue2Wrapper;
