<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <h1>{{ t('BI 看板') }}</h1>
      <div class="dashboard__header-actions">
        <el-button @click="toggleLocale">
          {{ t('切换语言') }}：{{ locale }}
        </el-button>
      </div>
    </header>

    <main class="dashboard__grid">
      <section class="dashboard__card">
        <h2>{{ t('Vue2 销售面板') }}</h2>
        <WidgetHost
          v-bind="WIDGET_REGISTRY.biSalesPanel"
          :widget-props="salesProps"
          :locale="locale"
          :messages="messages"
          @widget-event="onWidgetEvent"
        />
      </section>

      <section class="dashboard__card">
        <h2>{{ t('Vue3 财务面板') }}</h2>
        <WidgetHost
          v-bind="WIDGET_REGISTRY.biFinancePanel"
          :widget-props="financeProps"
          :locale="locale"
          :messages="messages"
          @widget-event="onWidgetEvent"
        />
      </section>

      <section class="dashboard__card">
        <h2>{{ t('H5 时钟组件') }}</h2>
        <WidgetHost
          v-bind="WIDGET_REGISTRY.biClockWidget"
          :widget-props="clockProps"
          :locale="locale"
          :messages="messages"
        />
      </section>
    </main>

    <aside class="dashboard__event-log" v-if="eventLog.length">
      <h3>{{ t('事件日志') }}</h3>
      <el-timeline>
        <el-timeline-item
          v-for="(item, i) in eventLog"
          :key="i"
          :timestamp="item.time"
          placement="top"
          :type="item.type === 'refresh' ? 'primary' : 'success'"
        >
          <strong>{{ item.widget }}</strong> {{ item.event }}
          <span v-if="item.payload" class="event-payload">
            {{ JSON.stringify(item.payload) }}
          </span>
        </el-timeline-item>
      </el-timeline>
      <el-button size="small" @click="eventLog = []">
        {{ t('清空') }}
      </el-button>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import WidgetHost from '@wc/core/WidgetHost.vue';

const WIDGET_REGISTRY = {
  biSalesPanel: {
    name: 'biSalesPanel',
    js: '/widgets/vue2-sales-panel.js',
    css: '/widgets/vue2-sales-panel.css',
    vueVersion: '2'
  },
  biFinancePanel: {
    name: 'biFinancePanel',
    js: '/widgets/vue3-finance-panel.js',
    vueVersion: '3'
  },
  biClockWidget: {
    name: 'biClockWidget',
    js: '/widgets/h5-clock-widget.js',
    vueVersion: 'none'
  }
};

const locale = ref('zh-CN');
const eventLog = ref([]);

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN';
}

function onWidgetEvent({ widget, event, payload }) {
  eventLog.value.unshift({
    widget,
    event,
    payload,
    time: new Date().toLocaleTimeString()
  });
  if (eventLog.value.length > 20) {
    eventLog.value.pop();
  }
}

const messages = {
  'zh-CN': {
    'BI 看板': 'BI 看板',
    '切换语言': '切换语言',
    'Vue2 销售面板': 'Vue2 销售面板',
    'Vue3 财务面板': 'Vue3 财务面板',
    'H5 时钟组件': 'H5 时钟组件',
    '事件日志': '事件日志',
    '清空': '清空',
    '销售': '销售',
    'Vue2 物料': 'Vue2 物料',
    '财务': '财务',
    'Vue3 物料': 'Vue3 物料',
    '时钟': '时钟',
    '日期': '日期',
    '商品': '商品',
    '销量': '销量',
    '收入': '收入',
    '刷新数据': '刷新数据',
    '添加记录': '添加记录',
    '月份': '月份',
    '支出': '支出',
    '利润': '利润',
    '总利润': '总利润',
    '导出报表': '导出报表'
  },
  'en-US': {
    'BI 看板': 'BI Dashboard',
    '切换语言': 'Switch Language',
    'Vue2 销售面板': 'Vue2 Sales Panel',
    'Vue3 财务面板': 'Vue3 Finance Panel',
    'H5 时钟组件': 'H5 Clock Widget',
    '事件日志': 'Event Log',
    '清空': 'Clear',
    '销售': 'Sales',
    'Vue2 物料': 'Vue2 Widget',
    '财务': 'Finance',
    'Vue3 物料': 'Vue3 Widget',
    '时钟': 'Clock',
    '日期': 'Date',
    '商品': 'Product',
    '销量': 'Sales',
    '收入': 'Revenue',
    '刷新数据': 'Refresh',
    '添加记录': 'Add Record',
    '月份': 'Month',
    '支出': 'Expense',
    '利润': 'Profit',
    '总利润': 'Total Profit',
    '导出报表': 'Export'
  }
};

function t(key) {
  const dict = messages[locale.value];
  return (dict && dict[key]) || key;
}

const salesProps = computed(() => ({
  title: '销售'
}));

const financeProps = computed(() => ({
  title: '财务'
}));

const clockProps = computed(() => ({
  title: '时钟'
}));
</script>

<style>
.dashboard {
  padding: 20px;
}

.dashboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.dashboard__header h1 {
  margin: 0;
  font-size: 24px;
}

.dashboard__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 20px;
}

.dashboard__card {
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
}

.dashboard__card h2 {
  margin: 0 0 12px;
  font-size: 16px;
  color: #303133;
}

.dashboard__event-log {
  margin-top: 24px;
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fafafa;
}

.dashboard__event-log h3 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #606266;
}

.event-payload {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}
</style>
