<template>
  <div class="host-app">
    <div class="topbar">
      <h1>Vue3 ESM Host</h1>
      <button class="lang-btn" @click="toggleLocale">
        {{ t('lang') }} → {{ locale === 'zh' ? 'en' : 'zh' }}
      </button>
    </div>

    <div class="logs">
      <h3>事件日志（{{ logs.length }}）</h3>
      <button @click="logs = []">清空</button>
      <ul>
        <li v-for="(log, idx) in logs" :key="idx">{{ log }}</li>
      </ul>
    </div>

    <div class="dashboard">
      <div class="widget-slot">
        <h3>Vue3 物料</h3>
        <WidgetHost url="/widgets/vue-widget.js" :widgetProps="widgetProps" />
      </div>
      <div class="widget-slot">
        <h3>H5 物料</h3>
        <WidgetHost url="/widgets/h5-widget.js" :widgetProps="widgetProps" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import mitt from 'mitt';
import WidgetHost from 'wc/vue3-esm/WidgetHost.js';

const bus = mitt();
const { t, locale } = useI18n();
const logs = ref([]);

const widgetProps = computed(() => ({
  title: t('hello'),
  bus
}));

function toggleLocale() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh';
}

let unsubscribe;
onMounted(() => {
  unsubscribe = bus.on('widget:hello', (payload) => {
    logs.value.unshift(`[widget:hello] ${JSON.stringify(payload)}`);
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});
</script>

<style>
.host-app {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.lang-btn {
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  background: #f3f4f6;
  border-radius: 6px;
  cursor: pointer;
}
.logs {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.logs ul {
  max-height: 120px;
  overflow-y: auto;
  margin: 8px 0 0;
  padding-left: 16px;
  font-size: 13px;
  color: #374151;
}
.dashboard {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.widget-slot {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
}
.widget-slot h3 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #374151;
}
</style>
