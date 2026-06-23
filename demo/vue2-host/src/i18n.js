// vue2-host 基座 i18n（vue-i18n@8）
// 基座自身 Vue UI 文案用 vue-i18n；语言切换时同步 wc/i18n 全局 locale（aui/loader/物料共用）
import Vue from 'vue';
import VueI18n from 'vue-i18n';
import { setLocale } from '../../../wc/i18n/index.js';

Vue.use(VueI18n);

const messages = {
  zh: {
    title: 'Vue2 基座 —— 版本契约 + 错误边界 + 国际化',
    desc: '纯 Vue2 基座。Vue2 物料正常加载；Vue3 物料被版本契约明确拒绝（确定性错误，无重试）；崩溃物料被错误边界降级隔离，占位提供"点击重试"。切换语言后，基座 UI、物料业务文案、加载器错误提示同步切换。',
    refresh: '刷新所有物料',
    slot_sales: '销售部 · Vue2 物料',
    slot_finance: '财务部 · Vue3 物料（版本契约拒绝加载演示）',
    slot_broken: '风控部 · 崩溃物料（错误边界降级演示）',
    log_title: '消息总线日志',
    log_start: '开始加载物料...',
    log_ok: '[ok] {name} 加载成功',
    log_rejected: '[rejected] {name}：{code} - {msg}',
    log_end: '物料加载流程结束（崩溃物料的运行时降级由错误边界异步触发）',
    log_refresh: '发送 refresh-data 指令',
    lang_switch: 'English'
  },
  en: {
    title: 'Vue2 Host — Version Contract + Error Boundary + i18n',
    desc: 'Pure Vue2 host. Vue2 widget loads normally; Vue3 widget is rejected by version contract (deterministic, no retry); crashing widget is isolated by error boundary with a "Retry" button. Switching language updates host UI, widget business copy and loader messages together.',
    refresh: 'Refresh all widgets',
    slot_sales: 'Sales · Vue2 widget',
    slot_finance: 'Finance · Vue3 widget (version contract rejection demo)',
    slot_broken: 'Risk · Crashing widget (error boundary demo)',
    log_title: 'Bus log',
    log_start: 'Loading widgets...',
    log_ok: '[ok] {name} loaded',
    log_rejected: '[rejected] {name}: {code} - {msg}',
    log_end: 'Loading finished (crashing widget degraded asynchronously by error boundary)',
    log_refresh: 'Sent refresh-data',
    lang_switch: '中文'
  }
};

const i18n = new VueI18n({
  locale: 'zh',
  fallbackLocale: 'zh',
  messages
});

/**
 * 切换语言：同步更新 vue-i18n 与 wc/i18n 全局 locale
 * @param {'zh'|'en'} locale
 */
export function changeLocale(locale) {
  i18n.locale = locale;
  setLocale(locale); // 同步 aui / widget-loader / 物料
}

export default i18n;
