<template>
  <aui-card :title="config.title || t('finance.title')">
    <aui-row>
      <aui-statistic :label="t('finance.income_label')" :prefix="symbol" :value="summary.income.toLocaleString()" />
      <aui-statistic :label="t('finance.expense_label')" :prefix="symbol" :value="summary.expense.toLocaleString()" />
    </aui-row>
    <template v-if="config.showBreakdown">
      <aui-list-item
        v-for="(item, idx) in breakdown"
        :key="idx"
        :label="item.label"
        :value="`${symbol}${item.value.toLocaleString()}`"
      />
    </template>
    <aui-footer>{{ t('finance.currency_label') }}：{{ currencyText }}</aui-footer>
  </aui-card>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { t, onLocaleChange } from 'wc-i18n';

export default {
  name: 'FinancePanel',
  props: {
    // 包装层已经把 config String 解析为 Object
    config: {
      type: Object,
      default: () => ({})
    }
  },
  setup() {
    // 触发器：locale 变化时自增，驱动 computed 重新计算翻译文案
    const localeTick = ref(0);
    let offLocale = null;

    const summary = ref({
      income: 256000,
      expense: 98000
    });

    const breakdown = computed(() => {
      void localeTick.value;
      return [
        { label: t('finance.labor'), value: 42000 },
        { label: t('finance.marketing'), value: 31000 },
        { label: t('finance.infrastructure'), value: 25000 }
      ];
    });

    onMounted(() => {
      if (window.widgetBus) {
        window.widgetBus.emit('widget:loaded', { widget: 'bi-finance-panel' });
        // 演示跨技术栈通信：监听全局刷新指令
        window.widgetBus.on('refresh-data', () => {
          summary.value.income += Math.floor(Math.random() * 5000);
          summary.value.expense += Math.floor(Math.random() * 2000);
        });
      }
      // 监听语言切换，触发重渲染
      offLocale = onLocaleChange(() => { localeTick.value++; });
    });

    onBeforeUnmount(() => {
      if (offLocale) offLocale();
    });

    return { localeTick, summary, breakdown, t };
  },
  computed: {
    symbol() {
      return this.config.currency === 'USD' ? '$' : '¥';
    },
    currencyText() {
      void this.localeTick;
      return this.config.currency === 'USD' ? t('finance.usd') : t('finance.cny');
    }
  }
};
</script>
