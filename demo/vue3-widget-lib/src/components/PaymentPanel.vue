<template>
  <el-card :header="title || t('payment.title')" class="bi-payment-panel">
    <div class="team-tag-row">
      <span class="team-tag">{{ t('payment.team_tag') }}</span>
    </div>
    <div class="amount-row">
      <span class="amount-label">{{ t('payment.pending') }}</span>
      <span class="amount-value">¥{{ amount.toFixed(2) }}</span>
    </div>
    <div class="methods">
      <el-button
        v-for="m in methodIds"
        :key="m"
        :type="m === selected ? 'primary' : 'default'"
        size="small"
        @click="select(m)"
      >
        {{ t('payment.method_' + m) }}
      </el-button>
    </div>
    <el-button type="primary" class="pay-btn" @click="pay">{{ t('payment.pay_now') }}</el-button>
  </el-card>
</template>

<script>
import { ref, computed } from 'vue';
import { t, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key。
// 语言切换的响应式由 wrapper 基础设施层统一处理（对物料实例 $forceUpdate），
// 组件只需在模板里直接调用 t()，无需自建 localeTick / onLocaleChange。
addMessages('zh', {
  payment: {
    title: '支付区域',
    team_tag: 'B 业务团队 · Vue3',
    pending: '待支付',
    pay_now: '立即支付',
    method_alipay: '支付宝',
    method_wechat: '微信支付',
    method_card: '银行卡'
  }
});
addMessages('en', {
  payment: {
    title: 'Payment',
    team_tag: 'Team B · Vue3',
    pending: 'Pending',
    pay_now: 'Pay Now',
    method_alipay: 'Alipay',
    method_wechat: 'WeChat Pay',
    method_card: 'Bank Card'
  }
});

export default {
  name: 'PaymentPanel',
  props: {
    title: {
      type: String,
      default: ''
    },
    amount: {
      type: Number,
      default: 0
    },
    methods: {
      type: Array,
      default: () => []
    },
    scope: {
      type: Object,
      default: null
    }
  },
  setup(props) {
    const selected = ref(null);
    // methods prop 现在为字符串数组 ['alipay', 'wechat', 'card']
    const methodIds = computed(() => {
      const m = props.methods;
      if (!Array.isArray(m)) return [];
      return m.map(item => typeof item === 'string' ? item : (item && item.id) || '');
    });
    const amount = computed(() => Number(props.amount || 0));

    function select(m) {
      selected.value = m;
    }

    function pay() {
      const methodId = selected.value;
      if (!methodId) return;
      if (props.scope && props.scope.bus) {
        props.scope.bus.emit('payment:success', { method: methodId, amount: amount.value });
      }
    }

    // 直接暴露 t：wrapper 在 locale 变化时 $forceUpdate 物料实例，
    // 模板重新求值 t('xxx') 即可拿到新语言文案
    return { selected, methodIds, amount, select, pay, t };
  }
};
</script>

<style scoped>
.bi-payment-panel .team-tag-row {
  margin-bottom: 8px;
}
.bi-payment-panel .team-tag {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}
.bi-payment-panel .amount-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}
.bi-payment-panel .amount-label {
  color: #606266;
  font-size: 13px;
}
.bi-payment-panel .amount-value {
  font-size: 22px;
  font-weight: 600;
  color: #f56c6c;
}
.bi-payment-panel .methods {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.bi-payment-panel .pay-btn {
  width: 100%;
}
</style>
