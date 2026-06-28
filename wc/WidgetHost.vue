<template>
  <div class="widget-host" ref="hostRef" />
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { mountWidget, unmountWidget } from './loader.js';

const props = defineProps({
  name: { type: String, required: true },
  js: { type: String, default: '' },
  css: { type: String, default: '' },
  vueVersion: { type: String, default: '3' },
  widgetProps: { type: Object, default: () => ({}) },
  runtimeDeps: { type: Array, default: () => [] },
  retryable: { type: Boolean, default: true },
  // 内置 i18n
  locale: { type: String, default: 'zh-CN' },
  messages: { type: Object, default: () => ({}) },
  // 生命周期钩子
  onBeforeMount: { type: Function, default: null },
  onMounted: { type: Function, default: null },
  onUnmounted: { type: Function, default: null }
});

const emit = defineEmits(['widget-event']);
const hostRef = ref();
let api = null;

function ensureMountPoint() {
  const host = hostRef.value;
  if (!host) return null;
  if (!host.firstChild) {
    const mp = document.createElement('div');
    host.appendChild(mp);
    return mp;
  }
  return host.firstChild;
}

function t(key) {
  const dict = props.messages[props.locale];
  return (dict && dict[key]) || key;
}

function buildProps() {
  return {
    ...props.widgetProps,
    locale: props.locale,
    t,
    emit(eventName, payload) {
      emit('widget-event', { widget: props.name, event: eventName, payload });
    }
  };
}

async function doMount() {
  const mountPoint = ensureMountPoint();
  if (!mountPoint) return;

  if (props.onBeforeMount) {
    props.onBeforeMount({ name: props.name, container: mountPoint });
  }

  api = await mountWidget(mountPoint, {
    name: props.name,
    js: props.js,
    css: props.css,
    vueVersion: props.vueVersion,
    runtimeDeps: props.runtimeDeps,
    props: buildProps(),
    retryable: props.retryable
  });

  if (props.onMounted) {
    props.onMounted({ name: props.name, container: mountPoint, api });
  }
}

function doUnmount() {
  if (props.onUnmounted) {
    props.onUnmounted({ name: props.name, api });
  }
  unmountWidget(api);
  api = null;
}

onMounted(() => { doMount(); });

onUnmounted(() => { doUnmount(); });

watch(
  () => [props.widgetProps, props.locale, props.messages],
  async () => {
    doUnmount();
    const host = hostRef.value;
    if (!host) return;
    host.innerHTML = '';
    await nextTick();
    doMount();
  },
  { deep: true }
);
</script>
