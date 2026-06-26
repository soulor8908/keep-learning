<template>
  <el-card :header="title || '支付区域'" class="bi-payment-panel">
    <div class="team-tag-row">
      <span class="team-tag">B 业务团队 · Vue3</span>
    </div>
    <div class="amount-row">
      <span class="amount-label">待支付</span>
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
    <el-button type="primary" class="pay-btn" @click="pay">立即支付</el-button>
  </el-card>
</template>

<script>
import { ref, computed } from 'vue';

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
    const selected = ref(null);
    const methods = computed(() => props.methods || []);
    const amount = computed(() => Number(props.amount || 0));

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

    return { selected, methods, amount, select, pay };
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
