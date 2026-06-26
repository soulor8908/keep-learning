<template>
  <div class="bi-sales-panel">
    <h3>{{ title || '销售看板' }}</h3>
    <div class="stats">
      <el-statistic title="销售额" :value="summary.amount" />
      <el-statistic title="订单数" :value="summary.orderCount" />
    </div>
  </div>
</template>

<script>
export default {
  name: 'SalesPanel',
  props: {
    // 扁平化 props：宿主按 kebab-case attribute 传入，包装层按声明类型解析
    title: {
      type: String,
      default: ''
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
