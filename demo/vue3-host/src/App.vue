<template>
  <div class="host-app">
    <div class="topbar">
      <h1>{{ t('title') }}</h1>
      <button class="lang-btn" @click="toggleLocale">{{ t('lang_switch') }}</button>
    </div>
    <p class="desc">{{ t('desc') }}</p>
    <button class="refresh-btn" @click="refreshWidgets">{{ t('refresh') }}</button>
    <div class="dashboard">
      <div class="widget-slot">
        <h3>{{ t('slot_sales') }}</h3>
        <div ref="salesPanel" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>{{ t('slot_finance') }}</h3>
        <div ref="financePanel" class="widget-container"></div>
      </div>
    </div>
    <div class="bus-log">
      <h3>{{ t('log_title') }}</h3>
      <ul>
        <li v-for="(log, idx) in logs" :key="idx">{{ log }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { mountWidget } from '../../../wc/widget-loader';
import { on, emit } from '../../../wc/widget-bus';
import { widgets } from './widgetRegistry';
import { changeLocale } from './i18n';

const { t, locale } = useI18n();
const salesPanel = ref(null);
const financePanel = ref(null);
const logs = ref([]);

// 物料配置从注册表读取，开发模式自动指向本地热构建服务

let unsubscribe = null;

onMounted(async () => {
  logs.value.push(t('log_start'));

  unsubscribe = on('widget:loaded', payload => {
    logs.value.push(`[loaded] ${payload.widget}`);
  });

  try {
    await mountWidget(salesPanel.value, widgets[0]);
    await mountWidget(financePanel.value, widgets[1]);
    logs.value.push(t('log_done'));
  } catch (err) {
    logs.value.push(t('log_fail', { msg: err.message }));
    console.error(err);
  }
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

function refreshWidgets() {
  logs.value.push(t('log_refresh'));
  emit('refresh-data', { source: 'vue3-host', timestamp: Date.now() });
}

function toggleLocale() {
  changeLocale(locale.value === 'zh' ? 'en' : 'zh');
}
</script>

<style>
.host-app {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.topbar h1 {
  margin: 0;
}
.lang-btn {
  padding: 6px 14px;
  font-size: 13px;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.lang-btn:hover {
  background: #e5e7eb;
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
