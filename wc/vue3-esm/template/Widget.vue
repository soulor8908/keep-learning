<script setup>
const props = defineProps({
  title: { type: String, default: 'Hello Vue3 ESM' }
});
</script>

<template>
  <div class="vue3-widget">
    <h3>{{ title }}</h3>
  </div>
</template>

<style scoped>
.vue3-widget {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.vue3-widget h3 {
  margin: 0;
  font-size: 16px;
  color: #111827;
}
</style>
