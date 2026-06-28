<template>
  <div class="sales-panel">
    <h3>{{ t(title) }}</h3>
    <p class="sales-panel__desc">{{ t('common.widget_name') }}</p>

    <!-- Props 验证：展示接收到的所有 props -->
    <div class="sales-panel__props">
      <el-tag size="small" type="info">locale: {{ locale }}</el-tag>
      <el-tag size="small" type="info">columns: {{ columns.length }}</el-tag>
    </div>

    <el-table :data="tableData" style="width: 100%" size="small" stripe>
      <el-table-column
        v-for="col in columns"
        :key="col.prop"
        :prop="col.prop"
        :label="t(col.label)"
        :width="col.width"
      />
    </el-table>

    <div class="sales-panel__actions">
      <el-button type="primary" size="small" @click="handleRefresh">
        {{ t('common.refresh') }}
      </el-button>
      <el-button size="small" @click="handleAdd">
        {{ t('common.add') }}
      </el-button>
    </div>

    <!-- 事件日志：展示组件发出的事件 -->
    <div class="sales-panel__log" v-if="eventLog.length">
      <el-tag size="small" type="success">{{ t('common.events') }}: {{ eventLog.length }}</el-tag>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SalesPanel',
  props: {
    title: { type: String, default: 'common.sales' },
    locale: { type: String, default: 'zh-CN' },
    t: { type: Function, default: (key) => key },
    emit: { type: Function, default: () => {} },
    columns: {
      type: Array,
      default: () => [
        { prop: 'date', label: 'common.date', width: 120 },
        { prop: 'name', label: 'common.product', width: 120 },
        { prop: 'sales', label: 'common.sales_vol', width: 80 },
        { prop: 'revenue', label: 'common.revenue' }
      ]
    }
  },
  data() {
    return {
      tableData: [
        { date: '2024-01', name: 'Widget A', sales: 120, revenue: '¥24,000' },
        { date: '2024-01', name: 'Widget B', sales: 88, revenue: '¥17,600' },
        { date: '2024-02', name: 'Widget A', sales: 156, revenue: '¥31,200' }
      ],
      eventLog: []
    };
  },
  methods: {
    handleRefresh() {
      this.eventLog.push({ event: 'refresh', time: Date.now() });
      this.emit('refresh', { source: 'sales-panel', timestamp: Date.now() });
    },
    handleAdd() {
      const newRecord = {
        date: '2024-03',
        name: `Widget ${String.fromCharCode(65 + this.tableData.length)}`,
        sales: Math.floor(Math.random() * 200),
        revenue: `¥${(Math.floor(Math.random() * 200) * 200).toLocaleString()}`
      };
      this.tableData.push(newRecord);
      this.eventLog.push({ event: 'add-record', time: Date.now() });
      this.emit('add-record', { record: newRecord });
    }
  }
};
</script>

<style scoped>
.sales-panel { padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.sales-panel h3 { margin: 0 0 4px; font-size: 18px; }
.sales-panel__desc { margin: 0 0 8px; color: #909399; font-size: 13px; }
.sales-panel__props { display: flex; gap: 8px; margin-bottom: 12px; }
.sales-panel__actions { margin-top: 12px; }
.sales-panel__log { margin-top: 8px; }
</style>
