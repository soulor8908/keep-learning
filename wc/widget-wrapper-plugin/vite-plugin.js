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
 *       component: './src/components/FinancePanel.vue'
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

function generateVue3Wrapper(widgetName) {
  return `
import { createApp, h } from 'vue';
import Component from '__WIDGET_COMPONENT__';

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
    const config = this.getAttribute('config');
    // 直接把 Object 传给业务组件，组件内部无需 JSON.parse
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
  const { name, component } = options;
  if (!name || !component) {
    throw new Error('[widget-vite-plugin] 请配置 name 和 component');
  }

  const componentPath = path.resolve(process.cwd(), component);
  const wrapperCode = generateVue3Wrapper(name);
  const tmpFile = path.join(os.tmpdir(), `widget-wrapper-${name}-${Date.now()}.js`);
  fs.writeFileSync(tmpFile, wrapperCode);

  return {
    name: 'widget-wrapper-plugin',
    config: () => ({
      build: {
        lib: {
          entry: tmpFile,
          name,
          fileName: () => `${name}.js`,
          formats: ['umd']
        },
        rollupOptions: {
          external: ['vue', 'aui'],
          output: {
            globals: {
              vue: 'Vue',
              aui: 'aui'
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
