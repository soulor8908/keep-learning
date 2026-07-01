<template>
  <div class="widget-host" :class="name" ref="hostRef" />
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { mountWidget, unmountWidget } from './loader.js';

// 与 UMD 版 WidgetHost.vue 的差异：
// - props 用 url/css 替代 js（ESM 模块 URL），去掉 vueVersion / runtimeDeps / integrity
//   （依赖隔离交给 importmap，不再需要运行时声明）
// - 不再有 loadScript + findWidget 的双路径，挂载只走 mountWidget 一条路
const props = defineProps({
  name: { type: String, required: true },
  url: { type: String, required: true },
  css: { type: String, default: '' },
  widgetProps: { type: Object, default: () => ({}) },
  context: { type: Object, default: () => ({}) },
  cssIntegrity: { type: String, default: '' },
  onBeforeMount: { type: Function, default: null },
  onMounted: { type: Function, default: null },
  onUnmounted: { type: Function, default: null }
});

const emit = defineEmits(['widget-event']);
// 把 emit 存到局部常量，避免 buildProps 内部方法名同名遮蔽导致调用自身。
const emitToParent = emit;
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

function buildProps() {
  return {
    ...props.widgetProps,
    context: props.context,
    emit(type, payload) {
      // 双通道：既向全局 window 广播（供其他物料 on() 监听），又向基座 Vue 组件抛 widget-event
      // （供基座 @widget-event 监听）。物料只调 emit 即可，无需知道 emitToHost。
      window.dispatchEvent(new CustomEvent(`widget:${type}`, { detail: payload }));
      emitToParent('widget-event', { widget: props.name, event: type, payload });
    },
    on(type, handler) {
      const fn = (e) => handler(e.detail);
      window.addEventListener(`widget:${type}`, fn);
      return () => window.removeEventListener(`widget:${type}`, fn);
    },
    emitToHost(eventName, payload) {
      emitToParent('widget-event', { widget: props.name, event: eventName, payload });
    }
  };
}

async function doMount() {
  const mountPoint = ensureMountPoint();
  if (!mountPoint) return;

  if (props.onBeforeMount) props.onBeforeMount({ name: props.name, container: mountPoint });

  api = await mountWidget(mountPoint, {
    name: props.name,
    url: props.url,
    css: props.css,
    context: props.context,
    cssIntegrity: props.cssIntegrity,
    props: buildProps()
  });

  if (props.onMounted) props.onMounted({ name: props.name, container: mountPoint, api });
}

function doUnmount() {
  if (props.onUnmounted) props.onUnmounted({ name: props.name, api });
  unmountWidget(api);
  api = null;
}

onMounted(() => { doMount(); });
onUnmounted(() => { doUnmount(); });

watch(
  () => props.widgetProps,
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
