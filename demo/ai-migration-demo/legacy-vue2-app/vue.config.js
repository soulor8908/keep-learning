// 老项目 vue.config.js（迁移前）：
// 普通 Vue CLI 配置，仅做本地预览，不涉及 wc 物料打包。
// 迁移后会引入 wc/widget-wrapper-plugin/vue-cli-plugin 输出 UMD 物料（见 README 迁移后说明）。
module.exports = {
  pages: {
    index: {
      entry: 'src/main.js',
      template: 'public/index.html',
      filename: 'index.html'
    }
  }
};
