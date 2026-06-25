// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
// vue-cli-plugin 是 CJS（module.exports = function），用 require 拿到最稳
const widgetVueCliPlugin = require('../vue-cli-plugin.js');
// vite-plugin / h5-vite-plugin 是 ESM（export default），用静态 import
import widgetVitePlugin from '../vite-plugin.js';
import h5WidgetVitePlugin from '../h5-vite-plugin.js';

// 临时 wrapper 文件清理（vue-cli-plugin 会写 /tmp/widget-wrapper-*.js）
const tmpFiles = [];
afterEach(() => {
  while (tmpFiles.length) {
    const f = tmpFiles.pop();
    try { fs.unlinkSync(f); } catch (_) {}
  }
});

/**
 * 构造一个 mock webpack-chain config，捕获 externals 调用
 * 只实现 vue-cli-plugin 实际会触发的接口，其余返回 noop chainable
 */
function createMockWebpackChainConfig() {
  const captured = { externals: null, output: {}, alias: new Map(), devtool: null, deletedPlugins: [], entryReplaced: [] };
  const chainable = () => {
    const fn = () => chainable;
    return fn;
  };
  const entryApi = (name) => ({
    clear() { return this; },
    add(file) { captured.entryReplaced.push({ name, file }); tmpFiles.push(file); return this; }
  });
  const config = {
    entryPoints: { store: new Map([['app', ['legacy']]]) },
    entry: entryApi,
    output: {
      filename(name) { captured.output.filename = name; return this; },
      library(name) { captured.output.library = name; return this; },
      libraryTarget(t) { captured.output.libraryTarget = t; return this; }
    },
    externals(map) { captured.externals = map; return this; },
    resolve: { alias: { set(k, v) { captured.alias.set(k, v); return this; } } },
    devtool(t) { captured.devtool = t; return this; },
    module: { rules: { get() { return null; } } },
    plugins: { delete(name) { captured.deletedPlugins.push(name); return this; } },
    plugin(name) {
      captured.lastPluginName = name;
      return { use() { return this; } };
    }
  };
  return { config, captured };
}

describe('widget-wrapper-plugin external 映射', () => {
  describe('T1.3a vue-cli-plugin (Vue2) external', () => {
    it('默认 vueGlobal=Vue 时，vue → Vue、element-ui → ELEMENT、i18n/scope 走全局变量', () => {
      const { config, captured } = createMockWebpackChainConfig();
      const chainWebpack = widgetVueCliPlugin({
        name: 'bi-sales-panel',
        component: './does-not-exist.vue',
        autoNamespace: false,
        scanRisks: false,
        enforceScoped: 'off',
        enforceCssNamespace: 'off'
      });
      chainWebpack(config);
      expect(captured.externals).toBeTruthy();
      expect(captured.externals.vue).toBe('Vue');
      expect(captured.externals['element-ui']).toBe('ELEMENT');
      expect(captured.externals['wc-i18n']).toBe('__wcI18n__');
      expect(captured.externals['wc-widget-scope']).toBe('__wcWidgetScope__');
    });

    it('自定义 vueGlobal=Vue2 时，vue 被映射到 window.Vue2', () => {
      const { config, captured } = createMockWebpackChainConfig();
      const chainWebpack = widgetVueCliPlugin({
        name: 'bi-sales-panel',
        component: './does-not-exist.vue',
        vueGlobal: 'Vue2',
        autoNamespace: false,
        scanRisks: false,
        enforceScoped: 'off',
        enforceCssNamespace: 'off'
      });
      chainWebpack(config);
      expect(captured.externals.vue).toBe('Vue2');
    });

    it('输出 UMD 物料名：filename/library/libraryTarget 正确', () => {
      const { config, captured } = createMockWebpackChainConfig();
      const chainWebpack = widgetVueCliPlugin({
        name: 'bi-sales-panel',
        component: './does-not-exist.vue',
        autoNamespace: false,
        scanRisks: false,
        enforceScoped: 'off',
        enforceCssNamespace: 'off'
      });
      chainWebpack(config);
      expect(captured.output.filename).toBe('bi-sales-panel.js');
      expect(captured.output.library).toBe('bi-sales-panel');
      expect(captured.output.libraryTarget).toBe('umd');
    });

    it('缺 name/component 时抛错', () => {
      expect(() => widgetVueCliPlugin({ component: './x.vue' })).toThrow();
      expect(() => widgetVueCliPlugin({ name: 'bi-x' })).toThrow();
    });
  });

  describe('T1.3b vite-plugin (Vue3) external', () => {
    it('external 含 vue/element-plus/wc-i18n/wc-widget-scope，globals 映射到 Vue/ElementPlus/全局变量', () => {
      const plugin = widgetVitePlugin({
        name: 'bi-finance-panel',
        component: './does-not-exist.vue'
      });
      const cfg = plugin.config();
      const external = cfg.build.rollupOptions.external;
      expect(Array.isArray(external)).toBe(true);
      expect(external).toEqual(['vue', 'element-plus', 'wc-i18n', 'wc-widget-scope']);
      const globals = cfg.build.rollupOptions.output.globals;
      expect(globals.vue).toBe('Vue');
      expect(globals['element-plus']).toBe('ElementPlus');
      expect(globals['wc-i18n']).toBe('__wcI18n__');
      expect(globals['wc-widget-scope']).toBe('__wcWidgetScope__');
    });

    it('自定义 vueGlobal=Vue3 时，vue 全局变量为 Vue3', () => {
      const plugin = widgetVitePlugin({
        name: 'bi-finance-panel',
        component: './does-not-exist.vue',
        vueGlobal: 'Vue3'
      });
      const cfg = plugin.config();
      expect(cfg.build.rollupOptions.output.globals.vue).toBe('Vue3');
    });

    it('UMD 输出格式与文件名', () => {
      const plugin = widgetVitePlugin({
        name: 'bi-finance-panel',
        component: './does-not-exist.vue'
      });
      const cfg = plugin.config();
      expect(cfg.build.lib.formats).toEqual(['umd']);
      expect(cfg.build.lib.name).toBe('bi-finance-panel');
      expect(typeof cfg.build.lib.fileName).toBe('function');
      expect(cfg.build.lib.fileName()).toBe('bi-finance-panel.js');
    });
  });

  describe('T1.3c h5-vite-plugin (无框架) external', () => {
    // 用真实存在文件作为 entry（h5 插件会检查 fs.existsSync）
    const dummyEntry = path.resolve(process.cwd(), 'wc/widget-wrapper-plugin/postcss-namespace.js');

    it('不 external 任何 vue，仅 external wc-widget-scope', () => {
      const plugin = h5WidgetVitePlugin({
        name: 'bi-weather-card',
        entry: dummyEntry
      });
      const cfg = plugin.config();
      const external = cfg.build.rollupOptions.external;
      expect(external).toEqual(['wc-widget-scope']);
      const globals = cfg.build.rollupOptions.output.globals;
      expect(globals['wc-widget-scope']).toBe('__wcWidgetScope__');
      // 不含 vue / element-plus / element-ui
      expect(external).not.toContain('vue');
      expect(external).not.toContain('element-plus');
      expect(external).not.toContain('element-ui');
    });

    it('UMD 输出 + 入口别名指向 __WIDGET_ENTRY__', () => {
      const plugin = h5WidgetVitePlugin({
        name: 'bi-weather-card',
        entry: dummyEntry
      });
      const cfg = plugin.config();
      expect(cfg.build.lib.formats).toEqual(['umd']);
      expect(cfg.build.lib.name).toBe('bi-weather-card');
      expect(cfg.resolve.alias.__WIDGET_ENTRY__).toBe(dummyEntry);
    });

    it('缺 name/entry 时抛错', () => {
      expect(() => h5WidgetVitePlugin({ entry: dummyEntry })).toThrow();
      expect(() => h5WidgetVitePlugin({ name: 'bi-x' })).toThrow();
    });

    it('entry 文件不存在时抛错', () => {
      expect(() => h5WidgetVitePlugin({
        name: 'bi-x',
        entry: './not-exist.js'
      })).toThrow();
    });
  });
});
