<template>
  <el-card>
    <div slot="header">{{ title || t('sales.title') }}</div>
    <el-row>
      <el-statistic :label="t('sales.amount_label')" :prefix="symbol" :value="summary.amount.toLocaleString()" />
      <el-statistic :label="t('sales.order_label')" :value="summary.orderCount" />
    </el-row>
    <el-progress v-if="showTrend" :percentage="trendPercent" />
    <el-footer-text>{{ t('sales.period_label') }}：{{ periodText }}</el-footer-text>
  </el-card>
</template>

<script>
import { t, onLocaleChange } from 'wc-i18n';

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
    }
  },
  data() {
    return {
      // 触发器：locale 变化时自增，驱动 computed 重新计算翻译文案
      localeTick: 0,
      summary: {
        amount: 128000,
        orderCount: 342
      }
    };
  },
  computed: {
    // 暴露 t 给模板使用
    t() {
      // 引用 localeTick 使其成为依赖，locale 变化时重新求值
      void this.localeTick;
      return t;
    },
    symbol() {
      return this.currency === 'USD' ? '$' : '¥';
    },
    periodText() {
      void this.localeTick;
      const map = {
        day: t('sales.period_day'),
        week: t('sales.period_week'),
        month: t('sales.period_month'),
        year: t('sales.period_year')
      };
      return map[this.period] || t('sales.period_month');
    },
    trendPercent() {
      return Math.min(100, (this.summary.orderCount / 500) * 100);
    }
  },
  mounted() {
    this.$emit('widget:loaded', { widget: 'bi-sales-panel', props: this.$props });
    // 演示跨技术栈通信：监听全局刷新指令
    if (window.widgetBus) {
      this._offBus = window.widgetBus.on('refresh-data', () => {
        this.summary.amount += Math.floor(Math.random() * 5000);
        this.summary.orderCount += Math.floor(Math.random() * 10);
      });
    }
    // 监听语言切换，触发重渲染
    this._offLocale = onLocaleChange(() => { this.localeTick++; });
  },
  beforeDestroy() {
    if (this._offBus) this._offBus();
    if (this._offLocale) this._offLocale();
  }
};
</script>
