/**
 * Vue3 物料组件自动包装器
 * 使用方式：vite.config.js 中把入口设为此文件
 * 通过 import.meta.env.VITE_WIDGET_NAME 和 VITE_WIDGET_COMPONENT 指定
 *
 * ─── 重要：禁止使用 Shadow DOM ───
 * 不要改用 Vue3 官方的 defineCustomElement()——它默认调用 attachShadow()，
 * 会把物料样式完全隔离，导致基座注入的 aui 全局样式 / 主题变量 / 字体图标无法穿透。
 * 本包装层手写 HTMLElement + createApp().mount(this)，挂载到 light DOM，
 * 与"不开启 Shadow DOM"的架构决策保持一致。
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
      // 防御性守卫：若未来误引入 attachShadow / defineCustomElement，立即告警
      if (this.shadowRoot) {
        console.error(
          `[widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，` +
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
