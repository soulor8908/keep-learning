<template>
  <el-card class="bi-orders-panel">
    <div slot="header">
      <span>{{ title || t('orders.title') }}</span>
      <span class="team_tag">{{ t('orders.team_tag') }}</span>
    </div>
    <el-table :data="orders" size="small" @row-click="onRowClick">
      <el-table-column prop="id" :label="t('orders.col_id')" width="120" />
      <el-table-column :label="t('orders.col_name')">
        <template slot-scope="{ row }">{{ t('orders.product_' + row.id) }}</template>
      </el-table-column>
      <el-table-column prop="amount" :label="t('orders.col_amount')" width="100">
        <template slot-scope="{ row }">¥{{ row.amount }}</template>
      </el-table-column>
      <el-table-column :label="t('orders.col_status')" width="90">
        <template slot-scope="{ row }">{{ t('orders.status_' + row.id) }}</template>
      </el-table-column>
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
    col_status: '状态',
    product_ORD_1001: '无线蓝牙耳机',
    product_ORD_1002: '机械键盘',
    product_ORD_1003: '4K 显示器',
    product_ORD_1004: '人体工学椅',
    status_ORD_1001: '已支付',
    status_ORD_1002: '待发货',
    status_ORD_1003: '已发货',
    status_ORD_1004: '已完成'
  }
});
addMessages('en', {
  orders: {
    title: 'Orders',
    team_tag: 'Team A · Vue2',
    col_id: 'Order ID',
    col_name: 'Product',
    col_amount: 'Amount',
    col_status: 'Status',
    product_ORD_1001: 'Bluetooth Earphones',
    product_ORD_1002: 'Mechanical Keyboard',
    product_ORD_1003: '4K Monitor',
    product_ORD_1004: 'Ergonomic Chair',
    status_ORD_1001: 'Paid',
    status_ORD_1002: 'Pending',
    status_ORD_1003: 'Shipped',
    status_ORD_1004: 'Completed'
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
  computed: {},
  methods: {
    t(key, params) {
      return t(key, params);
    },
    onRowClick(row) {
      // 通过 widget-bus 发出业务事件，基座与其他物料可监听
      if (this.scope && this.scope.bus) {
        this.scope.bus.emit('order:click', { id: row.id, amount: row.amount, name: t('orders.product_' + row.id) });
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
