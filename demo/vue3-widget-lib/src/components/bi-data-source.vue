<template>
  <el-card :header="title || t('dataSource.title')">
    <el-row :gutter="16">
      <el-col :span="8" v-for="m in displayMetrics" :key="m.id">
        <!-- el-statistic 的 suffix 通过 prop 传递，避免 isCustomElement 模式下 #suffix slot 编译问题 -->
        <el-statistic :title="m.name" :value="m.value" :suffix="m.unit" />
      </el-col>
    </el-row>
    <div class="bi-ds-actions">
      <el-button type="primary" @click="refreshData">{{ t('dataSource.refresh') }}</el-button>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { t, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key。
// 语言切换的响应式由 wrapper 基础设施层统一处理（对物料实例 $forceUpdate），
// 组件只需在模板里直接调用 t()，无需自建 localeTick / onLocaleChange。
addMessages('zh', { dataSource: { title: '数据源', refresh: '刷新数据' } });
addMessages('en', { dataSource: { title: 'Data Source', refresh: 'Refresh Data' } });

defineOptions({ name: 'BiDataSource' });

const props = defineProps({
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
  },
  scope: {
    type: Object,
    default: null
  }
});

let offFilter = null;

// 本地指标数据：从 metrics prop 初始化（prop 变化触发整体重建，会重新初始化）
const localMetrics = ref(
  Array.isArray(props.metrics) ? props.metrics.map((m) => ({ ...m })) : []
);
// 当前筛选关键词，由 filter-change 事件设置
const activeFilter = ref('');

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
  if (props.scope && props.scope.bus) {
    props.scope.bus.emit('data-updated', { metrics: localMetrics.value });
  }
}

onMounted(() => {
  if (!props.scope || !props.scope.bus) return;
  props.scope.bus.emit('widget:loaded', { widget: 'bi-data-source' });
  offFilter = props.scope.bus.on('filter-change', (payload) => {
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
