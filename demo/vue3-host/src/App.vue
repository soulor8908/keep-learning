<template>
  <div class="host-app">
    <h1>Vue3 基座 —— 跨技术栈看板</h1>
    <p class="desc">
      同时加载 Vue2 物料（bi-sales-panel）和 Vue3 物料（bi-finance-panel）
    </p>
    <button class="refresh-btn" @click="refreshWidgets">刷新所有物料</button>
    <div class="dashboard">
      <div class="widget-slot">
        <h3>销售部 · Vue2 物料</h3>
        <div ref="salesPanel" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>财务部 · Vue3 物料</h3>
        <div ref="financePanel" class="widget-container"></div>
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

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { mountWidget } from '../../../wc/widget-loader';
import { on, emit } from '../../../wc/widget-bus';
import { widgets } from './widgetRegistry';

const salesPanel = ref(null);
const financePanel = ref(null);
const logs = ref([]);

// 物料配置从注册表读取，开发模式自动指向本地热构建服务

let unsubscribe = null;

onMounted(async () => {
  logs.value.push('开始加载物料...');

  unsubscribe = on('widget:loaded', payload => {
    logs.value.push(`[loaded] ${payload.widget}`);
  });

  try {
    await mountWidget(salesPanel.value, widgets[0]);
    await mountWidget(financePanel.value, widgets[1]);
    logs.value.push('物料加载完成');
  } catch (err) {
    logs.value.push(`物料加载失败: ${err.message}`);
    console.error(err);
  }
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

function refreshWidgets() {
  logs.value.push('发送 refresh-data 指令');
  emit('refresh-data', { source: 'vue3-host', timestamp: Date.now() });
}
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
