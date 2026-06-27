import { createI18n } from 'vue-i18n';

const messages = {
  zh: {
    title: 'Vue3 ESM 基座',
    hello: '你好，Vue3 ESM',
    lang: '中文',
    log_panel_title: '事件日志（{count}）',
    clear: '清空',
    slot_vue3_widget: 'Vue3 物料',
    slot_h5_widget: 'H5 物料'
  },
  en: {
    title: 'Vue3 ESM Host',
    hello: 'Hello Vue3 ESM',
    lang: 'English',
    log_panel_title: 'Event Log ({count})',
    clear: 'Clear',
    slot_vue3_widget: 'Vue3 Widget',
    slot_h5_widget: 'H5 Widget'
  }
};

export default createI18n({
  legacy: false,
  locale: 'zh',
  messages
});
