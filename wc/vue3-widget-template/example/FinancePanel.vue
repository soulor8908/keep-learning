<template>
  <div class="bi-finance-panel">
    <h3>{{ config.title || '财务看板' }}</h3>
    <div v-if="config.showChart" class="chart">
      <el-progress :percentage="config.progress || 60" :status="config.progressStatus || 'success'" />
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
