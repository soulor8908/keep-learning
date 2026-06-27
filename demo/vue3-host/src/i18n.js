// vue3-host 基座 i18n（vue-i18n@9）
// 基座自身 Vue UI 文案用 vue-i18n；语言切换时同步 wc/i18n 全局 locale（loader/物料共用）
import { createI18n } from 'vue-i18n';
import { setLocale } from '@wc/i18n';

const messages = {
  zh: {
    title: 'BI 看板 · 框架能力验证',
    desc: '此看板验证 wc 框架的 10 项关键技术能力',
    refresh: '刷新数据',
    slot_sales: '销售部 · Vue2 物料',
    slot_finance: '财务部 · Vue3 物料',
    log_title: '消息总线日志',
    log_start: '开始加载物料...',
    log_done: '物料加载完成',
    log_fail: '物料加载失败: {msg}',
    log_refresh: '发送 refresh-data 指令',
    lang_switch: 'English',
    // App.vue 新增
    log_panel_title: '事件日志（{count}）',
    clear: '清空',
    unmount_event_tester: '卸载事件测试器',
    remount_event_tester: '重新挂载事件测试器',
    slot_filter: '筛选栏 (Vue2)',
    slot_data_source: '数据源面板 (Vue3)',
    slot_metric_cards: '指标卡组 (Vue3)',
    slot_chart: '图表面板 (Vue3)',
    slot_event_tester: '事件测试器 (原生)',
    slot_crash_tester: '崩溃测试器 (Vue3)',
    slot_load_fail: '加载失败测试 (错误边界)',
    cross_page_title: '交叉页面演示',
    cross_page_desc: '同一页面承载订单（A 团队 · Vue2）、支付（B 团队 · Vue3）、推荐（C 团队 · 原生 H5）三个业务域，通过 widget-bus 跨技术栈通信。',
    slot_orders: '订单区',
    slot_payment: '支付区',
    slot_recommend: '推荐区',
    team_vue2: 'Vue2 · A 团队',
    team_vue3: 'Vue3 · B 团队',
    team_h5: '原生 H5 · C 团队',
    action_refresh_all: '刷新所有物料',
    action_unmount_event: '已卸载事件测试器',
    action_remount_event: '已重新挂载事件测试器'
  },
  en: {
    title: 'BI Dashboard · Framework Capability Verification',
    desc: 'This dashboard verifies 10 key technical capabilities of the wc framework',
    refresh: 'Refresh',
    slot_sales: 'Sales · Vue2 widget',
    slot_finance: 'Finance · Vue3 widget',
    log_title: 'Bus log',
    log_start: 'Loading widgets...',
    log_done: 'Widgets loaded',
    log_fail: 'Widget load failed: {msg}',
    log_refresh: 'Sent refresh-data',
    lang_switch: '中文',
    // App.vue 新增
    log_panel_title: 'Event Log ({count})',
    clear: 'Clear',
    unmount_event_tester: 'Unmount Event Tester',
    remount_event_tester: 'Remount Event Tester',
    slot_filter: 'Filter Bar (Vue2)',
    slot_data_source: 'Data Source (Vue3)',
    slot_metric_cards: 'Metric Cards (Vue3)',
    slot_chart: 'Chart Panel (Vue3)',
    slot_event_tester: 'Event Tester (Native)',
    slot_crash_tester: 'Crash Tester (Vue3)',
    slot_load_fail: 'Load Failure Test (Error Boundary)',
    cross_page_title: 'Cross-Page Demo',
    cross_page_desc: 'This page hosts three business domains: Orders (Team A · Vue2), Payment (Team B · Vue3), and Recommendations (Team C · Native H5), communicating across tech stacks via widget-bus.',
    slot_orders: 'Orders',
    slot_payment: 'Payment',
    slot_recommend: 'Recommendations',
    team_vue2: 'Vue2 · Team A',
    team_vue3: 'Vue3 · Team B',
    team_h5: 'Native H5 · Team C',
    action_refresh_all: 'Refresh all widgets',
    action_unmount_event: 'Event tester unmounted',
    action_remount_event: 'Event tester remounted'
  }
};

const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  messages
});

/**
 * 切换语言：同步更新 vue-i18n 与 wc/i18n 全局 locale
 * @param {'zh'|'en'} locale
 */
export function changeLocale(locale) {
  i18n.global.locale.value = locale;
  setLocale(locale); // 同步 widget-loader / 物料
}

export default i18n;
