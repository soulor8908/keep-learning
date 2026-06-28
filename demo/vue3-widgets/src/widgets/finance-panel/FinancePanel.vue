<template>
  <div class="finance-panel">
    <h3>{{ t(title) }}</h3>
    <p class="finance-panel__desc">{{ t('common.widget_name2') }}</p>

    <div class="finance-panel__props">
      <el-tag size="small" type="info">locale: {{ locale }}</el-tag>
      <el-tag size="small" type="info">currency: {{ currency }}</el-tag>
    </div>

    <el-table :data="tableData" style="width: 100%" size="small" stripe>
      <el-table-column prop="month" :label="t('common.month')" width="100" />
      <el-table-column prop="income" :label="t('common.revenue')" width="120" />
      <el-table-column prop="expense" :label="t('common.expense')" width="120" />
      <el-table-column prop="profitText" :label="t('common.profit')" />
    </el-table>

    <div class="finance-panel__summary">
      <el-tag :type="totalProfit >= 0 ? 'success' : 'danger'" size="small">
        {{ t('common.total_profit') }}：{{ totalProfit >= 0 ? '+' : '' }}{{ totalProfit }}
      </el-tag>
    </div>

    <div class="finance-panel__actions">
      <el-button type="primary" size="small" @click="handleRefresh">
        {{ t('common.refresh') }}
      </el-button>
      <el-button size="small" @click="handleExport">
        {{ t('common.export') }}
      </el-button>
    </div>

    <div class="finance-panel__log" v-if="eventLog.length">
      <el-tag size="small" type="success">{{ t('common.events') }}: {{ eventLog.length }}</el-tag>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  title: { type: String, default: 'common.finance' },
  locale: { type: String, default: 'zh-CN' },
  t: { type: Function, default: (key) => key },
  emit: { type: Function, default: () => {} },
  currency: { type: String, default: '¥' }
});

const eventLog = ref([]);

const tableData = computed(() => [
  { month: '2024-01', income: 58000, expense: 42000, profit: 16000, profitText: `${props.currency}16,000` },
  { month: '2024-02', income: 62000, expense: 45000, profit: 17000, profitText: `${props.currency}17,000` },
  { month: '2024-03', income: 55000, expense: 48000, profit: 7000, profitText: `${props.currency}7,000` }
]);

const totalProfit = computed(() => tableData.value.reduce((sum, row) => sum + row.profit, 0));

function handleRefresh() {
  eventLog.value.push({ event: 'refresh', time: Date.now() });
  props.emit('refresh', { source: 'finance-panel', timestamp: Date.now() });
}

function handleExport() {
  eventLog.value.push({ event: 'export', time: Date.now() });
  props.emit('export', { data: tableData.value, total: totalProfit.value });
}
</script>

<style scoped>
.finance-panel { padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.finance-panel h3 { margin: 0 0 4px; font-size: 18px; }
.finance-panel__desc { margin: 0 0 8px; color: #909399; font-size: 13px; }
.finance-panel__props { display: flex; gap: 8px; margin-bottom: 12px; }
.finance-panel__summary { margin-top: 12px; }
.finance-panel__actions { margin-top: 12px; }
.finance-panel__log { margin-top: 8px; }
</style>
