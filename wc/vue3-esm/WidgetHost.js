/**
 * 轻量基座组件 - 配合 loader.js 使用
 */
import { h, ref, onMounted, onUnmounted, watch } from 'vue';
import { mountWidget } from './loader.js';

export default {
  props: {
    url: { type: String, required: true },
    widgetProps: { type: Object, default: () => ({}) },
    importer: { type: Function, default: null }
  },
  setup(props) {
    const el = ref();
    let unmount = () => {};

    onMounted(async () => {
      unmount = await mountWidget(el.value, props.url, props.widgetProps, props.importer);
    });

    onUnmounted(() => unmount());

    watch(
      () => props.widgetProps,
      async (next) => {
        unmount();
        unmount = await mountWidget(el.value, props.url, next, props.importer);
      },
      { deep: true }
    );

    return () => h('div', { ref: el, class: 'widget-host' });
  }
};
