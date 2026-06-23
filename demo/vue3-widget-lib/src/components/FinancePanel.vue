<template>
  <aui-card :title="config.title || '财务看板'">
    <aui-row>
      <aui-statistic label="总收入" :prefix="symbol" :value="summary.income.toLocaleString()" />
      <aui-statistic label="总支出" :prefix="symbol" :value="summary.expense.toLocaleString()" />
    </aui-row>
    <template v-if="config.showBreakdown">
      <aui-list-item
        v-for="(item, idx) in breakdown"
        :key="idx"
        :label="item.label"
        :value="`${symbol}${item.value.toLocaleString()}`"
      />
    </template>
    <aui-footer>币种：{{ currencyText }}</aui-footer>
  </aui-card>
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
