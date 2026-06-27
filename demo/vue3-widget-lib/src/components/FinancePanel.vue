<template>
  <el-card :header="title || t('finance.title')">
    <el-row>
      <el-statistic :title="t('finance.income_label')" :prefix="symbol" :value="summary.income" />
      <el-statistic :title="t('finance.expense_label')" :prefix="symbol" :value="summary.expense" />
    </el-row>
    <template v-if="showBreakdown">
      <div
        v-for="(item, idx) in breakdown()"
        :key="idx"
        class="finance-list-item"
      >
        <span class="finance-list-label">{{ item.label }}</span>
        <span class="finance-list-value">{{ `${symbol}${item.value.toLocaleString()}` }}</span>
      </div>
    </template>
    <div class="finance-footer">{{ t('finance.currency_label') }}：{{ currencyText() }}</div>
  </el-card>
</template>

<script>
import { ref, onMounted } from 'vue';
import { t } from 'wc-i18n';

export default {
  name: 'FinancePanel',
  props: {
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
    },
    scope: {
      type: Object,
      default: null
    }
  },
  setup() {
    const summary = ref({
      income: 256000,
      expense: 98000
    });

    // 用函数而非 computed：computed 会缓存 t() 返回值，$forceUpdate 不会使其失效。
    // wrapper 在 locale 变化时 $forceUpdate 物料实例，模板重新调用 breakdown() 拿到新语言文案
    const breakdown = () => [
      { label: t('finance.labor'), value: 42000 },
      { label: t('finance.marketing'), value: 31000 },
      { label: t('finance.infrastructure'), value: 25000 }
    ];

    onMounted(() => {
      if (props.scope && props.scope.bus) {
        props.scope.bus.emit('widget:loaded', { widget: 'bi-finance-panel' });
        props.scope.bus.on('refresh-data', () => {
          summary.value.income += Math.floor(Math.random() * 5000);
          summary.value.expense += Math.floor(Math.random() * 2000);
        });
      }
    });

    return { summary, breakdown, t };
  },
  computed: {
    symbol() {
      return this.currency === 'USD' ? '$' : '¥';
    }
  },
  methods: {
    // 用方法而非 computed：computed 会缓存 t() 返回值，$forceUpdate 不会使其失效
    currencyText() {
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
