<template>
  <div class="host-app">
    <div class="topbar">
      <h1>{{ $t('title') }}</h1>
      <div class="topbar-actions">
        <button class="lang-btn" @click="toggleLocale">{{ $t('lang_switch') }}</button>
        <button class="refresh-btn" @click="refreshWidgets">{{ $t('refresh') }}</button>
      </div>
    </div>
    <p class="desc">{{ $t('desc') }}</p>

    <!-- 日志区 -->
    <div class="log-panel">
      <div class="log-header">
        <span class="log-title">事件日志（{{ logs.length }}）</span>
        <div class="log-actions">
          <button class="log-btn" @click="logs = []">清空</button>
          <button class="log-btn" @click="toggleEventTester">{{ eventTesterMounted ? '卸载事件测试器' : '重新挂载事件测试器' }}</button>
        </div>
      </div>
      <div class="log-list">
        <div v-for="(log, idx) in logs" :key="idx" class="log-item">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-type" :class="'log-type-' + log.type">{{ log.type }}</span>
          <span class="log-msg">{{ log.msg }}</span>
        </div>
      </div>
    </div>

    <!-- 看板区 -->
    <div class="dashboard">
      <div class="widget-slot">
        <h3>筛选栏 (Vue2)</h3>
        <div ref="filterBar" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>数据源面板 (Vue3)</h3>
        <div ref="dataSource" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>指标卡组 (Vue3)</h3>
        <div ref="metricCards" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>图表面板 (Vue2)</h3>
        <div ref="chartPanel" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>事件测试器 (原生)</h3>
        <div ref="eventTester" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>崩溃测试器 (Vue3)</h3>
        <div ref="crashTester" class="widget-container"></div>
      </div>
      <div class="widget-slot">
        <h3>加载失败测试 (错误边界)</h3>
        <div ref="loadFailTest" class="widget-container"></div>
      </div>
    </div>

    <!-- 交叉页面演示：三业务域物料同页（Vue2 + Vue3 + 原生 H5）-->
    <section class="cross-page">
      <h2 class="section-title">交叉页面演示</h2>
      <p class="section-desc">同一页面承载订单（A 团队 · Vue2）、支付（B 团队 · Vue3）、推荐（C 团队 · 原生 H5）三个业务域，通过 widget-bus 跨技术栈通信。</p>
      <div class="dashboard dashboard--three">
        <div class="widget-slot">
          <h3>订单区 <span class="tech-tag tech-tag--vue2">Vue2 · A 团队</span></h3>
          <div ref="ordersPanel" class="widget-container"></div>
        </div>
        <div class="widget-slot">
          <h3>支付区 <span class="tech-tag tech-tag--vue3">Vue3 · B 团队</span></h3>
          <div ref="paymentPanel" class="widget-container"></div>
        </div>
        <div class="widget-slot">
          <h3>推荐区 <span class="tech-tag tech-tag--h5">原生 H5 · C 团队</span></h3>
          <div ref="recommendPanel" class="widget-container"></div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { mountWidget, unmountWidget, onWidgetLifecycle } from '../../../wc/widget-loader';
import { createBus } from '../../../wc/widget-bus';

const bus = createBus();
const { on, emit } = bus;
import { loadWidgets } from './widgetRegistry';
import { changeLocale } from './i18n';

export default {
  name: 'App',
  data() {
    return {
      logs: [],
      widgets: [],
      eventTesterMounted: true,
      eventTesterElement: null
    };
  },
  mounted() {
    // 收集所有取消订阅函数，组件销毁时统一清理
    this.unsubs = [];

    // 监听物料生命周期事件
    this.unsubs.push(onWidgetLifecycle('loading', ({ name }) => this.addLog('lifecycle', `[loading] ${name}`)));
    this.unsubs.push(onWidgetLifecycle('loaded', ({ name }) => this.addLog('lifecycle', `[loaded] ${name}`)));
    this.unsubs.push(onWidgetLifecycle('error', ({ name, error }) => this.addLog('error', `[error] ${name}: ${(error && error.message || '').split('\n')[0]}`)));
    this.unsubs.push(onWidgetLifecycle('unmount', ({ name }) => this.addLog('lifecycle', `[unmount] ${name}`)));

    // 监听 widget-bus 事件
    this.unsubs.push(on('widget:loaded', payload => this.addLog('bus', `[widget:loaded] ${payload.widget}`)));
    this.unsubs.push(on('filter-change', payload => this.addLog('bus', `[filter-change] ${JSON.stringify(payload)}`)));
    this.unsubs.push(on('data-updated', payload => this.addLog('bus', `[data-updated] metrics count: ${payload && payload.metrics ? payload.metrics.length : 0}`)));
    this.unsubs.push(on('test-event', payload => this.addLog('bus', `[test-event] ${JSON.stringify(payload)}`)));
    // 交叉页面演示：跨技术栈业务事件
    this.unsubs.push(on('order:click', payload => this.addLog('bus', `[order:click] ${payload.name} (${payload.id}) ¥${payload.amount}`)));
    this.unsubs.push(on('payment:success', payload => this.addLog('bus', `[payment:success] ${payload.method} ¥${payload.amount.toFixed(2)}`)));
    this.unsubs.push(on('recommend:expose', payload => this.addLog('bus', `[recommend:expose] ${payload.name} (${payload.id})`)));

    // 加载物料清单（远程注册表 / 本地兜底）后挂载
    this.loadAndMount();
  },
  beforeDestroy() {
    if (this.unsubs) {
      this.unsubs.forEach(off => { try { off(); } catch (e) { /* ignore */ } });
      this.unsubs = null;
    }
  },
  methods: {
    addLog(type, msg) {
      this.logs.unshift({ time: new Date().toLocaleTimeString(), type, msg });
      if (this.logs.length > 30) this.logs.pop();
    },
    async loadAndMount() {
      try {
        this.widgets = await loadWidgets();
      } catch (err) {
        this.addLog('error', `[registry-load-fail] ${(err.message || '').split('\n')[0]}`);
        return;
      }
      // 逐个挂载物料
      this.mountAll();
      // 挂载交叉页面三物料
      this.mountCrossPage();
    },
    async mountAll() {
      const refs = ['filterBar', 'dataSource', 'metricCards', 'chartPanel', 'eventTester', 'crashTester', 'loadFailTest'];
      for (let i = 0; i < this.widgets.length && i < refs.length; i++) {
        try {
          const el = await mountWidget(this.$refs[refs[i]], this.widgets[i]);
          if (this.widgets[i].name === 'bi-event-tester') {
            this.eventTesterElement = el;
          }
        } catch (err) {
          this.addLog('error', `[mount-fail] ${this.widgets[i].name}: ${(err.message || '').split('\n')[0]}`);
        }
      }
    },
    // 交叉页面演示：按 name 查找并挂载三业务域物料
    async mountCrossPage() {
      const map = {
        'bi-orders-panel': 'ordersPanel',
        'bi-payment-panel': 'paymentPanel',
        'bi-recommend-panel': 'recommendPanel'
      };
      for (const name of Object.keys(map)) {
        const widget = this.widgets.find(w => w.name === name);
        if (!widget) continue;
        try {
          await mountWidget(this.$refs[map[name]], widget);
        } catch (err) {
          this.addLog('error', `[mount-fail] ${name}: ${(err.message || '').split('\n')[0]}`);
        }
      }
    },
    refreshWidgets() {
      this.addLog('action', '刷新所有物料');
      emit('refresh-data', { source: 'host', timestamp: Date.now() });
    },
    toggleLocale() {
      changeLocale(this.$i18n.locale === 'zh' ? 'en' : 'zh');
    },
    toggleEventTester() {
      if (this.eventTesterMounted && this.eventTesterElement) {
        unmountWidget(this.eventTesterElement);
        this.eventTesterElement = null;
        this.eventTesterMounted = false;
        this.addLog('action', '已卸载事件测试器');
      } else {
        const widget = this.widgets.find(w => w.name === 'bi-event-tester');
        if (widget) {
          mountWidget(this.$refs.eventTester, widget).then(el => {
            this.eventTesterElement = el;
            this.eventTesterMounted = true;
            this.addLog('action', '已重新挂载事件测试器');
          }).catch(err => {
            this.addLog('error', `[remount-fail] bi-event-tester: ${(err.message || '').split('\n')[0]}`);
          });
        }
      }
    }
  }
};
</script>

<style>
.host-app {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.topbar h1 {
  margin: 0;
  font-size: 22px;
}
.topbar-actions {
  display: flex;
  gap: 8px;
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
.refresh-btn {
  padding: 6px 14px;
  font-size: 13px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.refresh-btn:hover {
  background: #2563eb;
}
.desc {
  color: #6b7280;
  margin: 8px 0 16px 0;
  font-size: 13px;
}

/* 日志区 */
.log-panel {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
}
.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.log-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.log-actions {
  display: flex;
  gap: 8px;
}
.log-btn {
  padding: 3px 10px;
  font-size: 12px;
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
}
.log-btn:hover {
  background: #f3f4f6;
}
.log-list {
  max-height: 150px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.log-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 12px;
  line-height: 1.5;
}
.log-item:last-child {
  border-bottom: none;
}
.log-time {
  flex: 0 0 auto;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
.log-type {
  flex: 0 0 auto;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.log-type-lifecycle {
  background: #dbeafe;
  color: #1d4ed8;
}
.log-type-bus {
  background: #d1fae5;
  color: #047857;
}
.log-type-error {
  background: #fee2e2;
  color: #b91c1c;
}
.log-type-action {
  background: #ffedd5;
  color: #c2410c;
}
.log-msg {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #4b5563;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* 看板区 */
.dashboard {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.widget-slot {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  background: #fff;
}
.widget-slot h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 8px;
}
.widget-container {
  min-height: 200px;
}

/* 交叉页面演示 */
.dashboard--three {
  grid-template-columns: repeat(3, 1fr);
}
.cross-page {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 2px dashed #d1d5db;
}
.section-title {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: #111827;
}
.section-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: #6b7280;
}
.tech-tag {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.tech-tag--vue2 {
  background: #fef0f0;
  color: #f56c6c;
}
.tech-tag--vue3 {
  background: #ecf5ff;
  color: #409eff;
}
.tech-tag--h5 {
  background: #f0f9eb;
  color: #67c23a;
}
</style>
