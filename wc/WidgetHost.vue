<template>
  <div class="widget-host" :class="name" ref="hostRef" />
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { mountWidget, unmountWidget, loadScript } from './loader.js';

const props = defineProps({
  name: { type: String, required: true },
  js: { type: String, required: true },
  vueVersion: { type: String, default: '3' },
  widgetProps: { type: Object, default: () => ({}) },
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

function buildProps() {
  return {
    ...props.widgetProps,
    emit(eventName, payload) {
      emit('widget-event', { widget: props.name, event: eventName, payload });
    }
  };
}

// 从全局变量中查找物料（支持命名空间和直接挂载两种模式）
function findWidget(name) {
  // 直接挂载：window[name]
  if (window[name]?.mount) return window[name];
  // 命名空间：遍历 window 上的对象查找
  for (const key of Object.keys(window)) {
    const val = window[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && val[name]?.mount) {
      return val[name];
    }
  }
  return null;
}

async function doMount() {
  const mountPoint = ensureMountPoint();
  if (!mountPoint) return;

  if (props.onBeforeMount) props.onBeforeMount({ name: props.name, container: mountPoint });

  let widgetApi = null;

  // 通过 loadScript 加载 UMD 文件
  try {
    await loadScript(props.js);
  } catch {}

  const mod = findWidget(props.name);
  if (mod && typeof mod.mount === 'function') {
    const innerApi = await mod.mount(mountPoint, props.widgetProps || {});
    widgetApi = { unmount: () => { if (innerApi?.unmount) innerApi.unmount(); } };
  } else {
    widgetApi = await mountWidget(mountPoint, {
      name: props.name,
      js: props.js,
      vueVersion: props.vueVersion,
      props: buildProps()
    });
  }

  api = widgetApi;
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
