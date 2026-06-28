<template>
  <div class="finance-panel">
    <h3>{{ t(title) }}</h3>
    <p class="finance-panel__desc">{{ t('Vue3 物料') }}</p>

    <el-table :data="tableData" style="width: 100%" size="small" stripe>
      <el-table-column prop="month" :label="t('月份')" width="100" />
      <el-table-column prop="income" :label="t('收入')" width="120" />
      <el-table-column prop="expense" :label="t('支出')" width="120" />
      <el-table-column prop="profitText" :label="t('利润')" />
    </el-table>

    <div class="finance-panel__summary">
      <el-tag :type="totalProfit >= 0 ? 'success' : 'danger'" size="small">
        {{ t('总利润') }}：{{ totalProfit >= 0 ? '+' : '' }}{{ totalProfit }}
      </el-tag>
    </div>

    <div class="finance-panel__actions">
      <el-button type="primary" size="small" @click="handleRefresh">
        {{ t('刷新数据') }}
      </el-button>
      <el-button size="small" @click="handleExport">
        {{ t('导出报表') }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: { type: String, default: '财务面板' },
  locale: { type: String, default: 'zh-CN' },
  t: { type: Function, default: (key) => key },
  emit: { type: Function, default: () => {} }
});

const tableData = computed(() => [
  { month: '2024-01', income: 58000, expense: 42000, profit: 16000, profitText: '+16000' },
  { month: '2024-02', income: 62000, expense: 45000, profit: 17000, profitText: '+17000' },
  { month: '2024-03', income: 55000, expense: 48000, profit: 7000, profitText: '+7000' }
]);

const totalProfit = computed(() =>
  tableData.value.reduce((sum, row) => sum + row.profit, 0)
);

function handleRefresh() {
  props.emit('refresh', { source: 'finance-panel', timestamp: Date.now() });
}

function handleExport() {
  props.emit('export', {
    data: tableData.value,
    total: totalProfit.value
  });
}
</script>

<style scoped>
.finance-panel {
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.finance-panel h3 {
  margin: 0 0 4px;
  font-size: 18px;
}

.finance-panel__desc {
  margin: 0 0 12px;
  color: #909399;
  font-size: 13px;
}

.finance-panel__summary {
  margin-top: 12px;
}

.finance-panel__actions {
  margin-top: 12px;
}
</style>
