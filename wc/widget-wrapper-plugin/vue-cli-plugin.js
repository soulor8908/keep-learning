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

function generateVue2Wrapper(widgetName, vueGlobal) {
  return `
import Vue from 'vue';
import Component from '__WIDGET_COMPONENT__';

// 告诉 Vue2 编译器 el-* 是自定义元素，不要当 Vue 组件解析
// 使用合并而非覆盖，避免污染基座或其他物料的 ignoredElements 配置
// 去重检查：同页多物料加载时避免重复添加 /^el-/
const _existing = Array.isArray(Vue.config.ignoredElements) ? Vue.config.ignoredElements : [];
const _hasEl = _existing.some(re => re instanceof RegExp && re.source === '^el-');
if (!_hasEl) Vue.config.ignoredElements = [..._existing, /^el-/];

function parseConfig(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

class WidgetElement extends HTMLElement {
  constructor() {
    super();
    this.vm = null;
  }

  static get observedAttributes() {
    return ['config'];
  }

  connectedCallback() {
    const config = this.getAttribute('config');
    // 不使用 Shadow DOM，直接挂载到 light DOM，让 aui 全局样式能穿透
    // 使用 reactive data 承载 config，attributeChangedCallback 中更新
    // this.vm.widgetConfig 即可触发响应式重渲染，无需依赖 $children 内部 API
    this.vm = new Vue({
      data: { widgetConfig: parseConfig(config) },
      render(h) {
        return h(Component, { props: { config: this.widgetConfig } });
      }
    });
    this.vm.$mount();
    this.appendChild(this.vm.$el);
  }

  disconnectedCallback() {
    if (this.vm) {
      this.vm.$destroy();
      this.vm = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // 更新 reactive data，Vue 自动触发重渲染，不依赖 $children[0] 顺序
    if (name === 'config' && this.vm) {
      this.vm.widgetConfig = parseConfig(newValue);
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

  const { name, component, vueGlobal = 'Vue', autoNamespace = true } = options;

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
    config.externals({
      vue: vueGlobal,
      'element-ui': 'ELEMENT',
      // 国际化运行时：基座提供 window.__wcI18n__，物料共享同一实例与 locale 状态
      'wc-i18n': '__wcI18n__'
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
        compiler.hooks.done.tap('widget-wrapper-cleanup', () => {
          // watch 模式下保留文件，避免后续重编译找不到入口
          if (compiler.options.watch) return;
          try { fs.unlinkSync(tmpFile); } catch (_) {}
        });
      }
    });
  };
};

// 兼容 configureWebpack 对象写法
module.exports.generateVue2Wrapper = generateVue2Wrapper;
