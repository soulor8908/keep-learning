/**
 * @deprecated 本模块是早期实验性方案，请使用主 widget-loader + vue3-widget-template。
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
