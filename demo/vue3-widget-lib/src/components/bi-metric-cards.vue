<template>
  <el-card :header="title || t('metricCards.title')">
    <el-row :gutter="12">
      <el-col :span="12" v-for="c in cards" :key="c.id">
        <div class="metric-card">
          <div class="metric-label">{{ t('metricCards.card_' + c.id + '_label') }}</div>
          <div class="metric-value">{{ c.value }}</div>
          <el-tag :type="c.trend === 'up' ? 'success' : 'danger'" size="small">
            {{ c.trend === 'up' ? '↑' : '↓' }} {{ c.trendValue }}
          </el-tag>
          <div class="metric-extra">
            <!-- 组件内部 slot：未被外部填充时回退到 i18n 翻译 -->
            <slot name="extra">{{ t('metricCards.card_' + c.id + '_extra') }}</slot>
          </div>
        </div>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup>
import { t, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key。
// 语言切换的响应式由 wrapper 基础设施层统一处理（对物料实例 $forceUpdate），
// 组件只需在模板里直接调用 t()，无需自建 localeTick / onLocaleChange。
addMessages('zh', {
  metricCards: {
    title: '指标卡组',
    card_growth_label: '增长率',
    card_growth_extra: '同比上月',
    card_retention_label: '留存率',
    card_retention_extra: '7日留存',
    card_conversion_label: '转化率',
    card_conversion_extra: '下单转化',
    card_revenue_label: '客单价',
    card_revenue_extra: '平均订单金额'
  }
});
addMessages('en', {
  metricCards: {
    title: 'Metric Cards',
    card_growth_label: 'Growth Rate',
    card_growth_extra: 'vs last month',
    card_retention_label: 'Retention Rate',
    card_retention_extra: '7-day retention',
    card_conversion_label: 'Conversion Rate',
    card_conversion_extra: 'Order conversion',
    card_revenue_label: 'Avg. Order Value',
    card_revenue_extra: 'Per order amount'
  }
});

defineOptions({ name: 'BiMetricCards' });

defineProps({
  // 扁平化 props：宿主按 kebab-case attribute 逐项传入，包装层按声明类型解析
  // 形如：title, cards: [{ id, label, value, trend: 'up'|'down', trendValue, extra }]
  title: {
    type: String,
    default: ''
  },
  cards: {
    type: Array,
    default: () => []
  }
});
</script>

<style scoped>
.metric-card {
  padding: 12px;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  margin-bottom: 12px;
  background: #fafafa;
}
.metric-label {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 4px;
}
.metric-value {
  font-size: 24px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 8px;
}
.metric-extra {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}
</style>
