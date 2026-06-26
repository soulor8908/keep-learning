<template>
  <el-card>
    <div slot="header">{{ t('filter.title') }}</div>
    <el-row :gutter="12">
      <el-col :span="8" v-for="f in filters" :key="f.field">
        <div class="filter-label">{{ f.label }}</div>
        <el-select
          v-model="selectedValues[f.field]"
          @change="onFilterChange(f.field, $event)"
          style="width:100%"
        >
          <el-option
            v-for="opt in f.options"
            :key="opt.value"
            :label="opt.label"
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
addMessages('zh', { filter: { title: '筛选栏', refresh: '刷新' } });
addMessages('en', { filter: { title: 'Filter Bar', refresh: 'Refresh' } });

export default {
  name: 'FilterBar',
  props: {
    // 扁平化 props：宿主按 kebab-case attribute 逐项传入，包装层按声明类型解析
    filters: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      selectedValues: {},
      _offBus: null
    };
  },
  computed: {
    // 暴露 t 给模板使用；wrapper 在 locale 变化时 $forceUpdate 物料实例，
    // 模板重新求值 t('xxx') 即可拿到新语言文案
    t() {
      return t;
    }
  },
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
    onFilterChange(field, value) {
      if (window.widgetBus) {
        window.widgetBus.emit('filter-change', { field, value });
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
