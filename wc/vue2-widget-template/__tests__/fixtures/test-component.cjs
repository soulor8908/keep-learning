// vue2 wrapper 在自动注册分支调用 require(componentPath).default；
// 此 fixture 提供一个最小 Vue2 组件定义供 require 加载。
// 仅在 require 可用时被使用（ESM 测试环境下 require 可能未定义，此时跳过自动注册）。
module.exports = {
  default: {
    name: 'TestVue2Component',
    template: '<div class="test-vue2-component">test</div>'
  }
};
