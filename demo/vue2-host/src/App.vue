<template>
  <div class="host-app">
    <div class="topbar">
      <h1>{{ $t('title') }}</h1>
      <button class="lang-btn" @click="toggleLocale">{{ $t('lang_switch') }}</button>
    </div>
    <p class="desc">{{ $t('desc') }}</p>
    <button class="refresh-btn" @click="refreshWidgets">{{ $t('refresh') }}</button>
    <div class="dashboard">
      <div class="widget-slot">
        <h3>{{ $t('slot_sales') }}</h3>
        <div ref="salesPanel" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>{{ $t('slot_finance') }}</h3>
        <div ref="financePanel" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>{{ $t('slot_broken') }}</h3>
        <div ref="brokenPanel" class="widget-container"></div>
      </div>
    </div>
    <div class="bus-log">
      <h3>{{ $t('log_title') }}</h3>
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
import { changeLocale } from './i18n';

export default {
  name: 'App',
  data() {
    return {
      logs: [],
      widgets
    };
  },
  async mounted() {
    this.logs.push(this.$t('log_start'));

    // 监听物料加载完成事件
    this.unsubscribe = on('widget:loaded', payload => {
      this.logs.push(`[loaded] ${payload.widget}`);
    });

    // 逐个加载：单个物料失败不影响其它物料，便于展示版本契约的"精确拒绝"
    const mountOne = async (refName, widget) => {
      try {
        await mountWidget(this.$refs[refName], widget);
        this.logs.push(this.$t('log_ok', { name: widget.name }));
      } catch (err) {
        // 版本契约错误已在控制台与占位节点中展示，这里只记一条摘要
        this.logs.push(this.$t('log_rejected', { name: widget.name, code: err.code || 'LOAD_ERROR', msg: err.message.split('\n')[0] }));
        console.error(`[${widget.name}]`, err);
      }
    };

    await mountOne('salesPanel', this.widgets[0]);
    await mountOne('financePanel', this.widgets[1]);
    await mountOne('brokenPanel', this.widgets[2]);
    this.logs.push(this.$t('log_end'));
  },
  beforeDestroy() {
    if (this.unsubscribe) this.unsubscribe();
  },
  methods: {
    refreshWidgets() {
      this.logs.push(this.$t('log_refresh'));
      emit('refresh-data', { source: 'vue2-host', timestamp: Date.now() });
    },
    toggleLocale() {
      changeLocale(this.$i18n.locale === 'zh' ? 'en' : 'zh');
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
  display: flex;
  flex-direction: column;
  align-items: flex-start;
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
