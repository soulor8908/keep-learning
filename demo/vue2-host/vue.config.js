const path = require('path');

module.exports = {
  chainWebpack: config => {
    // 让基座能直接引入 wc 目录下的 ES Module 工具
    config.module
      .rule('js')
      .include.add(path.resolve(__dirname, '../../wc'));
  }
};
