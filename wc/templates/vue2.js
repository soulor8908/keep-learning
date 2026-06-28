/**
 * Vue2 物料入口模板
 *
 * @example
 *   import Component from './Widget.vue';
 *   import { createVue2Widget } from '@wc/templates/vue2.js';
 *   export default createVue2Widget(Component, {
 *     plugins: [ELEMENT]
 *   });
 */

/**
 * @param {import('vue').Component} Component
 * @param {{ plugins?: any[] }} [options]
 * @returns {{ mount: Function, unmount: Function }}
 */
export function createVue2Widget(Component, options = {}) {
  const { plugins = [] } = options;

  // Vue.use() 是全局的，只注册一次
  for (const plugin of plugins) {
    if (plugin && typeof window.Vue2.use === 'function') {
      window.Vue2.use(plugin);
    }
  }

  return {
    mount(container, props = {}) {
      const app = new window.Vue2({
        render: (h) => h(Component, { props })
      });
      app.$mount(container);
      return {
        unmount: () => {
          app.$destroy();
          if (container) {
            container.innerHTML = '';
          }
        }
      };
    }
  };
}
