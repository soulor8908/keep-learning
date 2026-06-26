<template>
  <el-card :header="title || '数据源'">
    <el-row :gutter="16">
      <el-col :span="8" v-for="m in displayMetrics" :key="m.id">
        <!-- el-statistic 的 suffix 通过 prop 传递，避免 isCustomElement 模式下 #suffix slot 编译问题 -->
        <el-statistic :title="m.name" :value="m.value" :suffix="m.unit" />
      </el-col>
    </el-row>
    <div class="bi-ds-actions">
      <el-button type="primary" @click="refreshData">刷新数据</el-button>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

defineOptions({ name: 'BiDataSource' });

const props = defineProps({
  // 扁平化 props：宿主按 kebab-case attribute 逐项传入，包装层按声明类型解析
  // 形如：title, metrics: [{ id, name, value, unit }], refreshInterval
  title: {
    type: String,
    default: ''
  },
  metrics: {
    type: Array,
    default: () => []
  },
  refreshInterval: {
    type: Number,
    default: 0
  }
});

// 本地指标数据：从 metrics prop 初始化（prop 变化触发整体重建，会重新初始化）
const localMetrics = ref(
  Array.isArray(props.metrics) ? props.metrics.map((m) => ({ ...m })) : []
);
// 当前筛选关键词，由 filter-change 事件设置
const activeFilter = ref('');

let offFilter = null;

const displayMetrics = computed(() => {
  const kw = activeFilter.value.trim();
  if (!kw) return localMetrics.value;
  return localMetrics.value.filter(
    (m) => String(m.name).includes(kw) || String(m.id).includes(kw)
  );
});

function refreshData() {
  localMetrics.value = localMetrics.value.map((m) => ({
    ...m,
    value: Math.floor(Math.random() * 100000)
  }));
  if (window.widgetBus) {
    window.widgetBus.emit('data-updated', { metrics: localMetrics.value });
  }
}

onMounted(() => {
  if (!window.widgetBus) return;
  window.widgetBus.emit('widget:loaded', { widget: 'bi-data-source' });
  offFilter = window.widgetBus.on('filter-change', (payload) => {
    // payload: { keyword: string }；空载荷清空筛选
    activeFilter.value = payload && payload.keyword ? String(payload.keyword) : '';
  });
});

onBeforeUnmount(() => {
  if (offFilter) offFilter();
});
</script>

<style scoped>
.bi-ds-actions {
  margin-top: 16px;
}
</style>
