/**
 * Vue3 物料入口模板
 * 物料 src/index.js 中按此模板导出 { mount, unmount }
 *
 * @example
 *   import Component from './Widget.vue';
 *   import { createVue3Widget } from '@wc/templates/vue3.js';
 *   export default createVue3Widget(Component, {
 *     plugins: [ElementPlus]
 *   });
 */

const { createApp, h } = window.Vue3;

/**
 * @param {import('vue').Component} Component
 * @param {{ plugins?: any[] }} [options]
 * @returns {{ mount: Function, unmount: Function }}
 */
export function createVue3Widget(Component, options = {}) {
  const { plugins = [] } = options;

  return {
    mount(container, props = {}) {
      const app = createApp({
        render: () => h(Component, props)
      });

      for (const plugin of plugins) {
        app.use(plugin);
      }

      app.mount(container);
      return {
        unmount: () => {
          app.unmount();
          if (container) {
            container.innerHTML = '';
          }
        }
      };
    }
  };
}
