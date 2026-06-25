<template>
  <el-card class="bi-orders-panel">
    <div slot="header">
      <span>{{ config.title || '订单区域' }}</span>
      <span class="team-tag">A 业务团队 · Vue2</span>
    </div>
    <el-table :data="orders" size="small" @row-click="onRowClick">
      <el-table-column prop="id" label="订单号" width="120" />
      <el-table-column prop="name" label="商品" />
      <el-table-column prop="amount" label="金额" width="100">
        <template slot-scope="{ row }">¥{{ row.amount }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90" />
    </el-table>
  </el-card>
</template>

<script>
export default {
  name: 'OrdersPanel',
  props: {
    config: {
      type: Object,
      default: () => ({})
    }
  },
  computed: {
    orders() {
      return (this.config && this.config.orders) || [];
    }
  },
  methods: {
    onRowClick(row) {
      // 通过 widget-bus 发出业务事件，基座与其他物料可监听
      if (window.widgetBus) {
        window.widgetBus.emit('order:click', { id: row.id, amount: row.amount, name: row.name });
      }
    }
  },
  mounted() {
    if (window.widgetBus) {
      window.widgetBus.emit('widget:loaded', { widget: 'bi-orders-panel' });
    }
  }
};
</script>

<style scoped>
.bi-orders-panel .team-tag {
  float: right;
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}
</style>
