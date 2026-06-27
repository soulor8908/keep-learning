/**
 * @deprecated 本模块是早期实验性方案，与主 widget-loader 体系脱节。
 * 新物料请使用主 widget-loader + vue3-widget-template 方案。
 */

import { h, render, ref, onMounted, onUnmounted } from 'vue';

const cache = new Map();

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
  let comp = mod.default || mod;
  if (comp && typeof comp.mount === 'function') {
    comp = wrapMountable(comp);
  }
  cache.set(url, comp);
  return comp;
}

const defaultImporter = (url) => import(/* @vite-ignore */ url);

let _deprecationWarned = false;

export async function mountWidget(container, url, props = {}, importer) {
  if (!_deprecationWarned) {
    _deprecationWarned = true;
    console.warn('[wc/vue3-esm] DEPRECATED: 本模块已废弃，请使用主 widget-loader + vue3-widget-template 方案');
  }
  const doImport = importer || defaultImporter;
  const comp = await load(url, doImport).catch((err) => {
    console.error('[vue3-esm] load failed:', url, err);
    return errorComponent;
  });
  const vnode = h('div', { class: 'widget-mount' }, [h(comp, props)]);
  render(vnode, container);
  return () => render(null, container);
}
