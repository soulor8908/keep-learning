/**
 * Vite 物料自动包装插件
 *
 * 使用方式（vite.config.js）：
 * import widgetVitePlugin from '@your-scope/widget-wrapper-plugin/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     widgetVitePlugin({
 *       name: 'bi-finance-panel',
 *       component: './src/components/FinancePanel.vue',
 *       vueGlobal: 'Vue' // 可选，默认 'Vue'
 *     })
 *   ]
 * });
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { writeSchema } = require('../schema-generator');

function generateVue3Wrapper(widgetName, vueGlobal) {
  return `
import { createApp, h, ref } from 'vue';
import Component from '__WIDGET_COMPONENT__';

// ─── 重要：禁止使用 Shadow DOM ───
// 不要改用 Vue3 官方的 defineCustomElement()——它默认调用 attachShadow()，
// 会把物料样式完全隔离，导致基座注入的 element-plus 全局样式 / 主题变量 / 字体图标无法穿透。
// 本包装层手写 HTMLElement + createApp().mount(this)，挂载到 light DOM，
// 与"不开启 Shadow DOM"的架构决策保持一致。
function parseConfig(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

class WidgetElement extends HTMLElement {
  constructor() {
    super();
    this.app = null;
    this._configRef = null;
  }

  static get observedAttributes() {
    return ['config'];
  }

  connectedCallback() {
    // 防御性守卫：若未来误引入 attachShadow / defineCustomElement，立即告警
    if (this.shadowRoot) {
      console.error(
        '[widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，' +
        'element-plus 全局样式将无法穿透。请勿使用 defineCustomElement 或 attachShadow。'
      );
    }
    this._mount();
  }

  // 挂载：仅首次创建 app 与 reactive config ref
  _mount() {
    if (this.app) return; // 已挂载，config 变化由 _updateConfig 处理
    // 使用 ref 承载 config，render 中访问 .value 建立响应式依赖
    // config 变化时只需更新 ref.value，Vue3 自动触发重渲染，无需 unmount/remount
    this._configRef = ref(parseConfig(this.getAttribute('config')));
    this.app = createApp({
      render: () => h(Component, { config: this._configRef.value })
    });
    this.app.mount(this);
  }

  // config 变化时更新 ref，避免 unmount/remount 带来的性能损耗与状态丢失
  _updateConfig(newValue) {
    if (this._configRef) {
      this._configRef.value = parseConfig(newValue);
    }
  }

  disconnectedCallback() {
    if (this.app) {
      this.app.unmount();
      this.app = null;
      this._configRef = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // config 变化：更新 reactive ref，走标准公开 API，不触碰内部 _instance
    if (name === 'config' && this.app && oldValue !== newValue) {
      this._updateConfig(newValue);
    }
  }
}

customElements.define('${widgetName}', WidgetElement);
`;
}

export default function widgetVitePlugin(options = {}) {
  const { name, component, vueGlobal = 'Vue', cssFileName = name } = options;
  if (!name || !component) {
    throw new Error('[widget-vite-plugin] 请配置 name 和 component');
  }

  const componentPath = path.resolve(process.cwd(), component);
  const wrapperCode = generateVue3Wrapper(name, vueGlobal);
  const tmpFile = path.join(os.tmpdir(), `widget-wrapper-${name}-${Date.now()}.js`);
  fs.writeFileSync(tmpFile, wrapperCode);

  return {
    name: 'widget-wrapper-plugin',
    config: () => ({
      build: {
        sourcemap: true, // 开启 source map，方便本地调试物料
        cssCodeSplit: false,
        lib: {
          entry: tmpFile,
          name,
          fileName: () => `${name}.js`,
          formats: ['umd'],
          cssFileName
        },
        rollupOptions: {
          external: ['vue', 'element-plus', 'wc-i18n'],
          output: {
            globals: {
              vue: vueGlobal,
              'element-plus': 'ElementPlus',
              // 国际化运行时：基座提供 window.__wcI18n__，物料共享同一实例与 locale 状态
              'wc-i18n': '__wcI18n__'
            }
          }
        }
      },
      resolve: {
        alias: {
          __WIDGET_COMPONENT__: componentPath
        }
      }
    }),
    // 构建完成后自动生成 schema.json
    closeBundle() {
      try {
        const outputDir = path.resolve(process.cwd(), 'dist');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        writeSchema(name, componentPath, path.join(outputDir, `${name}.schema.json`));
      } catch (e) {
        console.warn('[widget-vite-plugin] 自动生成 schema.json 失败:', e.message);
      } finally {
        // 清理临时 wrapper 文件，避免 tmp 目录堆积
        try { fs.unlinkSync(tmpFile); } catch (_) {}
      }
    }
  };
}
