<template>
  <aui-card :title="config.title || t('sales.title')">
    <aui-row>
      <aui-statistic :label="t('sales.amount_label')" :prefix="symbol" :value="summary.amount.toLocaleString()" />
      <aui-statistic :label="t('sales.order_label')" :value="summary.orderCount" />
    </aui-row>
    <aui-progress v-if="config.showTrend" :percent="trendPercent" />
    <aui-footer>{{ t('sales.period_label') }}：{{ periodText }}</aui-footer>
  </aui-card>
</template>

<script>
import { t, onLocaleChange } from 'wc-i18n';

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
      return this.config.currency === 'USD' ? '$' : '¥';
    },
    periodText() {
      void this.localeTick;
      const map = {
        day: t('sales.period_day'),
        week: t('sales.period_week'),
        month: t('sales.period_month'),
        year: t('sales.period_year')
      };
      return map[this.config.period] || t('sales.period_month');
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
    // 监听语言切换，触发重渲染
    this._offLocale = onLocaleChange(() => { this.localeTick++; });
  },
  beforeDestroy() {
    if (this._offBus) this._offBus();
    if (this._offLocale) this._offLocale();
  }
};
</script>
