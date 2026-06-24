const widgetPlugin = require('../../wc/widget-wrapper-plugin/vue-cli-plugin');

const isWidgetBuild = process.env.NODE_ENV === 'production' || process.env.WIDGET_BUILD === 'true';
const widgetName = process.env.WIDGET_NAME;

// 物料名 → 组件路径映射
const WIDGET_MAP = {
  'bi-sales-panel': './src/components/SalesPanel.vue',
  'bi-filter-bar': './src/components/FilterBar.vue',
  'bi-chart-panel': './src/components/ChartPanel.vue'
};

module.exports = {
  // 构建物料时把 scoped style 注入 JS，避免单独加载 CSS
  css: {
    extract: isWidgetBuild ? false : undefined
  },
  // 构建物料：通过 WIDGET_NAME 选择对应组件，用插件输出 UMD
  chainWebpack: isWidgetBuild && widgetName && WIDGET_MAP[widgetName] ? widgetPlugin({
    name: widgetName,
    component: WIDGET_MAP[widgetName],
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
