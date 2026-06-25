// vue3 wrapper 顶层 `await import(componentPath)` 加载的业务组件 fixture。
// ESM default 导出，模拟真实物料组件的形态。
export default {
  name: 'Vue3TestComponent',
  props: {
    config: Object,
    scope: Object
  },
  template: '<div class="vue3-test">vue3 fixture</div>'
};
