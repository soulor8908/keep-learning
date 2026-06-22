/**
 * Vue CLI 物料自动包装插件
 *
 * 使用方式（vue.config.js）：
 * const WidgetPlugin = require('@your-scope/widget-wrapper-plugin/vue-cli-plugin');
 *
 * module.exports = {
 *   pluginOptions: {
 *     widget: {
 *       name: 'bi-sales-panel',
 *       component: './src/components/SalesPanel.vue'
 *     }
 *   },
 *   configureWebpack: WidgetPlugin()
 * };
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

function generateVue2Wrapper(widgetName) {
  return `
import Vue from 'vue';
import wrap from '@vue/web-component-wrapper';
import Component from '__WIDGET_COMPONENT__';

function parseConfig(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

class WidgetElement extends wrap(Vue, Component) {
  static get observedAttributes() { return ['config']; }
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'config' && this._vnode && this._vnode.componentInstance) {
      this._vnode.componentInstance.config = parseConfig(newValue);
    }
    super.attributeChangedCallback && super.attributeChangedCallback(name, oldValue, newValue);
  }
}

customElements.define('${widgetName}', WidgetElement);
`;
}

module.exports = function widgetVueCliPlugin() {
  return function chainWebpack(config) {
    const options = config.pluginOptions && config.pluginOptions.widget;
    if (!options || !options.name || !options.component) {
      throw new Error('[widget-vue-cli-plugin] 请在 pluginOptions.widget 中配置 name 和 component');
    }

    const { name, component } = options;
    const wrapperCode = generateVue2Wrapper(name);
    const tmpFile = path.join(os.tmpdir(), `widget-wrapper-${name}-${Date.now()}.js`);
    fs.writeFileSync(tmpFile, wrapperCode);

    config.entry('app').clear().add(tmpFile);
    config.output
      .filename(`${name}.js`)
      .library(name)
      .libraryTarget('umd');

    // external 公共依赖
    config.externals({
      vue: 'Vue',
      aui: 'aui'
    });

    // 注入组件路径别名
    config.resolve.alias.set('__WIDGET_COMPONENT__', path.resolve(process.cwd(), component));

    // 清理 html 插件，避免生成 index.html
    config.plugins.delete('html');
  };
};

// 兼容 configureWebpack 对象写法
module.exports.generateVue2Wrapper = generateVue2Wrapper;
