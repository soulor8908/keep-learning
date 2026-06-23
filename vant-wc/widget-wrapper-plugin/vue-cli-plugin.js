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
const { writeSchema } = require('../schema-generator');

function generateVue2Wrapper(widgetName) {
  return `
import Vue from 'vue';
import wrap from '@vue/web-component-wrapper';
import Component from '__WIDGET_COMPONENT__';

function parseConfig(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

// 桥接组件：把 Custom Element 接收到的 String config 转成 Object 再传给业务组件
const BridgeComponent = {
  props: ['config'],
  render(h) {
    return h(Component, {
      props: { config: parseConfig(this.config) }
    });
  }
};

class WidgetElement extends wrap(Vue, BridgeComponent) {}

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
    const componentPath = path.resolve(process.cwd(), component);
    config.resolve.alias.set('__WIDGET_COMPONENT__', componentPath);

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
  };
};

// 兼容 configureWebpack 对象写法
module.exports.generateVue2Wrapper = generateVue2Wrapper;
