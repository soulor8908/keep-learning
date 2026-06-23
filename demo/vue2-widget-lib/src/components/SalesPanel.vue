<template>
  <aui-card :title="config.title || '销售看板'">
    <aui-row>
      <aui-statistic label="销售额" :prefix="symbol" :value="summary.amount.toLocaleString()" />
      <aui-statistic label="订单数" :value="summary.orderCount" />
    </aui-row>
    <aui-progress v-if="config.showTrend" :percent="trendPercent" />
    <aui-footer>周期：{{ periodText }}</aui-footer>
  </aui-card>
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
    symbol() {
      return this.config.currency === 'USD' ? '$' : '¥';
    },
    periodText() {
      const map = {
        day: '今日',
        week: '本周',
        month: '本月',
        year: '本年'
      };
      return map[this.config.period] || '本月';
    },
    trendPercent() {
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
