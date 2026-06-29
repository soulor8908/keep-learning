/**
 * Vue2 物料入口模板（ESM 版）
 *
 * 与 UMD 版本（wc/templates/vue2.js）的差异：
 * - 不再读 window.Vue2，改为 bare `import Vue from 'vue'`，由 importmap 的 scope 解析到 Vue2 ESM
 * - element-ui 不再从 window.ELEMENT 读取，改为按声明动态 import('element-ui')，
 *   importmap 解析到 element-ui ESM（其内部依赖的 vue 与本物料共享同一实例）
 *
 * @example
 *   import Component from './Widget.vue';
 *   import { createVue2Widget } from '@wc/core/templates/vue2';
 *   export default createVue2Widget(Component, { deps: ['element-ui'] });
 */

import Vue from 'vue';

/**
 * @param {import('vue').Component} Component
 * @param {{ deps?: string[] }} [options]
 */
export function createVue2Widget(Component, options = {}) {
  const { deps = [] } = options;

  return {
    __widget_meta__: { deps },

    async mount(container, props = {}) {
      // element-ui 按需加载：仅在声明时动态 import，importmap 解析到 element-ui ESM
      if (deps.includes('element-ui')) {
        try {
          const { default: ElementUI } = await import('element-ui');
          // Vue.use 由 Vue2 自身去重（同实例只 install 一次），多个 Vue2 物料复用同一份 element-ui
          Vue.use(ElementUI);
        } catch (e) {
          console.warn('[vue2-widget] element-ui 加载失败:', e);
        }
      }

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
