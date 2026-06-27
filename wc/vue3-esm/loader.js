/**
 * 轻量物料加载器 - 基于 ES Module import()
 *
 * 特点：
 * - 无 Custom Elements 开销
 * - 物料通过 import map 共享 Vue 运行时
 * - 支持 Vue 组件和 { mount } 对象两种格式
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
