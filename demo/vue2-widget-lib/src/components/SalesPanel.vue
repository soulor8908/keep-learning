<template>
  <div class="bi-sales-panel">
    <h3 class="title">{{ config.title || '销售看板' }}</h3>
    <div class="metrics">
      <div class="metric-card">
        <div class="metric-label">销售额</div>
        <div class="metric-value">¥{{ summary.amount.toLocaleString() }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">订单数</div>
        <div class="metric-value">{{ summary.orderCount }}</div>
      </div>
    </div>
    <div v-if="config.showTrend" class="trend">
      <div class="trend-bar" :style="{ width: trendWidth + '%' }"></div>
    </div>
    <div class="footer">
      周期：{{ periodText }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'SalesPanel',
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
        amount: 128000,
        orderCount: 342
      }
    };
  },
  computed: {
    periodText() {
      const map = {
        day: '今日',
        week: '本周',
        month: '本月',
        year: '本年'
      };
      return map[this.config.period] || '本月';
    },
    trendWidth() {
      return Math.min(100, (this.summary.orderCount / 500) * 100);
    }
  },
  mounted() {
    this.$emit('widget:loaded', { widget: 'bi-sales-panel', config: this.config });
    // 演示跨技术栈通信：监听全局刷新指令
    if (window.widgetBus) {
      this._offBus = window.widgetBus.on('refresh-data', () => {
        this.summary.amount += Math.floor(Math.random() * 5000);
        this.summary.orderCount += Math.floor(Math.random() * 10);
      });
    }
  },
  beforeDestroy() {
    if (this._offBus) this._offBus();
  }
};
</script>

<style scoped>
.bi-sales-panel {
  padding: 16px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.bi-sales-panel .title {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #1f2937;
}
.bi-sales-panel .metrics {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.bi-sales-panel .metric-card {
  flex: 1;
  padding: 12px;
  background: #f3f4f6;
  border-radius: 6px;
}
.bi-sales-panel .metric-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}
.bi-sales-panel .metric-value {
  font-size: 20px;
  font-weight: 600;
  color: #111827;
}
.bi-sales-panel .trend {
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}
.bi-sales-panel .trend-bar {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #06b6d4);
  transition: width 0.3s ease;
}
.bi-sales-panel .footer {
  font-size: 12px;
  color: #6b7280;
}
</style>
