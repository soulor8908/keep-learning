const path = require('path');

// 通过环境变量传入：
// WIDGET_NAME=bi-sales-panel WIDGET_COMPONENT=./src/components/SalesPanel.vue
const widgetName = process.env.WIDGET_NAME;
const widgetComponent = process.env.WIDGET_COMPONENT;

if (!widgetName || !widgetComponent) {
  throw new Error('请设置环境变量 WIDGET_NAME 和 WIDGET_COMPONENT');
}

module.exports = {
  // 不生成 HTML，只输出 JS
  filenameHashing: false,
  css: {
    extract: true
  },
  configureWebpack: {
    entry: path.resolve(__dirname, './widget-wrapper.js'),
    output: {
      filename: `${widgetName}.js`,
      library: widgetName,
      libraryTarget: 'umd'
    },
    externals: {
      // 基座统一提供，避免重复打包
      vue: 'Vue',
      'element-ui': 'ELEMENT'
    },
    resolve: {
      alias: {
        // 让 wrapper 里的动态 require 能定位到业务组件
        __WIDGET_COMPONENT__: path.resolve(process.cwd(), widgetComponent)
      }
    }
  },
  chainWebpack: config => {
    // 注入环境变量
    config.plugin('define').tap(args => {
      args[0]['process.env.WIDGET_NAME'] = JSON.stringify(widgetName);
      args[0]['process.env.WIDGET_COMPONENT'] = JSON.stringify('__WIDGET_COMPONENT__');
      return args;
    });
  }
};
