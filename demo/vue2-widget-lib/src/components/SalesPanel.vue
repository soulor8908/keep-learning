<template>
  <el-card>
    <div slot="header">{{ title || t('sales.title') }}</div>
    <el-row>
      <el-statistic :label="t('sales.amount_label')" :prefix="symbol" :value="summary.amount.toLocaleString()" />
      <el-statistic :label="t('sales.order_label')" :value="summary.orderCount" />
    </el-row>
    <el-progress v-if="showTrend" :percentage="trendPercent" />
    <el-footer-text>{{ t('sales.period_label') }}：{{ periodText() }}</el-footer-text>
  </el-card>
</template>

<script>
import { t } from 'wc-i18n';

export default {
  name: 'SalesPanel',
  props: {
    // 扁平化 props：宿主按 kebab-case attribute 逐项传入，包装层按声明类型解析
    title: {
      type: String,
      default: ''
    },
    showTrend: {
      type: Boolean,
      default: false
    },
    currency: {
      type: String,
      default: 'CNY'
    },
    period: {
      type: String,
      default: 'month'
    },
    scope: {
      type: Object,
      default: null
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
      return this.currency === 'USD' ? '$' : '¥';
    },
    trendPercent() {
      return Math.min(100, (this.summary.orderCount / 500) * 100);
    }
  },
  methods: {
    t(key, params) {
      return t(key, params);
    },
    periodText() {
      const map = {
        day: t('sales.period_day'),
        week: t('sales.period_week'),
        month: t('sales.period_month'),
        year: t('sales.period_year')
      };
      return map[this.period] || t('sales.period_month');
    }
  },
  mounted() {
    this.$emit('widget:loaded', { widget: 'bi-sales-panel', props: this.$props });
    // 演示跨技术栈通信：监听全局刷新指令
    if (this.scope && this.scope.bus) {
      this._offBus = this.scope.bus.on('refresh-data', () => {
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
