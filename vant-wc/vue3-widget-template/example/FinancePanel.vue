<template>
  <div class="bi-finance-panel">
    <h3>{{ parsedConfig.title || '财务看板' }}</h3>
    <div v-if="parsedConfig.showChart" class="chart">
      <aui-chart :type="parsedConfig.chartType || 'line'" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  // wrapper 会把 config attribute 作为字符串传入
  config: {
    type: String,
    default: '{}'
  }
});

const parsedConfig = computed(() => {
  try {
    return JSON.parse(props.config || '{}');
  } catch (e) {
    return {};
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
