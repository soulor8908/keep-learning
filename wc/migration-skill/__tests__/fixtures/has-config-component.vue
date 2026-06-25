<template>
  <div class="config-panel">
    <span>{{ config.title }}</span>
  </div>
</template>

<script>
export default {
  name: 'ConfigPanel',
  props: {
    config: { type: Object, default: () => ({}) }
  }
};
</script>
