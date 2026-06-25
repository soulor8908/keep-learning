// vue3 wrapper props 模式 fixture：声明独立 props，不声明 config，
// 用于验证包装层把宿主传入的属性按声明类型解析并作为独立 prop 传入。
// 与 test-component.js（声明 config + scope）形成对照。
export default {
  name: 'Vue3PropsComponent',
  props: {
    title: String,
    maxCount: Number,
    isVisible: Boolean,
    panelData: Object,
    scope: Object
    // 注意：未声明 config，验证包装层不强制要求 config prop
  },
  template: '<div class="vue3-props-fixture">props mode</div>'
};
