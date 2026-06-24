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

function generateVue2Wrapper(widgetName, vueGlobal) {
  return `
import Vue from 'vue';
import Component from '__WIDGET_COMPONENT__';

// 告诉 Vue2 编译器 el-* 是自定义元素，不要当 Vue 组件解析
Vue.config.ignoredElements = [/^el-/];

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
    this.vm = new Vue({
      render: h => h(Component, { props: { config: parseConfig(config) } })
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
    if (name === 'config' && this.vm && this.vm.$children[0]) {
      this.vm.$children[0].config = parseConfig(newValue);
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

  const { name, component, vueGlobal = 'Vue' } = options;

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

    // 构建进程结束后清理临时 wrapper 文件，避免 tmp 目录堆积
    process.once('exit', () => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    });
  };
};

// 兼容 configureWebpack 对象写法
module.exports.generateVue2Wrapper = generateVue2Wrapper;
