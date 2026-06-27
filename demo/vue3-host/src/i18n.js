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
    lang_switch: 'English'
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
  setLocale(locale); // 同步 widget-loader / 物料
}

export default i18n;
