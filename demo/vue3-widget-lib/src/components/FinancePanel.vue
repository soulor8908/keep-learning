<template>
  <div class="bi-finance-panel">
    <h3 class="title">{{ config.title || '财务看板' }}</h3>
    <div class="metrics">
      <div class="metric-card">
        <div class="metric-label">总收入</div>
        <div class="metric-value">{{ symbol }}{{ summary.income.toLocaleString() }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">总支出</div>
        <div class="metric-value">{{ symbol }}{{ summary.expense.toLocaleString() }}</div>
      </div>
    </div>
    <div v-if="config.showBreakdown" class="breakdown">
      <div class="breakdown-item" v-for="(item, idx) in breakdown" :key="idx">
        <span class="breakdown-label">{{ item.label }}</span>
        <span class="breakdown-value">{{ symbol }}{{ item.value.toLocaleString() }}</span>
      </div>
    </div>
    <div class="footer">
      币种：{{ currencyText }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'FinancePanel',
  props: {
    // 包装层已经把 config String 解析为 Object
    config: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      summary: {
        income: 256000,
        expense: 98000
      },
      breakdown: [
        { label: '人力成本', value: 42000 },
        { label: '市场推广', value: 31000 },
        { label: '基础设施', value: 25000 }
      ]
    };
  },
  computed: {
    symbol() {
      return this.config.currency === 'USD' ? '$' : '¥';
    },
    currencyText() {
      return this.config.currency === 'USD' ? '美元' : '人民币';
    }
  },
  mounted() {
    this.$emit('widget:loaded', { widget: 'bi-finance-panel', config: this.config });
    // 演示跨技术栈通信：监听全局刷新指令
    if (window.widgetBus) {
      this._offBus = window.widgetBus.on('refresh-data', () => {
        this.summary.income += Math.floor(Math.random() * 5000);
        this.summary.expense += Math.floor(Math.random() * 2000);
      });
    }
  },
  beforeDestroy() {
    if (this._offBus) this._offBus();
  }
};
</script>

<style scoped>
.bi-finance-panel {
  padding: 16px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.title {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #1f2937;
}
.metrics {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.metric-card {
  flex: 1;
  padding: 12px;
  background: #f3f4f6;
  border-radius: 6px;
}
.metric-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}
.metric-value {
  font-size: 20px;
  font-weight: 600;
  color: #111827;
}
.breakdown {
  margin-bottom: 12px;
}
.breakdown-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 13px;
}
.breakdown-item:last-child {
  border-bottom: none;
}
.breakdown-label {
  color: #6b7280;
}
.breakdown-value {
  color: #111827;
  font-weight: 500;
}
.footer {
  font-size: 12px;
  color: #6b7280;
}
</style>
