const widgetPlugin = require('../../wc/widget-wrapper-plugin/vue-cli-plugin');

const isWidgetBuild = process.env.NODE_ENV === 'production' || process.env.WIDGET_BUILD === 'true';

module.exports = {
  // 构建物料时把 scoped style 注入 JS，避免单独加载 CSS
  css: {
    extract: isWidgetBuild ? false : undefined
  },
  // 构建物料：用插件输出 UMD
  chainWebpack: isWidgetBuild ? widgetPlugin({
    name: 'bi-sales-panel',
    component: './src/components/SalesPanel.vue',
    // 使用独立全局名，避免与 Vue3 物料冲突
    vueGlobal: 'Vue2'
  }) : undefined,
  // 本地开发：用 pages 预览组件
  pages: isWidgetBuild ? undefined : {
    index: {
      entry: 'src/main.js',
      template: 'public/index.html',
      filename: 'index.html'
    }
  }
};
