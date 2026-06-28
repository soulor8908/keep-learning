<template>
  <div class="order-panel">
    <h3>{{ t(title) }}</h3>
    <p class="order-panel__desc">{{ t('common.widget_name') }}</p>

    <div class="order-panel__props">
      <el-tag size="small" type="info">locale: {{ locale }}</el-tag>
      <el-tag size="small" type="info">pageSize: {{ pageSize }}</el-tag>
    </div>

    <el-table :data="pagedData" style="width: 100%" size="small" stripe>
      <el-table-column prop="id" :label="t('common.order_id')" width="120" />
      <el-table-column prop="customer" :label="t('common.customer')" width="120" />
      <el-table-column prop="amount" :label="t('common.amount')" width="100" />
      <el-table-column prop="status" :label="t('common.status')" />
    </el-table>

    <div class="order-panel__actions">
      <el-button type="primary" size="small" @click="handleRefresh">
        {{ t('common.refresh') }}
      </el-button>
      <el-button size="small" @click="handleAdd">
        {{ t('common.new_order') }}
      </el-button>
    </div>

    <div class="order-panel__log" v-if="eventLog.length">
      <el-tag size="small" type="success">{{ t('common.events') }}: {{ eventLog.length }}</el-tag>
    </div>
  </div>
</template>

<script>
export default {
  name: 'OrderPanel',
  props: {
    title: { type: String, default: 'common.order' },
    locale: { type: String, default: 'zh-CN' },
    t: { type: Function, default: (key) => key },
    emit: { type: Function, default: () => {} },
    pageSize: { type: Number, default: 5 }
  },
  data() {
    return {
      tableData: [
        { id: 'ORD-001', customer: 'Alice', amount: '¥1,200', status: 'Completed' },
        { id: 'ORD-002', customer: 'Bob', amount: '¥800', status: 'Processing' },
        { id: 'ORD-003', customer: 'Charlie', amount: '¥2,500', status: 'Pending' }
      ],
      eventLog: []
    };
  },
  computed: {
    pagedData() {
      return this.tableData.slice(0, this.pageSize);
    }
  },
  methods: {
    handleRefresh() {
      this.eventLog.push({ event: 'refresh', time: Date.now() });
      this.emit('refresh', { source: 'order-panel', timestamp: Date.now() });
    },
    handleAdd() {
      const newOrder = {
        id: `ORD-${String(this.tableData.length + 1).padStart(3, '0')}`,
        customer: `Customer ${this.tableData.length + 1}`,
        amount: `¥${(Math.floor(Math.random() * 30) + 1) * 100}`,
        status: 'Pending'
      };
      this.tableData.push(newOrder);
      this.eventLog.push({ event: 'add-order', time: Date.now() });
      this.emit('add-order', { order: newOrder });
    }
  }
};
</script>

<style scoped>
.order-panel { padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.order-panel h3 { margin: 0 0 4px; font-size: 18px; }
.order-panel__desc { margin: 0 0 8px; color: #909399; font-size: 13px; }
.order-panel__props { display: flex; gap: 8px; margin-bottom: 12px; }
.order-panel__actions { margin-top: 12px; }
.order-panel__log { margin-top: 8px; }
</style>
