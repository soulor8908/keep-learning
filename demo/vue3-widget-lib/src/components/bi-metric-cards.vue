<template>
  <el-card :header="title || '指标卡组'">
    <el-row :gutter="12">
      <el-col :span="12" v-for="c in cards" :key="c.id">
        <div class="metric-card">
          <div class="metric-label">{{ c.label }}</div>
          <div class="metric-value">{{ c.value }}</div>
          <el-tag :type="c.trend === 'up' ? 'success' : 'danger'" size="small">
            {{ c.trend === 'up' ? '↑' : '↓' }} {{ c.trendValue }}
          </el-tag>
          <div class="metric-extra">
            <!-- 组件内部 slot：未被外部填充时回退到 c.extra -->
            <slot name="extra">{{ c.extra }}</slot>
          </div>
        </div>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup>
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
