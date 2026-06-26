<template>
  <el-card>
    <div slot="header">{{ title || '图表面板' }}</div>
    <div class="chart-container">
      <div class="chart-bar" v-for="m in metrics" :key="m.id">
        <div class="chart-bar-track">
          <div class="chart-bar-fill" :style="{ height: barHeight(m.value) + '%' }"></div>
        </div>
        <div class="chart-bar-label">{{ m.name }}</div>
        <div class="chart-bar-value">{{ m.value }}</div>
      </div>
    </div>
    <div v-if="metrics.length === 0" class="chart-empty">等待数据...</div>
  </el-card>
</template>

<script>
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
