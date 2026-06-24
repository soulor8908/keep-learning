/**
 * Vue3 物料组件自动包装器
 * 使用方式：vite.config.js 中把入口设为此文件
 * 通过构建工具注入的全局变量 __WIDGET_NAME__ 和 __WIDGET_COMPONENT__ 指定
 *
 * 说明：不使用 import.meta.env（Vite 特有），改用构建工具 define 注入的
 * 全局变量 __WIDGET_NAME__ / __WIDGET_COMPONENT__，使本文件可被 webpack 等
 * 其他工具处理（通过 NormalModuleReplacementPlugin 或 DefinePlugin 注入）。
 *
 * ─── 重要：禁止使用 Shadow DOM ───
 * 不要改用 Vue3 官方的 defineCustomElement()——它默认调用 attachShadow()，
 * 会把物料样式完全隔离，导致基座注入的 aui 全局样式 / 主题变量 / 字体图标无法穿透。
 * 本包装层手写 HTMLElement + createApp().mount(this)，挂载到 light DOM，
 * 与"不开启 Shadow DOM"的架构决策保持一致。
 */
import { createApp, h, ref } from 'vue';

function parseConfig(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (e) {
    console.error(`[${__WIDGET_NAME__}] config parse error:`, e);
    return {};
  }
}

function createWidgetWrapper(Component, widgetName) {
  return class WidgetElement extends HTMLElement {
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
          `[widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，` +
          'aui 全局样式将无法穿透。请勿使用 defineCustomElement 或 attachShadow。'
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
  };
}

const widgetName = __WIDGET_NAME__;
const componentPath = __WIDGET_COMPONENT__;

if (!widgetName || !componentPath) {
  throw new Error('__WIDGET_NAME__ 和 __WIDGET_COMPONENT__ 必须由构建工具注入');
}

// 动态引入业务组件
const module = await import(/* @vite-ignore */ componentPath);
const Component = module.default;
const WidgetElement = createWidgetWrapper(Component, widgetName);

customElements.define(widgetName, WidgetElement);
