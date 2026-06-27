/**
 * 轻量物料加载器 - 基于 ES Module import()
 *
 * 特点：
 * - 无 Custom Elements 开销
 * - 物料通过 import map 共享 Vue 运行时
 * - 支持 Vue 组件和 { mount } 对象两种格式
 * - 物料可导出 locale 对象，加载时自动注册 i18n
 */

import { h, render, ref, onMounted, onUnmounted } from 'vue';

const cache = new Map();

// ─── i18n 自动注册 ───
function registerLocale(locale) {
  if (!locale || typeof window === 'undefined') return;
  const i18n = window.__wcI18n__;
  if (!i18n || typeof i18n.addMessages !== 'function') return;
  for (const [lang, msgs] of Object.entries(locale)) {
    i18n.addMessages(lang, msgs);
  }
}

const errorComponent = {
  render: () => h('div', { class: 'widget-error' }, '物料加载失败')
};

function wrapMountable(widget) {
  return {
    setup(props) {
      const el = ref();
      onMounted(() => widget.mount(el.value, props));
      onUnmounted(() => {
        if (typeof widget.unmount === 'function') {
          widget.unmount(el.value, props);
        }
      });
      return () => h('div', { ref: el, class: 'widget-mount-wrapper' });
    }
  };
}

async function load(url, importer) {
  if (cache.has(url)) return cache.get(url);
  const mod = await importer(url);
  // 自动注册物料导出的 locale
  registerLocale(mod.locale);
  let comp = mod.default || mod;
  if (comp && typeof comp.mount === 'function') {
    comp = wrapMountable(comp);
  }
  cache.set(url, comp);
  return comp;
}

const defaultImporter = (url) => import(/* @vite-ignore */ url);

export async function mountWidget(container, url, props = {}, importer) {
  const doImport = importer || defaultImporter;
  const comp = await load(url, doImport).catch((err) => {
    console.error('[vue3-esm] load failed:', url, err);
    return errorComponent;
  });
  const vnode = h('div', { class: 'widget-mount' }, [h(comp, props)]);
  render(vnode, container);
  return () => render(null, container);
}
