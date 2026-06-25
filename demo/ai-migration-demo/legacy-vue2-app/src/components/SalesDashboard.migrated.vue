<template>
  <div class="sales-dashboard bi-sales-dashboard">
    <h2>{{ title }}</h2>
    <div class="metrics">
      <div class="metric" v-for="item in metrics" :key="item.label">
        <span class="metric-label">{{ item.label }}</span>
        <span class="metric-value">{{ formatValue(item.value) }}</span>
      </div>
    </div>
    <p v-if="showFooter" class="footer">更新时间：{{ updatedAt }}</p>
  </div>
</template>

<script>
// 这是一个典型的 Vue2 业务组件，尚未改造为看板物料。
// 它使用常规 props（title / metrics / showFooter），不依赖 wc 框架。
// 演示目标：通过 AI 迁移工具一次性改造为 wc 物料，保留原有 props（props 模式）。
export default {
  name: 'SalesDashboard',
  props: {
    title: {
      type: String,
      default: '销售看板'
    },
    metrics: {
      type: Array,
      default: () => []
    },
    showFooter: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      updatedAt: new Date().toLocaleString()
    };
  },
  methods: {
    formatValue(val) {
      if (typeof val === 'number') {
        return val.toLocaleString();
      }
      return val;
    }
  }
};
</script>

<style scoped>
.sales-dashboard {
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}
.metrics {
  display: flex;
  gap: 16px;
  margin: 12px 0;
}
.metric {
  flex: 1;
}
.metric-label {
  display: block;
  color: #909399;
  font-size: 12px;
}
.metric-value {
  display: block;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}
.footer {
  color: #909399;
  font-size: 12px;
}
</style>
