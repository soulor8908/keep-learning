// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
// vue-cli-plugin 是 CJS（module.exports = function），用 require 拿到最稳
const widgetVueCliPlugin = require('../vue-cli-plugin.js');
// vite-plugin 是 ESM（export default），用静态 import
import widgetVitePlugin from '../vite-plugin.js';

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
    it('默认 vueGlobal=Vue 时，vue → Vue、element-ui → ELEMENT、i18n/scope/高频库 走全局变量', () => {
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
      expect(captured.externals.vue).toBe('Vue2');
      expect(captured.externals['element-ui']).toBe('ELEMENT');
      expect(captured.externals['wc-i18n']).toBe('__wcI18n__');
      expect(captured.externals['wc-widget-scope']).toBe('__wcWidgetScope__');
      // 高频第三方库 external 化，避免 N 个物料打包 N 份
      expect(captured.externals['lodash']).toBe('_');
      expect(captured.externals['axios']).toBe('axios');
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

    it('默认 vueGlobal 为 Vue2（与基座 window.Vue2 对齐）', () => {
      // 不传 vueGlobal 时默认为 'Vue2'，而非旧的 'Vue'
      const { config, captured } = createMockWebpackChainConfig();
      const chainWebpack = widgetVueCliPlugin({
        name: 'bi-default-vueglobal',
        component: './does-not-exist.vue',
        autoNamespace: false,
        scanRisks: false,
        enforceScoped: 'off',
        enforceCssNamespace: 'off'
      });
      chainWebpack(config);
      expect(captured.externals.vue).toBe('Vue2');
    });
  });

  describe('T1.3b vite-plugin (Vue3) external', () => {
    // 用真实存在文件作为 entry（插件会检查 fs.existsSync）
    const dummyComponent = path.resolve(process.cwd(), 'wc/widget-wrapper-plugin/postcss-namespace.js');

    it('external 函数对 vue/element-plus/wc-i18n/wc-widget-scope/lodash/axios 返回 true，globals 映射到 Vue/ElementPlus/全局变量', () => {
      const plugin = widgetVitePlugin({
        name: 'bi-finance-panel',
        component: dummyComponent
      });
      const cfg = plugin.config();
      const external = cfg.build.rollupOptions.external;
      // 函数形式 external（lib 模式下数组形式会被自动外部化覆盖，改用函数逐个判定）
      expect(typeof external).toBe('function');
      expect(external('vue')).toBe(true);
      expect(external('element-plus')).toBe(true);
      expect(external('wc-i18n')).toBe(true);
      expect(external('wc-widget-scope')).toBe(true);
      expect(external('lodash')).toBe(true);
      expect(external('axios')).toBe(true);
      // 未声明的模块不外部化（会被打包）
      expect(external('some-internal-util')).toBe(false);
      const globals = cfg.build.rollupOptions.output.globals;
      expect(globals.vue).toBe('Vue3');
      expect(globals['element-plus']).toBe('ElementPlus');
      expect(globals['wc-i18n']).toBe('__wcI18n__');
      expect(globals['wc-widget-scope']).toBe('__wcWidgetScope__');
      // 高频第三方库全局变量映射
      expect(globals['lodash']).toBe('_');
      expect(globals['axios']).toBe('axios');
    });

    it('自定义 vueGlobal=Vue3 时，vue 全局变量为 Vue3', () => {
      const plugin = widgetVitePlugin({
        name: 'bi-finance-panel',
        component: dummyComponent,
        vueGlobal: 'Vue3'
      });
      const cfg = plugin.config();
      expect(cfg.build.rollupOptions.output.globals.vue).toBe('Vue3');
    });

    it('UMD 输出格式与文件名', () => {
      const plugin = widgetVitePlugin({
        name: 'bi-finance-panel',
        component: dummyComponent
      });
      const cfg = plugin.config();
      expect(cfg.build.lib.formats).toEqual(['umd']);
      expect(cfg.build.lib.name).toBe('bi-finance-panel');
      expect(typeof cfg.build.lib.fileName).toBe('function');
      expect(cfg.build.lib.fileName()).toBe('bi-finance-panel.js');
    });

    it('默认 vueGlobal 为 Vue3（与基座 window.Vue3 对齐）', () => {
      const plugin = widgetVitePlugin({
        name: 'bi-default-vueglobal-v3',
        component: dummyComponent,
        autoNamespace: false,
        scanRisks: false,
        enforceScoped: 'off',
        enforceCssNamespace: 'off'
      });
      const cfg = plugin.config();
      const globals = cfg.build.rollupOptions.output.globals;
      expect(globals.vue).toBe('Vue3');
    });
  });

  describe('T1.3c vite-plugin mode=h5 (无框架) external', () => {
    // 用真实存在文件作为 entry（h5 插件会检查 fs.existsSync）
    const dummyEntry = path.resolve(process.cwd(), 'wc/widget-wrapper-plugin/postcss-namespace.js');

    it('不 external 任何 vue，仅 external wc-widget-scope + wc-i18n + 高频库 lodash/axios', () => {
      const plugin = widgetVitePlugin({
        name: 'bi-weather-card',
        entry: dummyEntry,
        mode: 'h5'
      });
      const cfg = plugin.config();
      const external = cfg.build.rollupOptions.external;
      // 函数形式 external（lib 模式下数组形式会被自动外部化覆盖，改用函数逐个判定）
      expect(typeof external).toBe('function');
      // R2-2：wc-i18n 加入 external（onLocaleChange 订阅需要）
      expect(external('wc-widget-scope')).toBe(true);
      expect(external('wc-i18n')).toBe(true);
      expect(external('lodash')).toBe(true);
      expect(external('axios')).toBe(true);
      const globals = cfg.build.rollupOptions.output.globals;
      expect(globals['wc-widget-scope']).toBe('__wcWidgetScope__');
      expect(globals['wc-i18n']).toBe('__wcI18n__');
      // 高频第三方库全局变量映射
      expect(globals['lodash']).toBe('_');
      expect(globals['axios']).toBe('axios');
      // 不含 vue / element-plus / element-ui（H5 物料无 Vue 依赖）
      expect(external('vue')).toBe(false);
      expect(external('element-plus')).toBe(false);
      expect(external('element-ui')).toBe(false);
    });

    it('UMD 输出 + 入口别名指向 __WIDGET_ENTRY__', () => {
      const plugin = widgetVitePlugin({
        name: 'bi-weather-card',
        entry: dummyEntry,
        mode: 'h5'
      });
      const cfg = plugin.config();
      expect(cfg.build.lib.formats).toEqual(['umd']);
      expect(cfg.build.lib.name).toBe('bi-weather-card');
      expect(cfg.resolve.alias.__WIDGET_ENTRY__).toBe(dummyEntry);
    });

    it('缺 name/entry 时抛错', () => {
      expect(() => widgetVitePlugin({ entry: dummyEntry, mode: 'h5' })).toThrow();
      expect(() => widgetVitePlugin({ name: 'bi-x', mode: 'h5' })).toThrow();
    });

    it('entry 文件不存在时抛错', () => {
      expect(() => widgetVitePlugin({
        name: 'bi-x',
        entry: './not-exist.js',
        mode: 'h5'
      })).toThrow();
    });
  });
});
