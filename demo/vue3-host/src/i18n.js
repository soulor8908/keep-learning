// vue3-host 基座 i18n（vue-i18n@9）
// 基座自身 Vue UI 文案用 vue-i18n；语言切换时同步 wc/i18n 全局 locale（aui/loader/物料共用）
import { createI18n } from 'vue-i18n';
import { setLocale } from '../../../wc/i18n/index.js';

const messages = {
  zh: {
    title: 'Vue3 基座 —— 跨技术栈看板 + 国际化',
    desc: '同时加载 Vue2 物料（bi-sales-panel）和 Vue3 物料（bi-finance-panel）。切换语言后，基座 UI、物料业务文案、加载器错误提示同步切换。',
    refresh: '刷新所有物料',
    slot_sales: '销售部 · Vue2 物料',
    slot_finance: '财务部 · Vue3 物料',
    log_title: '消息总线日志',
    log_start: '开始加载物料...',
    log_done: '物料加载完成',
    log_fail: '物料加载失败: {msg}',
    log_refresh: '发送 refresh-data 指令',
    lang_switch: 'English'
  },
  en: {
    title: 'Vue3 Host — Cross-stack Dashboard + i18n',
    desc: 'Loads both Vue2 widget (bi-sales-panel) and Vue3 widget (bi-finance-panel). Switching language updates host UI, widget business copy and loader messages together.',
    refresh: 'Refresh all widgets',
    slot_sales: 'Sales · Vue2 widget',
    slot_finance: 'Finance · Vue3 widget',
    log_title: 'Bus log',
    log_start: 'Loading widgets...',
    log_done: 'Widgets loaded',
    log_fail: 'Widget load failed: {msg}',
    log_refresh: 'Sent refresh-data',
    lang_switch: '中文'
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
  setLocale(locale); // 同步 aui / widget-loader / 物料
}

export default i18n;
