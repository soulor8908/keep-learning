/**
 * Vue3 物料入口模板（ESM 版 + UI 分组按需）
 *
 * 与旧版（全量 app.use(ElementPlus)）的差异：
 * - 不再全量加载 element-plus。UI 组件的注册交给物料 SFC 自己：
 *   - manual 模式：物料 <script setup> 里 import { ElButton } from 'element-plus/common'
 *   - auto 模式：unplugin-vue-components 在构建期自动注入上述 import
 * - 模板只负责 Vue 实例创建/挂载，不再管 UI 库。deps 字段保留仅为元信息标注。
 *
 * @example
 *   import Component from './Widget.vue';
 *   import { createVue3Widget } from '@wc/core/templates/vue3';
 *   export default createVue3Widget(Component);
 */

import { createApp, h } from 'vue';

/**
 * @param {import('vue').Component} Component
 * @param {{ plugins?: any[], deps?: string[] }} [options]  deps 仅作元信息，不再触发全量加载
 */
export function createVue3Widget(Component, options = {}) {
  const { plugins = [], deps = [] } = options;

  return {
    __widget_meta__: { deps },

    mount(container, props = {}) {
      const app = createApp({ render: () => h(Component, props) });

      // 业务方通过 plugins 传入的插件（非 UI 库的全量注册），如自研插件
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
