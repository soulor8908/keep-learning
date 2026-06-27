<script setup>
const props = defineProps({
  title: { type: String, default: 'Widget' },
  bus: { type: Object, default: null }
});

function emitEvent() {
  props.bus?.emit('widget:hello', { from: 'vue3-esm-widget', time: Date.now() });
}
</script>

<template>
  <div class="vue-widget">
    <h3>{{ title }}</h3>
    <button @click="emitEvent">发送事件</button>
  </div>
</template>

<style scoped>
.vue-widget {
  padding: 16px;
  background: #ecf5ff;
  border-radius: 8px;
}
.vue-widget h3 {
  margin: 0 0 12px;
  color: #409eff;
}
.vue-widget button {
  padding: 6px 12px;
  border: none;
  background: #409eff;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
}
</style>
