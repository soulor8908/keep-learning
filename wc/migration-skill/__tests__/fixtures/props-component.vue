<template>
  <div class="sales-panel">
    <h2>{{ title }}</h2>
    <p>共 {{ items.length }} 条</p>
  </div>
</template>

<script>
export default {
  name: 'SalesPanel',
  props: {
    title: { type: String, default: '销售面板' },
    items: { type: Array, default: () => [] },
    isVisible: { type: Boolean, default: true }
  },
  data() {
    return { total: 0 };
  }
};
</script>

<style scoped>
.sales-panel { padding: 16px; }
</style>
