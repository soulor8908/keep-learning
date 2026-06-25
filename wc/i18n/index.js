/**
 * wc/i18n —— 跨技术栈轻量国际化运行时
 *
 * 为什么不用 vue-i18n 贯穿所有层？
 *   vue-i18n@8 与 @9 的 UMD 全局名都是 VueI18n，跨技术栈物料共存时无法同时 external。
 *   因此基座 Vue UI 层用 vue-i18n（各版本），而 widget-loader（纯 JS）、
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
 * 解析 locale 的回退链
 * 例如 'zh-CN' -> ['zh-CN', 'zh', 'en']，'zh-TW' -> ['zh-TW', 'zh', 'en']
 * 'en-GB' -> ['en-GB', 'en']，'fr' -> ['fr', 'en']
 * @param {string} locale
 * @returns {string[]} 按优先级排列的 locale 列表
 */
function getLocaleFallbackChain(locale) {
  const chain = [locale];
  // 提取基础语言（如 zh-CN -> zh）
  const base = String(locale).split('-')[0];
  if (base !== locale) chain.push(base);
  // 最终回退到 en（若尚未包含）
  if (!chain.includes('en')) chain.push('en');
  // 最终回退到 zh（若 en 也没有，作为最后保障）
  if (!chain.includes('zh')) chain.push('zh');
  return chain;
}

/**
 * 在指定 locale 字典中查找点分键
 * @param {string} locale
 * @param {string} key
 * @returns {string|undefined}
 */
function lookupInLocale(locale, key) {
  const dict = messages[locale];
  if (!dict) return undefined;
  const parts = String(key).split('.');
  let val = dict;
  for (const p of parts) {
    if (val && typeof val === 'object' && p in val) {
      val = val[p];
    } else {
      return undefined;
    }
  }
  return typeof val === 'string' ? val : undefined;
}

/**
 * 翻译函数
 * @param {string} key 形如 'loader.version_mismatch' 的点分键
 * @param {Object} [params] 插值参数，替换 {name} 等
 * @returns {string}
 */
function t(key, params) {
  // 按 locale 回退链查找：currentLocale -> 基础语言 -> en -> zh
  const chain = getLocaleFallbackChain(currentLocale);
  let str;
  for (const locale of chain) {
    str = lookupInLocale(locale, key);
    if (str !== undefined) break;
  }
  if (str === undefined) str = key; // 缺失键回退到 key 本身
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
 * @param {string} locale - 目标语言，可为未注册的 locale（如 zh-CN、en-GB），
 *   t() 会按回退链查找；若回退链中无任何已知 locale 则忽略本次切换
 * @param {boolean} [force=false] - 是否强制重新广播。
 *   默认 false：locale 与当前相同时跳过，避免重复通知。
 *   true：即使 locale 未变也重新派发事件，用于热更新语言包后强制刷新物料文案。
 */
function setLocale(locale, force = false) {
  // 允许设置未在 messages 中注册的 locale（如 zh-CN、zh-TW、en-GB），
  // t() 会按回退链查找；但若回退链中无任何已知 locale 则忽略
  const chain = getLocaleFallbackChain(locale);
  const hasKnown = chain.some(l => messages[l]);
  if (!hasKnown) return;
  // 相同 locale 默认跳过；force=true 时强制重新广播（用于热更新语言包后刷新物料）
  if (!force && locale === currentLocale) return;
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

/**
 * 深合并两个对象：递归合并嵌套对象，非对象值直接覆盖
 * @param {Object} target 目标对象（会被修改）
 * @param {Object} source 源对象
 * @returns {Object} 合并后的 target
 */
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  Object.keys(source).forEach(key => {
    const tVal = target[key];
    const sVal = source[key];
    if (tVal && typeof tVal === 'object' && !Array.isArray(tVal)
        && sVal && typeof sVal === 'object' && !Array.isArray(sVal)) {
      // 两边都是普通对象，递归合并
      target[key] = deepMerge({ ...tVal }, sVal);
    } else {
      // 非对象或数组，直接覆盖
      target[key] = sVal;
    }
  });
  return target;
}

/**
 * 运行时追加语言包（部门/物料可注入自己的文案）
 * @param {string} locale 目标语言，如 'zh' / 'en'
 * @param {Object} msgs 待合并的字典，会深合并到现有字典
 */
function addMessages(locale, msgs) {
  if (!messages[locale]) messages[locale] = {};
  // 深合并：递归合并嵌套对象，避免部门注入文案时意外覆盖基座已有的其他 key
  // 例如 msgs.loader.dep_missing 不会覆盖基座的 loader.dep_version
  deepMerge(messages[locale], msgs);
}

const i18n = { t, getLocale, setLocale, onLocaleChange, addMessages };

// 挂载到全局，供物料 external 引用
if (typeof window !== 'undefined') {
  window.__wcI18n__ = i18n;
}

export { t, getLocale, setLocale, onLocaleChange, addMessages };
export default i18n;
