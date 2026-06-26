<template>
  <el-card :header="title || t('metricCards.title')">
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
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { t as rawT, onLocaleChange, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key
addMessages('zh', { metricCards: { title: '指标卡组' } });
addMessages('en', { metricCards: { title: 'Metric Cards' } });

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

// 触发器：locale 变化时自增，驱动 computed 重新计算翻译文案
const localeTick = ref(0);
let offLocale = null;

// 包装 t：引用 localeTick 使模板渲染依赖 locale 变化，切换语言时重新求值
const t = (key, params) => {
  void localeTick.value;
  return rawT(key, params);
};

onMounted(() => {
  // 监听语言切换，触发重渲染
  offLocale = onLocaleChange(() => { localeTick.value++; });
});

onBeforeUnmount(() => {
  if (offLocale) offLocale();
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
