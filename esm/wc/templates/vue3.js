/**
 * Vue3 物料入口模板（ESM 版）
 *
 * 与 UMD 版本（wc/templates/vue3.js）的差异：
 * - 不再读 window.Vue3，改为 bare `import { createApp, h } from 'vue'`，由 importmap 的 scope 解析到 Vue3 ESM
 * - element-plus 不再从 window.ElementPlus 读取，改为按声明动态 import('element-plus')
 *
 * @example
 *   import Component from './Widget.vue';
 *   import { createVue3Widget } from '@wc/core/templates/vue3';
 *   export default createVue3Widget(Component, { deps: ['element-plus'] });
 */

import { createApp, h } from 'vue';

/**
 * @param {import('vue').Component} Component
 * @param {{ plugins?: any[], deps?: string[] }} [options]
 */
export function createVue3Widget(Component, options = {}) {
  const { plugins = [], deps = [] } = options;

  return {
    __widget_meta__: { deps },

    async mount(container, props = {}) {
      const app = createApp({ render: () => h(Component, props) });

      for (const plugin of plugins) {
        app.use(plugin);
      }

      // element-plus 按需加载：仅在声明时动态 import
      if (deps.includes('element-plus')) {
        try {
          const { default: ElementPlus } = await import('element-plus');
          app.use(ElementPlus);
        } catch (e) {
          console.warn('[vue3-widget] element-plus 加载失败:', e);
        }
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
