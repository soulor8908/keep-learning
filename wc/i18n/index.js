/**
 * wc/i18n —— 跨技术栈轻量国际化运行时
 *
 * 为什么不用 vue-i18n 贯穿所有层？
 *   vue-i18n@8 与 @9 的 UMD 全局名都是 VueI18n，跨技术栈物料共存时无法同时 external。
 *   因此基座 Vue UI 层用 vue-i18n（各版本），而 aui（Web Components）、widget-loader（纯 JS）、
 *   物料业务文案统一用本运行时，避免 UMD 冲突，并作为全链路 locale 同步枢纽。
 *
 * 设计：
 *   - locale 状态 + 字典 + t(key) 翻译
 *   - setLocale(lang) 切换并派发 'locale-change' 事件（复用 widget-bus）
 *   - onLocaleChange(cb) 订阅切换，物料据此重渲染
 *   - 挂载到 window.__wcI18n__，物料构建时 external 'wc-i18n' 引用
 */
import zh from './locales/zh.js';
import en from './locales/en.js';

const messages = { zh, en };
const listeners = new Set();
let currentLocale = 'zh';

/**
 * 翻译函数
 * @param {string} key 形如 'loader.version_mismatch' 的点分键
 * @param {Object} [params] 插值参数，替换 {name} 等
 * @returns {string}
 */
function t(key, params) {
  const dict = messages[currentLocale] || messages.zh;
  const parts = String(key).split('.');
  let val = dict;
  for (const p of parts) {
    if (val && typeof val === 'object' && p in val) {
      val = val[p];
    } else {
      val = undefined;
      break;
    }
  }
  let str = typeof val === 'string' ? val : key; // 缺失键回退到 key 本身
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : `{${k}}`));
  }
  return str;
}

/**
 * 获取当前语言
 * @returns {'zh'|'en'}
 */
function getLocale() {
  return currentLocale;
}

/**
 * 切换语言：更新状态 + 通知所有订阅者 + 通过 widget-bus 广播
 * @param {'zh'|'en'} locale
 */
function setLocale(locale) {
  if (!messages[locale] || locale === currentLocale) return;
  currentLocale = locale;
  for (const cb of listeners) {
    try { cb(locale); } catch (e) { console.error('[wc/i18n] locale change listener error:', e); }
  }
  // 通过 widget-bus 广播，物料可监听 'locale-change' 重渲染
  if (typeof window !== 'undefined' && window.widgetBus) {
    window.widgetBus.emit('locale-change', { locale });
  }
}

/**
 * 订阅语言切换
 * @param {Function} cb (locale) => void
 * @returns {Function} 取消订阅
 */
function onLocaleChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const i18n = { t, getLocale, setLocale, onLocaleChange };

// 挂载到全局，供物料 external 引用
if (typeof window !== 'undefined') {
  window.__wcI18n__ = i18n;
}

export { t, getLocale, setLocale, onLocaleChange };
export default i18n;
