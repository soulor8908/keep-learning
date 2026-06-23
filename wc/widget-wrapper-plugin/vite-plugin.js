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
import { createApp, h } from 'vue';
import Component from '__WIDGET_COMPONENT__';

// ─── 重要：禁止使用 Shadow DOM ───
// 不要改用 Vue3 官方的 defineCustomElement()——它默认调用 attachShadow()，
// 会把物料样式完全隔离，导致基座注入的 aui 全局样式 / 主题变量 / 字体图标无法穿透。
// 本包装层手写 HTMLElement + createApp().mount(this)，挂载到 light DOM，
// 与"不开启 Shadow DOM"的架构决策保持一致。
function parseConfig(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

class WidgetElement extends HTMLElement {
  constructor() {
    super();
    this.app = null;
  }

  static get observedAttributes() {
    return ['config'];
  }

  connectedCallback() {
    // 防御性守卫：若未来误引入 attachShadow / defineCustomElement，立即告警
    if (this.shadowRoot) {
      console.error(
        '[widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，' +
        'aui 全局样式将无法穿透。请勿使用 defineCustomElement 或 attachShadow。'
      );
    }
    const config = this.getAttribute('config');
    // 直接把 Object 传给业务组件，组件内部无需 JSON.parse
    // mount(this) 挂载到 light DOM，不创建 shadow root
    this.app = createApp({
      render: () => h(Component, { config: parseConfig(config) })
    });
    this.app.mount(this);
  }

  disconnectedCallback() {
    if (this.app) {
      this.app.unmount();
      this.app = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'config' && this.app) {
      this.app._instance.props.config = parseConfig(newValue);
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
          external: ['vue', 'aui', 'wc-i18n'],
          output: {
            globals: {
              vue: vueGlobal,
              aui: 'aui',
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
      }
    }
  };
}
