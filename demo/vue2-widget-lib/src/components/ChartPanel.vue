<template>
  <el-card>
    <div slot="header">{{ title || t('chart.title') }}</div>
    <div class="chart-container">
      <div class="chart-bar" v-for="m in metrics" :key="m.id">
        <div class="chart-bar-track">
          <div class="chart-bar-fill" :style="{ height: barHeight(m.value) + '%' }"></div>
        </div>
        <div class="chart-bar-label">{{ m.name }}</div>
        <div class="chart-bar-value">{{ m.value }}</div>
      </div>
    </div>
    <div v-if="metrics.length === 0" class="chart-empty">{{ t('chart.empty') }}</div>
  </el-card>
</template>

<script>
import { t, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key。
// 语言切换的响应式由 wrapper 基础设施层统一处理（对物料实例 $forceUpdate），
// 组件只需在模板/方法里直接调用 t()，无需自建 localeTick / onLocaleChange。
addMessages('zh', { chart: { title: '图表面板', empty: '等待数据...' } });
addMessages('en', { chart: { title: 'Chart Panel', empty: 'Waiting for data...' } });

export default {
  name: 'ChartPanel',
  props: {
    // 扁平化 props：宿主按 kebab-case attribute 逐项传入，包装层按声明类型解析
    title: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      metrics: [],
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
    if (window.widgetBus) {
      // 监听数据更新
      this._offBus = window.widgetBus.on('data-updated', (payload) => {
        if (payload && payload.metrics) {
          this.metrics = payload.metrics;
        }
      });
      // 通知基座：物料已加载
      window.widgetBus.emit('widget:loaded', { widget: 'bi-chart-panel' });
    }
  },
  beforeDestroy() {
    if (this._offBus) this._offBus();
  },
  methods: {
    barHeight(value) {
      const max = Math.max(...this.metrics.map(m => m.value), 1);
      return Math.min(100, (value / max) * 100);
    }
  }
};
</script>

<style scoped>
.chart-container {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  min-height: 200px;
  padding: 12px 0;
}
.chart-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.chart-bar-track {
  width: 100%;
  height: 160px;
  display: flex;
  align-items: flex-end;
  background: #f3f4f6;
  border-radius: 4px 4px 0 0;
  overflow: hidden;
}
.chart-bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #409eff 0%, #66b1ff 100%);
  transition: height 0.3s ease;
  border-radius: 4px 4px 0 0;
}
.chart-bar-label {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
  word-break: break-all;
}
.chart-bar-value {
  font-size: 12px;
  color: #111827;
  font-weight: 500;
}
.chart-empty {
  color: #999;
  text-align: center;
  padding: 20px;
}
</style>
