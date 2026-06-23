<template>
  <div class="host-app">
    <h1>Vue2 基座 —— 版本契约 + 错误边界</h1>
    <p class="desc">
      纯 Vue2 基座。Vue2 物料正常加载；Vue3 物料被版本契约明确拒绝；崩溃物料被错误边界降级隔离。任一物料单点失败都不影响其它物料，看板不白屏。
    </p>
    <button class="refresh-btn" @click="refreshWidgets">刷新所有物料</button>
    <div class="dashboard">
      <div class="widget-slot">
        <h3>销售部 · Vue2 物料</h3>
        <div ref="salesPanel" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>财务部 · Vue3 物料（版本契约拒绝加载演示）</h3>
        <div ref="financePanel" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>风控部 · 崩溃物料（错误边界降级演示）</h3>
        <div ref="brokenPanel" class="widget-container"></div>
      </div>
    </div>
    <div class="bus-log">
      <h3>消息总线日志</h3>
      <ul>
        <li v-for="(log, idx) in logs" :key="idx">{{ log }}</li>
      </ul>
    </div>
  </div>
</template>

<script>
import { mountWidget } from '../../../wc/widget-loader';
import { on, emit } from '../../../wc/widget-bus';
import { widgets } from './widgetRegistry';

export default {
  name: 'App',
  data() {
    return {
      logs: [],
      widgets
    };
  },
  async mounted() {
    this.logs.push('开始加载物料...');

    // 监听物料加载完成事件
    this.unsubscribe = on('widget:loaded', payload => {
      this.logs.push(`[loaded] ${payload.widget}`);
    });

    // 逐个加载：单个物料失败不影响其它物料，便于展示版本契约的"精确拒绝"
    const mountOne = async (refName, widget) => {
      try {
        await mountWidget(this.$refs[refName], widget);
        this.logs.push(`[ok] ${widget.name} 加载成功`);
      } catch (err) {
        // 版本契约错误已在控制台与占位节点中展示，这里只记一条摘要
        this.logs.push(`[rejected] ${widget.name}：${err.code || 'LOAD_ERROR'} - ${err.message.split('\n')[0]}`);
        console.error(`[${widget.name}]`, err);
      }
    };

    await mountOne('salesPanel', this.widgets[0]);
    await mountOne('financePanel', this.widgets[1]);
    await mountOne('brokenPanel', this.widgets[2]);
    this.logs.push('物料加载流程结束（崩溃物料的运行时降级由错误边界异步触发）');
  },
  beforeDestroy() {
    if (this.unsubscribe) this.unsubscribe();
  },
  methods: {
    refreshWidgets() {
      this.logs.push('发送 refresh-data 指令');
      emit('refresh-data', { source: 'vue2-host', timestamp: Date.now() });
    }
  }
};
</script>

<style>
.host-app {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.desc {
  color: #6b7280;
  margin-bottom: 16px;
}
.refresh-btn {
  margin-bottom: 16px;
  padding: 8px 16px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.refresh-btn:hover {
  background: #2563eb;
}
.dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.widget-slot h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #374151;
}
.widget-container {
  min-height: 200px;
}
.widget-error-placeholder {
  padding: 12px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-left: 4px solid #ef4444;
  border-radius: 6px;
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.bus-log {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}
.bus-log h3 {
  margin: 0 0 8px 0;
}
.bus-log ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #4b5563;
}
.bus-log li {
  margin-bottom: 4px;
}
</style>
