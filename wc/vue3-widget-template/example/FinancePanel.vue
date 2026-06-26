<template>
  <div class="bi-finance-panel">
    <h3>{{ title || '财务看板' }}</h3>
    <div v-if="showChart" class="chart">
      <el-progress :percentage="progress || 60" :status="progressStatus || 'success'" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  // 扁平化 props：宿主按 kebab-case attribute 传入，包装层按声明类型解析
  title: {
    type: String,
    default: ''
  },
  showChart: {
    type: Boolean,
    default: false
  },
  progress: {
    type: Number,
    default: 0
  },
  progressStatus: {
    type: String,
    default: ''
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
