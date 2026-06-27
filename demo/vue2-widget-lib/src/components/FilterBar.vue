<template>
  <el-card>
    <div slot="header">{{ t('filter.title') }}</div>
    <el-row :gutter="12">
      <el-col :span="8" v-for="f in filters" :key="f.field">
        <div class="filter-label">{{ t('filter.field_' + f.field) }}</div>
        <el-select
          v-model="selectedValues[f.field]"
          @change="onFilterChange(f.field, $event)"
          style="width:100%"
        >
          <el-option
            v-for="opt in normalizeOptions(f)"
            :key="opt.value"
            :label="t('filter.opt_' + f.field + '_' + opt.value)"
            :value="opt.value"
          />
        </el-select>
      </el-col>
    </el-row>
  </el-card>
</template>

<script>
import { t, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key。
// 语言切换的响应式由 wrapper 基础设施层统一处理（对物料实例 $forceUpdate），
// 组件只需在模板/方法里直接调用 t()，无需自建 localeTick / onLocaleChange。
addMessages('zh', {
  filter: {
    title: '筛选栏',
    refresh: '刷新',
    field_region: '地区',
    opt_region_all: '全部',
    opt_region_east: '华东',
    opt_region_west: '华西',
    opt_region_north: '华北',
    opt_region_south: '华南',
    field_period: '周期',
    opt_period_day: '日',
    opt_period_week: '周',
    opt_period_month: '月',
    opt_period_year: '年'
  }
});
addMessages('en', {
  filter: {
    title: 'Filter Bar',
    refresh: 'Refresh',
    field_region: 'Region',
    opt_region_all: 'All',
    opt_region_east: 'East',
    opt_region_west: 'West',
    opt_region_north: 'North',
    opt_region_south: 'South',
    field_period: 'Period',
    opt_period_day: 'Day',
    opt_period_week: 'Week',
    opt_period_month: 'Month',
    opt_period_year: 'Year'
  }
});

export default {
  name: 'FilterBar',
  props: {
    filters: {
      type: Array,
      default: () => []
    },
    scope: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      selectedValues: {},
      _offBus: null
    };
  },
  computed: {},
  mounted() {
    // 初始化选中值（用 $set 保证响应式）
    this.filters.forEach(f => {
      this.$set(this.selectedValues, f.field, f.default);
    });
  },
  beforeDestroy() {
    if (this._offBus) this._offBus();
  },
  methods: {
    t(key, params) {
      return t(key, params);
    },
    // 兼容旧格式（options 为对象数组）和新格式（options 为字符串数组）
    normalizeOptions(f) {
      if (!Array.isArray(f.options)) return [];
      return f.options.map(opt =>
        typeof opt === 'string' ? { value: opt } : { value: opt.value || opt }
      );
    },
    onFilterChange(field, value) {
      if (this.scope && this.scope.bus) {
        this.scope.bus.emit('filter-change', { field, value });
      }
    }
  }
};
</script>

<style scoped>
.filter-label {
  margin-bottom: 8px;
  font-size: 13px;
  color: #6b7280;
}
</style>
