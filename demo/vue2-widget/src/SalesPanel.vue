<template>
  <div class="sales-panel">
    <h3>{{ t(title) }}</h3>
    <p class="sales-panel__desc">{{ t('Vue2 物料') }}</p>

    <el-table :data="tableData" style="width: 100%" size="small" stripe>
      <el-table-column prop="date" :label="t('日期')" width="120" />
      <el-table-column prop="name" :label="t('商品')" width="120" />
      <el-table-column prop="sales" :label="t('销量')" width="80" />
      <el-table-column prop="revenue" :label="t('收入')" />
    </el-table>

    <div class="sales-panel__actions">
      <el-button type="primary" size="small" @click="handleRefresh">
        {{ t('刷新数据') }}
      </el-button>
      <el-button size="small" @click="handleAdd">
        {{ t('添加记录') }}
      </el-button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SalesPanel',
  props: {
    title: { type: String, default: '销售面板' },
    locale: { type: String, default: 'zh-CN' },
    t: { type: Function, default: (key) => key },
    emit: { type: Function, default: () => {} }
  },
  data() {
    return {
      tableData: [
        { date: '2024-01', name: 'Widget A', sales: 120, revenue: '¥24,000' },
        { date: '2024-01', name: 'Widget B', sales: 88, revenue: '¥17,600' },
        { date: '2024-02', name: 'Widget A', sales: 156, revenue: '¥31,200' }
      ]
    };
  },
  methods: {
    handleRefresh() {
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
      this.emit('add-record', { record: newRecord });
    }
  }
};
</script>

<style scoped>
.sales-panel {
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.sales-panel h3 {
  margin: 0 0 4px;
  font-size: 18px;
}

.sales-panel__desc {
  margin: 0 0 12px;
  color: #909399;
  font-size: 13px;
}

.sales-panel__actions {
  margin-top: 12px;
}
</style>
