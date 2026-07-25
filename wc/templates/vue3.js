/**
 * Vue3 物料入口模板（ESM 版）
 *
 * 只负责 Vue3 实例创建/挂载与 props 热更新；UI 组件注册在物料 SFC 内完成
 * （manual 手写 import / auto 由 unplugin-vue-components 构建期注入）。
 *
 * @example
 *   import Component from './Widget.vue';
 *   import { createVue3Widget } from '@wc/core/templates/vue3';
 *   export default createVue3Widget(Component);
 */

import { createApp, h, shallowRef } from 'vue';

/**
 * @param {import('vue').Component} Component
 * @param {{ plugins?: any[], deps?: string[] }} [options]  deps 仅作元信息，不再触发全量加载
 */
export function createVue3Widget(Component, options = {}) {
  const { plugins = [], deps = [] } = options;

  return {
    __widget_meta__: { deps },

    mount(container, props = {}) {
      // shallowRef 桥接：update 整体替换 props 对象触发重渲染，物料不重挂载、内部状态不丢
      const propsRef = shallowRef(props);
      const app = createApp({ render: () => h(Component, propsRef.value) });

      // 业务方通过 plugins 传入的插件（非 UI 库的全量注册），如自研插件
      for (const plugin of plugins) {
        app.use(plugin);
      }

      app.mount(container);
      return {
        unmount: () => {
          app.unmount();
          if (container) container.innerHTML = '';
        },
        update: (next) => { propsRef.value = next; }
      };
    }
  };
}
