<template>
  <div class="finance-overview">
    <header class="header">
      <h3>{{ panelTitle }}</h3>
      <span v-if="closable" class="close-btn" @click="handleClose">×</span>
    </header>
    <div class="summary">
      <div class="summary-item" v-for="item in summaryData" :key="item.key">
        <span class="label">{{ item.label }}</span>
        <span class="value" :class="{ negative: item.value < 0 }">
          {{ item.value }}
        </span>
      </div>
    </div>
    <footer v-if="footnote" class="footnote">{{ footnote }}</footer>
  </div>
</template>

<script>
// 这是一个典型的 Vue3 业务组件（Composition API），尚未改造为看板物料。
// 它使用常规 props（panelTitle / summaryData / closable / footnote），不依赖 wc 框架。
// 演示目标：通过 AI 迁移工具一次性改造为 wc 物料，保留原有 props（props 模式）。
import { ref, onMounted } from 'vue';

export default {
  name: 'FinanceOverview',
  props: {
    panelTitle: {
      type: String,
      default: '财务概览'
    },
    summaryData: {
      type: Array,
      default: () => []
    },
    closable: {
      type: Boolean,
      default: false
    },
    footnote: {
      type: String,
      default: ''
    }
  },
  emits: ['close'],
  setup(props, { emit }) {
    const mountedAt = ref(null);

    onMounted(() => {
      mountedAt.value = new Date().toISOString();
    });

    function handleClose() {
      emit('close', { at: mountedAt.value });
    }

    return { handleClose };
  }
};
</script>

<style scoped>
.finance-overview {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 20px;
  background: #fff;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.close-btn {
  cursor: pointer;
  color: #c0c4cc;
  font-size: 20px;
}
.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}
.summary-item {
  display: flex;
  flex-direction: column;
}
.label {
  font-size: 12px;
  color: #909399;
}
.value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}
.value.negative {
  color: #f56c6c;
}
.footnote {
  margin-top: 12px;
  font-size: 12px;
  color: #909399;
}
</style>
