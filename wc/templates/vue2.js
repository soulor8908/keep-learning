/**
 * Vue2 物料入口模板（ESM 版 + UI 分组按需）
 *
 * 与旧版（全量 Vue.use(ElementUI)）的差异：
 * - 不再全量加载 element-ui。UI 组件注册交给物料 SFC：
 *   - manual 模式：物料 <script> 里 import { Button } from 'element-ui/common' 并 components 注册
 *   - auto 模式：unplugin-vue-components 在构建期自动注入 import + 注册
 * - 模板只负责 Vue2 实例创建/挂载。
 *
 * @example
 *   import Component from './Widget.vue';
 *   import { createVue2Widget } from '@wc/core/templates/vue2';
 *   export default createVue2Widget(Component);
 */

import Vue from 'vue';

/**
 * @param {import('vue').Component} Component
 * @param {{ deps?: string[] }} [options]  deps 仅作元信息，不再触发全量加载
 */
export function createVue2Widget(Component, options = {}) {
  const { deps = [] } = options;

  return {
    __widget_meta__: { deps },

    mount(container, props = {}) {
      const app = new Vue({
        render: (h) => h(Component, { props })
      });
      app.$mount(container);
      return {
        unmount: () => {
          app.$destroy();
          if (container) container.innerHTML = '';
        }
      };
    }
  };
}
