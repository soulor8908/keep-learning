import { createI18n } from 'vue-i18n';

const messages = {
  zh: { hello: '你好，Vue3 ESM', lang: '中文' },
  en: { hello: 'Hello Vue3 ESM', lang: 'English' }
};

export default createI18n({
  legacy: false,
  locale: 'zh',
  messages
});
