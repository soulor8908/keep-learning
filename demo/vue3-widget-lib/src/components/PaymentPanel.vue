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
        v-for="m in methods"
        :key="m.id"
        :type="m.id === selected ? 'primary' : 'default'"
        size="small"
        @click="select(m)"
      >
        {{ m.label }}
      </el-button>
    </div>
    <el-button type="primary" class="pay-btn" @click="pay">{{ t('payment.pay_now') }}</el-button>
  </el-card>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { t, onLocaleChange, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key
addMessages('zh', {
  payment: {
    title: '支付区域',
    team_tag: 'B 业务团队 · Vue3',
    pending: '待支付',
    pay_now: '立即支付'
  }
});
addMessages('en', {
  payment: {
    title: 'Payment',
    team_tag: 'Team B · Vue3',
    pending: 'Pending',
    pay_now: 'Pay Now'
  }
});

export default {
  name: 'PaymentPanel',
  props: {
    // 扁平化 props：宿主按 kebab-case attribute 逐项传入，包装层按声明类型解析
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
    }
  },
  setup(props) {
    // 触发器：locale 变化时自增，驱动 computed 重新计算翻译文案
    const localeTick = ref(0);
    let offLocale = null;

    const selected = ref(null);
    const methods = computed(() => props.methods || []);
    const amount = computed(() => Number(props.amount || 0));

    // 包装 t：引用 localeTick 使模板渲染依赖 locale 变化，切换语言时重新求值
    const tt = (key, params) => {
      void localeTick.value;
      return t(key, params);
    };

    function select(m) {
      selected.value = m.id;
    }

    function pay() {
      const m = methods.value.find(x => x.id === selected.value);
      if (!m) return;
      if (window.widgetBus) {
        window.widgetBus.emit('payment:success', { method: m.label, amount: amount.value });
      }
    }

    onMounted(() => {
      // 监听语言切换，触发重渲染
      offLocale = onLocaleChange(() => { localeTick.value++; });
    });

    onBeforeUnmount(() => {
      if (offLocale) offLocale();
    });

    return { selected, methods, amount, select, pay, t: tt };
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
