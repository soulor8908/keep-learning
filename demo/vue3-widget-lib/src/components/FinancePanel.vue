<template>
  <el-card :header="title || t('finance.title')">
    <el-row>
      <el-statistic :title="t('finance.income_label')" :prefix="symbol" :value="summary.income" />
      <el-statistic :title="t('finance.expense_label')" :prefix="symbol" :value="summary.expense" />
    </el-row>
    <template v-if="showBreakdown">
      <div
        v-for="(item, idx) in breakdown"
        :key="idx"
        class="finance-list-item"
      >
        <span class="finance-list-label">{{ item.label }}</span>
        <span class="finance-list-value">{{ `${symbol}${item.value.toLocaleString()}` }}</span>
      </div>
    </template>
    <div class="finance-footer">{{ t('finance.currency_label') }}：{{ currencyText }}</div>
  </el-card>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { t, onLocaleChange } from 'wc-i18n';

export default {
  name: 'FinancePanel',
  props: {
    // 扁平化 props：宿主按 kebab-case attribute 逐项传入，包装层按声明类型解析
    title: {
      type: String,
      default: ''
    },
    showBreakdown: {
      type: Boolean,
      default: false
    },
    currency: {
      type: String,
      default: 'CNY'
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
      return this.currency === 'USD' ? '$' : '¥';
    },
    currencyText() {
      void this.localeTick;
      return this.currency === 'USD' ? t('finance.usd') : t('finance.cny');
    }
  }
};
</script>

<style scoped>
.finance-list-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 13px;
}
.finance-list-item:last-child {
  border-bottom: none;
}
.finance-list-label {
  color: #6b7280;
}
.finance-list-value {
  color: #111827;
  font-weight: 500;
}
.finance-footer {
  margin-top: 12px;
  font-size: 12px;
  color: #6b7280;
}
</style>
