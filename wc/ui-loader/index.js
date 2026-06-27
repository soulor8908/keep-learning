/**
 * UI 组件库按需加载器（从 widget-loader 拆出）
 *
 * 负责加载 ElementUI / ElementPlus 的 JS/CSS 资源并注册到对应 Vue 运行时。
 * 此前混在 widget-loader 中增加核心模块体积，2C 场景对体积敏感，独立为可选模块。
 *
 * 用法：
 *   import { preloadUiDependencies } from 'wc/ui-loader';
 *   const { loaded, failed } = await preloadUiDependencies(widgets, { cdnBase: '/cdn' });
 */

import { createWidgetLoader, WidgetError } from '../widget-loader/index.js';

// IIFE bundle 全局挂载约定
const UI_GLOBAL_VARS = {
  'element-ui': '__UI_ELEMENT_UI__',
  'element-plus': '__UI_ELEMENT_PLUS__'
};

const LIB_VUE_MAP = {
  'element-ui': '2',
  'element-plus': '3'
};

const UI_VERSION_DEFAULTS = {
  'element-ui': '2.15.14',
  'element-plus': '2.7.6'
};

function createUiError(message, code) {
  const err = new Error(`[ui-loader] ${message}`);
  err.code = code;
  return err;
}

export function defaultResolveUiResource(cdnBase, lib, version, component, type) {
  const ext = type === 'css' ? 'css' : 'js';
  const base = cdnBase.replace(/\/$/, '');
  return `${base}/ui/${lib}@${version}/${component}.${ext}`;
}

export function defaultResolveFullResource(cdnBase, lib, version, type) {
  const ext = type === 'css' ? 'css' : 'js';
  const base = cdnBase.replace(/\/$/, '');
  return `${base}/ui/${lib}@${version}/full.${ext}`;
}

function registerUiComponent(lib, componentName, VueRuntime) {
  if (!VueRuntime || typeof VueRuntime.component !== 'function') return;
  const globalVar = UI_GLOBAL_VARS[lib];
  const registry = (typeof window !== 'undefined' && window[globalVar]) || {};
  const comp = registry[componentName];
  if (!comp) return;
  VueRuntime.component(`el-${componentName}`, comp);
}

function stripRange(version) {
  if (!version) return version;
  return String(version).replace(/^[\^~>=<]*\s*/, '').trim();
}

function loadUiResource(url, loader) {
  const ext = url.endsWith('.css') ? 'css' : 'js';
  return ext === 'css' ? loader.loadStyle(url) : loader.loadScript(url);
}

async function loadUiResourceWithRetry(url, loader, maxRetry) {
  try {
    return await loadUiResource(url, loader);
  } catch (firstErr) {
    if (maxRetry <= 0) throw firstErr;
    return loadUiResource(url, loader);
  }
}

/**
 * 预加载一批物料的 UI 组件依赖
 */
export async function preloadUiDependencies(widgets, options = {}) {
  const {
    cdnBase,
    resolveUiResource = defaultResolveUiResource,
    resolveFullResource = defaultResolveFullResource,
    Vue2Runtime = (typeof window !== 'undefined' ? window.Vue2 : undefined),
    Vue3Runtime = (typeof window !== 'undefined' ? window.Vue3 : undefined)
  } = options;

  if (!cdnBase) throw new Error('[ui-loader] preloadUiDependencies: options.cdnBase is required');

  const runtimeByLib = {
    'element-ui': Vue2Runtime,
    'element-plus': Vue3Runtime
  };

  const groups = {};
  for (const widget of widgets || []) {
    const ui = widget && widget.schema && widget.schema.uiDependencies;
    if (!ui) continue;
    const lib = ui.lib;
    if (!LIB_VUE_MAP[lib]) {
      throw createUiError(`物料 ${widget.name} 的 uiDependencies.lib 未知: ${lib}`, WidgetError.UI_DEP_LIB_MISMATCH);
    }
    const vv = widget.vueVersion || '2';
    if (LIB_VUE_MAP[lib] !== vv) {
      throw createUiError(
        `物料 ${widget.name} vueVersion=${vv} 但 uiDependencies.lib=${lib}（期望 vueVersion=${LIB_VUE_MAP[lib]}）`,
        WidgetError.UI_DEP_LIB_MISMATCH
      );
    }
    if (vv === 'none') {
      throw createUiError(`物料 ${widget.name} vueVersion='none' 但声明了 uiDependencies`, WidgetError.UI_DEP_LIB_MISMATCH);
    }

    if (!groups[lib]) {
      let version = stripRange(ui.version);
      if (!version) {
        version = UI_VERSION_DEFAULTS[lib];
        console.warn(`[ui-loader] 物料 ${widget.name} 的 uiDependencies.version 缺失，回退到默认 ${lib}@${version}`);
      }
      groups[lib] = { version, full: !!ui.full, components: new Set(), styles: new Set(['base']) };
    }
    if (ui.full) groups[lib].full = true;
    if (ui.components) ui.components.forEach(c => groups[lib].components.add(c));
    if (ui.styles) ui.styles.forEach(s => groups[lib].styles.add(s));
  }

  const loader = createWidgetLoader();
  const loaded = [];
  const failed = [];

  for (const lib of Object.keys(groups)) {
    const g = groups[lib];
    const runtime = runtimeByLib[lib];

    if (g.full) {
      const urls = [
        resolveFullResource(cdnBase, lib, g.version, 'js'),
        resolveFullResource(cdnBase, lib, g.version, 'css')
      ];
      try {
        await Promise.all(urls.map(u => loadUiResource(u, loader)));
        loaded.push(`${lib}:full`);
      } catch (e) {
        failed.push({ lib, component: 'full', reason: e.message });
      }
      continue;
    }

    const baseCssUrls = Array.from(g.styles).map(s =>
      s === 'base'
        ? resolveUiResource(cdnBase, lib, g.version, 'base', 'css')
        : resolveUiResource(cdnBase, lib, g.version, s, 'css')
    );

    const tasks = [];
    for (const comp of g.components) {
      const jsUrl = resolveUiResource(cdnBase, lib, g.version, comp, 'js');
      const cssUrl = resolveUiResource(cdnBase, lib, g.version, comp, 'css');
      tasks.push(
        loadUiResourceWithRetry(jsUrl, loader, 1)
          .then(() => {
            registerUiComponent(lib, comp, runtime);
            loaded.push(`${lib}:${comp}`);
          })
          .catch(e => failed.push({ lib, component: comp, reason: e.message }))
      );
      tasks.push(loadUiResourceWithRetry(cssUrl, loader, 1).catch(() => {}));
    }

    baseCssUrls.forEach(u => tasks.push(loadUiResourceWithRetry(u, loader, 1).catch(() => {})));
    await Promise.all(tasks);
  }

  return { loaded, failed };
}
