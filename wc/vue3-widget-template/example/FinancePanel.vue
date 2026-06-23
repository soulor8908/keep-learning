<template>
  <div class="bi-finance-panel">
    <h3>{{ config.title || '财务看板' }}</h3>
    <div v-if="config.showChart" class="chart">
      <aui-chart :type="config.chartType || 'line'" />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  // wrapper 已经把 config attribute 解析为 Object 传入
  config: {
    type: Object,
    default: () => ({})
  }
});
</script>

<style scoped>
.bi-finance-panel {
  padding: 16px;
}
.chart {
  margin-top: 12px;
  height: 200px;
}
</style>
