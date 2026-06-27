<template>
  <el-card class="bi-orders-panel">
    <div slot="header">
      <span>{{ title || t('orders.title') }}</span>
      <span class="team-tag">{{ t('orders.team_tag') }}</span>
    </div>
    <el-table :data="orders" size="small" @row-click="onRowClick">
      <el-table-column prop="id" :label="t('orders.col_id')" width="120" />
      <el-table-column prop="name" :label="t('orders.col_name')" />
      <el-table-column prop="amount" :label="t('orders.col_amount')" width="100">
        <template slot-scope="{ row }">¥{{ row.amount }}</template>
      </el-table-column>
      <el-table-column prop="status" :label="t('orders.col_status')" width="90" />
    </el-table>
  </el-card>
</template>

<script>
import { t, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key。
// 语言切换的响应式由 wrapper 基础设施层统一处理（对物料实例 $forceUpdate），
// 组件只需在模板/方法里直接调用 t()，无需自建 localeTick / onLocaleChange。
addMessages('zh', {
  orders: {
    title: '订单区域',
    team_tag: 'A 业务团队 · Vue2',
    col_id: '订单号',
    col_name: '商品',
    col_amount: '金额',
    col_status: '状态'
  }
});
addMessages('en', {
  orders: {
    title: 'Orders',
    team_tag: 'Team A · Vue2',
    col_id: 'Order ID',
    col_name: 'Product',
    col_amount: 'Amount',
    col_status: 'Status'
  }
});

export default {
  name: 'OrdersPanel',
  props: {
    title: {
      type: String,
      default: ''
    },
    orders: {
      type: Array,
      default: () => []
    },
    scope: {
      type: Object,
      default: null
    }
  },
  computed: {
    // 暴露 t 给模板使用；wrapper 在 locale 变化时 $forceUpdate 物料实例，
    // 模板重新求值 t('xxx') 即可拿到新语言文案
    t() {
      return t;
    }
  },
  methods: {
    onRowClick(row) {
      // 通过 widget-bus 发出业务事件，基座与其他物料可监听
      if (this.scope && this.scope.bus) {
        this.scope.bus.emit('order:click', { id: row.id, amount: row.amount, name: row.name });
      }
    }
  },
  mounted() {
    if (this.scope && this.scope.bus) {
      this.scope.bus.emit('widget:loaded', { widget: 'bi-orders-panel' });
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
