<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <h1>{{ t('app.title') }} <small class="dashboard__tag">ESM + importmap</small></h1>
      <div class="dashboard__header-actions">
        <el-button @click="toggleLocale">
          {{ t('app.switch_lang') }}：{{ locale }}
        </el-button>
      </div>
    </header>

    <main class="dashboard__grid">
      <section class="dashboard__card">
        <h2>{{ t('widget.sales_panel') }}</h2>
        <WidgetHost v-bind="WIDGET_REGISTRY.biSalesPanel" :widget-props="salesProps" @widget-event="onWidgetEvent" />
      </section>

      <section class="dashboard__card">
        <h2>{{ t('widget.order_panel') }}</h2>
        <WidgetHost v-bind="WIDGET_REGISTRY.biOrderPanel" :widget-props="orderProps" @widget-event="onWidgetEvent" />
      </section>

      <section class="dashboard__card">
        <h2>{{ t('widget.finance_panel') }}</h2>
        <WidgetHost v-bind="WIDGET_REGISTRY.biFinancePanel" :widget-props="financeProps" @widget-event="onWidgetEvent" />
      </section>

      <section class="dashboard__card">
        <h2>{{ t('widget.user_panel') }}</h2>
        <WidgetHost v-bind="WIDGET_REGISTRY.biUserPanel" :widget-props="userProps" @widget-event="onWidgetEvent" />
      </section>

      <section class="dashboard__card">
        <h2>{{ t('widget.clock') }}</h2>
        <WidgetHost v-bind="WIDGET_REGISTRY.biClockWidget" :widget-props="clockProps" />
      </section>

      <section class="dashboard__card">
        <h2>{{ t('widget.chart') }}</h2>
        <WidgetHost v-bind="WIDGET_REGISTRY.biChartWidget" :widget-props="chartProps" />
      </section>
    </main>

    <aside class="dashboard__event-log" v-if="eventLog.length">
      <h3>{{ t('app.event_log') }}</h3>
      <el-timeline>
        <el-timeline-item v-for="(item, i) in eventLog" :key="i" :timestamp="item.time" placement="top" :type="item.type === 'refresh' ? 'primary' : 'success'">
          <strong>{{ item.widget }}</strong> {{ item.event }}
          <span v-if="item.payload" class="event-payload">{{ JSON.stringify(item.payload) }}</span>
        </el-timeline-item>
      </el-timeline>
      <el-button size="small" @click="eventLog = []">{{ t('app.clear') }}</el-button>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import WidgetHost from '@wc/esm-core/WidgetHost.vue';

// ─── 物料注册表（对照 UMD 版） ───
// UMD 版：{ name, js, vueVersion } —— loader 用 <script> 加载 js，从 window[name] 取模块
// ESM 版：{ name, url, css }      —— loader 用 import(url) 加载，URL 前缀（vue2/vue3/h5）决定 importmap scope
// 不再有 vueVersion / runtimeDeps：依赖隔离交给 importmap scope，按需加载交给浏览器原生 import
const WIDGET_REGISTRY = {
  biSalesPanel:   { name: 'sales-panel',   url: '/widgets/vue2/sales-panel.js',   css: '/widgets/vue2/sales-panel.css' },
  biOrderPanel:   { name: 'order-panel',    url: '/widgets/vue2/order-panel.js',    css: '/widgets/vue2/order-panel.css' },
  biFinancePanel: { name: 'finance-panel',  url: '/widgets/vue3/finance-panel.js',  css: '/widgets/vue3/finance-panel.css' },
  biUserPanel:    { name: 'user-panel',     url: '/widgets/vue3/user-panel.js',     css: '/widgets/vue3/user-panel.css' },
  biClockWidget:  { name: 'clock-widget',   url: '/widgets/h5/clock-widget.js' },
  biChartWidget:  { name: 'chart-widget',   url: '/widgets/h5/chart-widget.js' }
};

const locale = ref('zh-CN');
const eventLog = ref([]);

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN';
}

function onWidgetEvent({ widget, event, payload }) {
  eventLog.value.unshift({ widget, event, payload, time: new Date().toLocaleTimeString() });
  if (eventLog.value.length > 20) eventLog.value.pop();
}

const messages = {
  'zh-CN': {
    'app.title': 'BI 看板', 'app.switch_lang': '切换语言', 'app.event_log': '事件日志', 'app.clear': '清空',
    'widget.sales_panel': 'Vue2 销售面板', 'widget.order_panel': 'Vue2 订单面板',
    'widget.finance_panel': 'Vue3 财务面板', 'widget.user_panel': 'Vue3 用户面板',
    'widget.clock': 'H5 时钟组件', 'widget.chart': 'H5 柱状图',
    'common.sales': '销售', 'common.order': '订单', 'common.finance': '财务',
    'common.user': '用户', 'common.clock': '时钟', 'common.chart': '柱状图',
    'common.date': '日期', 'common.product': '商品', 'common.sales_vol': '销量',
    'common.revenue': '收入', 'common.refresh': '刷新数据', 'common.add': '添加记录',
    'common.new_order': '新增订单', 'common.add_user': '添加用户',
    'common.month': '月份', 'common.expense': '支出', 'common.profit': '利润',
    'common.total_profit': '总利润', 'common.export': '导出报表',
    'common.order_id': '订单号', 'common.customer': '客户', 'common.amount': '金额',
    'common.status': '状态', 'common.name': '姓名', 'common.email': '邮箱', 'common.role': '角色',
    'common.widget_name': 'Vue2 物料', 'common.widget_name2': 'Vue3 物料',
    'common.events': '事件'
  },
  'en-US': {
    'app.title': 'BI Dashboard', 'app.switch_lang': 'Switch Language', 'app.event_log': 'Event Log', 'app.clear': 'Clear',
    'widget.sales_panel': 'Vue2 Sales Panel', 'widget.order_panel': 'Vue2 Order Panel',
    'widget.finance_panel': 'Vue3 Finance Panel', 'widget.user_panel': 'Vue3 User Panel',
    'widget.clock': 'H5 Clock Widget', 'widget.chart': 'H5 Chart',
    'common.sales': 'Sales', 'common.order': 'Order', 'common.finance': 'Finance',
    'common.user': 'User', 'common.clock': 'Clock', 'common.chart': 'Chart',
    'common.date': 'Date', 'common.product': 'Product', 'common.sales_vol': 'Sales Volume',
    'common.revenue': 'Revenue', 'common.refresh': 'Refresh', 'common.add': 'Add',
    'common.new_order': 'New Order', 'common.add_user': 'Add User',
    'common.month': 'Month', 'common.expense': 'Expense', 'common.profit': 'Profit',
    'common.total_profit': 'Total Profit', 'common.export': 'Export',
    'common.order_id': 'Order ID', 'common.customer': 'Customer', 'common.amount': 'Amount',
    'common.status': 'Status', 'common.name': 'Name', 'common.email': 'Email', 'common.role': 'Role',
    'common.widget_name': 'Vue2 Widget', 'common.widget_name2': 'Vue3 Widget',
    'common.events': 'Events'
  }
};

function t(key) {
  const dict = messages[locale.value];
  return (dict && dict[key]) || key;
}

function i18nProps(title) {
  return { title, locale: locale.value, t };
}

const salesProps = computed(() => ({
  ...i18nProps('common.sales'),
  columns: [
    { prop: 'date', label: 'common.date', width: 120 },
    { prop: 'name', label: 'common.product', width: 120 },
    { prop: 'sales', label: 'common.sales_vol', width: 80 },
    { prop: 'revenue', label: 'common.revenue' }
  ]
}));

const orderProps = computed(() => ({
  ...i18nProps('common.order'),
  pageSize: 3
}));

const financeProps = computed(() => ({
  ...i18nProps('common.finance'),
  currency: '¥'
}));

const userProps = computed(() => ({
  ...i18nProps('common.user'),
  showEmail: true
}));

const clockProps = computed(() => i18nProps('common.clock'));

const chartProps = computed(() => ({
  ...i18nProps('common.chart'),
  data: [25, 60, 45, 80, 35]
}));
</script>

<style>
.dashboard { padding: 20px; }
.dashboard__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.dashboard__header h1 { margin: 0; font-size: 24px; }
.dashboard__tag { font-size: 12px; color: #3b82f6; font-weight: 400; margin-left: 8px; }
.dashboard__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
.dashboard__card { padding: 16px; border: 1px solid #e4e7ed; border-radius: 8px; background: #fff; }
.dashboard__card h2 { margin: 0 0 12px; font-size: 16px; color: #303133; }
.dashboard__event-log { margin-top: 24px; padding: 16px; border: 1px solid #e4e7ed; border-radius: 8px; background: #fafafa; }
.dashboard__event-log h3 { margin: 0 0 12px; font-size: 14px; color: #606266; }
.event-payload { display: block; margin-top: 4px; font-size: 12px; color: #909399; font-family: monospace; }
</style>
