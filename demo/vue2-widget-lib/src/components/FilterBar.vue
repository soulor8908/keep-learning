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
import { t, onLocaleChange, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key
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
      // 触发器：locale 变化时自增，驱动 computed 重新计算翻译文案
      localeTick: 0,
      selectedValues: {},
      _offBus: null,
      _offLocale: null
    };
  },
  computed: {
    // 暴露 t 给模板使用
    t() {
      // 引用 localeTick 使其成为依赖，locale 变化时重新求值
      void this.localeTick;
      return t;
    }
  },
  mounted() {
    // 初始化选中值（用 $set 保证响应式）
    this.filters.forEach(f => {
      this.$set(this.selectedValues, f.field, f.default);
    });
    // 监听语言切换，触发重渲染
    this._offLocale = onLocaleChange(() => { this.localeTick++; });
  },
  beforeDestroy() {
    if (this._offBus) this._offBus();
    if (this._offLocale) this._offLocale();
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
