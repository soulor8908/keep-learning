/**
 * Vue2 物料入口模板（ESM 版）
 *
 * 只负责 Vue2 实例创建/挂载与 props 热更新；UI 组件注册在物料 SFC 内完成
 * （manual 模式手写 import；auto 对 Vue2 不生效，见 build.mjs）。
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
      // data 桥接：update 整体替换 data.p 触发重渲染，物料不重挂载、内部状态不丢
      const app = new Vue({
        data: { p: props },
        render(h) { return h(Component, { props: this.p }); }
      });
      app.$mount(container);
      return {
        unmount: () => {
          app.$destroy();
          // Vue2 $mount 会替换 container 本身，渲染根节点是 app.$el，需显式移除
          app.$el?.parentNode?.removeChild(app.$el);
        },
        update: (next) => { app.p = next; }
      };
    }
  };
}
