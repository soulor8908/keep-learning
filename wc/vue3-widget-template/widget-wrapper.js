/**
 * Vue3 物料组件自动包装器
 * 使用方式：vite.config.js 中把入口设为此文件
 * 通过 import.meta.env.VITE_WIDGET_NAME 和 VITE_WIDGET_COMPONENT 指定
 */
import { createApp, h } from 'vue';

function parseConfig(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (e) {
    console.error(`[${import.meta.env.VITE_WIDGET_NAME}] config parse error:`, e);
    return {};
  }
}

function createWidgetWrapper(Component, widgetName) {
  return class WidgetElement extends HTMLElement {
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
        // Vue3 直接更新根组件 props，触发重新渲染
        this.app._instance.props.config = parseConfig(newValue);
      }
    }
  };
}

const widgetName = import.meta.env.VITE_WIDGET_NAME;
const componentPath = import.meta.env.VITE_WIDGET_COMPONENT;

if (!widgetName || !componentPath) {
  throw new Error('VITE_WIDGET_NAME 和 VITE_WIDGET_COMPONENT 环境变量必须设置');
}

// 动态引入业务组件
const module = await import(/* @vite-ignore */ componentPath);
const Component = module.default;
const WidgetElement = createWidgetWrapper(Component, widgetName);

customElements.define(widgetName, WidgetElement);
