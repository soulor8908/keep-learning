/**
 * Vue2 物料入口模板
 *
 * @example
 *   import Component from './Widget.vue';
 *   import { createVue2Widget } from '@wc/templates/vue2.js';
 *   export default createVue2Widget(Component, {
 *     plugins: [ELEMENT],
 *     deps: ['element-ui']
 *   });
 */

/**
 * @param {import('vue').Component} Component
 * @param {{ plugins?: any[], deps?: string[] }} [options]
 */
export function createVue2Widget(Component, options = {}) {
  const { plugins = [], deps = [] } = options;

  for (const plugin of plugins) {
    if (plugin && typeof Vue?.use === 'function') {
      Vue.use(plugin);
    }
  }

  return {
    __widget_meta__: { deps },

    mount(container, props = {}) {
      const app = new window.Vue2({
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
