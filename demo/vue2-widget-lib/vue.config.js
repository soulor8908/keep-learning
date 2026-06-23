const widgetPlugin = require('../../wc/widget-wrapper-plugin/vue-cli-plugin');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  // 生产构建：把 scoped style 注入 JS，避免单独加载 CSS
  css: {
    extract: isProduction ? false : undefined
  },
  // 生产构建：用插件输出 UMD 物料
  chainWebpack: isProduction ? widgetPlugin({
    name: 'bi-sales-panel',
    component: './src/components/SalesPanel.vue',
    // 使用独立全局名，避免与 Vue3 物料冲突
    vueGlobal: 'Vue2'
  }) : undefined,
  // 本地开发：用 pages 预览组件
  pages: isProduction ? undefined : {
    index: {
      entry: 'src/main.js',
      template: 'public/index.html',
      filename: 'index.html'
    }
  }
};
