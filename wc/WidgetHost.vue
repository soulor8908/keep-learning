<template>
  <div class="widget-host" :class="name" ref="hostRef" />
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { mountWidget, unmountContainer } from './loader.js';

const props = defineProps({
  name: { type: String, required: true },
  url: { type: String, required: true },
  css: { type: String, default: '' },
  widgetProps: { type: Object, default: () => ({}) },
  context: { type: Object, default: () => ({}) },
  cssIntegrity: { type: String, default: '' },
  // 加载超时毫秒数，默认 0 = 跟随 loader 默认值
  timeout: { type: Number, default: 0 },
  onBeforeMount: { type: Function, default: null },
  onMounted: { type: Function, default: null },
  onUnmounted: { type: Function, default: null }
});

const emit = defineEmits(['widget-event', 'widget-error']);
// 把 emit 存到局部常量，避免 buildProps 内部方法名同名遮蔽导致调用自身。
const emitToParent = emit;
const hostRef = ref();
let api = null;
let mountSeq = 0;

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
      // 双通道：window 广播（供其他物料 on()）+ 基座 widget-event（供 @widget-event）。物料只调 emit。
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
  const seq = ++mountSeq;

  props.onBeforeMount?.({ name: props.name, container: mountPoint });

  const result = await mountWidget(mountPoint, {
    name: props.name,
    url: props.url,
    css: props.css,
    context: props.context,
    cssIntegrity: props.cssIntegrity,
    timeout: props.timeout || undefined,
    props: buildProps(),
    onError: (error) => emitToParent('widget-error', { widget: props.name, error })
  });

  // await 期间若已卸载/重挂载，seq 过期 → 丢弃迟到的 api（对应会话已被 loader 取消）
  if (seq !== mountSeq) return;
  api = result;
  api.update(buildProps()); // 对齐挂载期间可能变化的 widgetProps（watcher 触发时 api 未就绪被跳过）
  props.onMounted?.({ name: props.name, container: mountPoint, api });
}

function doUnmount() {
  mountSeq++; // 使进行中的 doMount 失效
  props.onUnmounted?.({ name: props.name, api });
  if (api) api.unmount();
  else if (hostRef.value?.firstChild) unmountContainer(hostRef.value.firstChild); // 挂载进行中：取消
  api = null;
}

async function remount() {
  doUnmount();
  const host = hostRef.value;
  if (!host) return;
  host.innerHTML = '';
  await nextTick();
  doMount();
}

onMounted(doMount);
onUnmounted(doUnmount);

// 物料本身变化（url/name/css）→ 重挂载
watch(() => [props.url, props.name, props.css], remount);

// widgetProps 变化：物料支持 update 则热更新（不重挂载、状态保留），否则退化为重挂载
watch(
  () => props.widgetProps,
  () => {
    if (api && api.update(buildProps()) === false) remount();
  },
  { deep: true }
);
</script>
