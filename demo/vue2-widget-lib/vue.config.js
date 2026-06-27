const widgetPlugin = require('@wc/widget-wrapper-plugin/vue-cli-plugin');
const fs = require('fs');
const path = require('path');

const isWidgetBuild = process.env.NODE_ENV === 'production' || process.env.WIDGET_BUILD === 'true';
const widgetName = process.env.WIDGET_NAME;

// 物料名 → 组件路径映射（自动发现）
// 约定：src/components 下的 PascalCase.vue 自动映射为 bi-kebab-case
// 例如 SalesPanel.vue → bi-sales-panel，新增物料无需手动维护此映射
function discoverWidgets(componentsDir) {
  const map = {};
  if (!fs.existsSync(componentsDir)) return map;
  fs.readdirSync(componentsDir).forEach(file => {
    if (!file.endsWith('.vue')) return;
    const basename = file.replace(/\.vue$/, '');
    // PascalCase → kebab-case
    const kebab = basename
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();
    map[`bi-${kebab}`] = `./src/components/${file}`;
  });
  return map;
}

const WIDGET_MAP = discoverWidgets(path.resolve(__dirname, 'src/components'));

module.exports = {
  // 构建物料时把 scoped style 注入 JS，避免单独加载 CSS
  css: {
    extract: isWidgetBuild ? false : undefined
  },
  // 构建物料：通过 WIDGET_NAME 选择对应组件，用插件输出 UMD
  // 多物料共存于同一 dist/：build:all 脚本用 --no-clean 避免后构建覆盖前者
  chainWebpack: (config) => {
    if (isWidgetBuild) {
      // 物料构建模式下始终配置 externals，无论是否指定了 WIDGET_NAME
      // （serve:widget 不指定 WIDGET_NAME，但物料源码仍 import wc-i18n）
      config.externals({
        vue: 'Vue2',
        'element-ui': 'ELEMENT',
        'wc-i18n': '__wcI18n__',
        'wc-widget-scope': '__wcWidgetScope__',
        'lodash': '_',
        'axios': 'axios'
      });
      // 如果指定了具体物料，应用 widget 包装插件
      if (widgetName && WIDGET_MAP[widgetName]) {
        const pluginChain = widgetPlugin({
          name: widgetName,
          component: WIDGET_MAP[widgetName],
          vueGlobal: 'Vue2'
        });
        pluginChain(config);
      }
    }
  },
  // 本地开发：用 pages 预览组件
  pages: isWidgetBuild ? undefined : {
    index: {
      entry: 'src/main.js',
      template: 'public/index.html',
      filename: 'index.html'
    }
  }
};
