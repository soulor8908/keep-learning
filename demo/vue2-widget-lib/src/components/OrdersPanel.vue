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
import { t, onLocaleChange, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key
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
    // 扁平化 props：宿主按 kebab-case attribute 逐项传入，包装层按声明类型解析
    title: {
      type: String,
      default: ''
    },
    orders: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      // 触发器：locale 变化时自增，驱动 computed 重新计算翻译文案
      localeTick: 0,
      _offLocale: null
    };
  },
  computed: {
    // 暴露 t 给模板使用
    t() {
      // 引用 localeTick 使其成为依赖，locale 变化时重新求值
      void this.localeTick;
      return t;
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
    // 监听语言切换，触发重渲染
    this._offLocale = onLocaleChange(() => { this.localeTick++; });
  },
  beforeDestroy() {
    if (this._offLocale) this._offLocale();
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
