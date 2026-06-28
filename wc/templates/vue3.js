/**
 * Vue3 物料入口模板
 *
 * @example
 *   import Component from './Widget.vue';
 *   import { createVue3Widget } from '@wc/templates/vue3.js';
 *   export default createVue3Widget(Component, {
 *     plugins: [ElementPlus],
 *     deps: ['element-plus']
 *   });
 */

const { createApp, h } = window.Vue3;

/**
 * @param {import('vue').Component} Component
 * @param {{ plugins?: any[], deps?: string[] }} [options]
 */
export function createVue3Widget(Component, options = {}) {
  const { plugins = [], deps = [] } = options;

  return {
    // 构建时嵌入的元数据，运行时校验用
    __widget_meta__: { deps },

    mount(container, props = {}) {
      const app = createApp({ render: () => h(Component, props) });
      for (const plugin of plugins) {
        app.use(plugin);
      }
      app.mount(container);
      return {
        unmount: () => {
          app.unmount();
          if (container) container.innerHTML = '';
        }
      };
    }
  };
}
