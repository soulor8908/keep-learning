<template>
  <div class="bi-sales-panel">
    <h3>{{ config.title || '销售看板' }}</h3>
    <div class="stats">
      <aui-statistic title="销售额" :value="summary.amount" />
      <aui-statistic title="订单数" :value="summary.orderCount" />
    </div>
  </div>
</template>

<script>
export default {
  name: 'SalesPanel',
  props: {
    // wrapper 已经把 config attribute 解析为 Object 传入
    config: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      summary: {
        amount: 128000,
        orderCount: 342
      }
    };
  }
};
</script>

<style scoped>
.bi-sales-panel {
  padding: 16px;
}
.stats {
  display: flex;
  gap: 24px;
  margin-top: 12px;
}
</style>
