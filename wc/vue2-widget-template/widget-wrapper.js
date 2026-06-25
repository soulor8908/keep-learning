/**
 * Vue2 物料组件自动包装器
 * 使用方式：在 vue.config.js 的 configureWebpack.entry 中引用此文件
 * 通过环境变量 WIDGET_NAME 和 WIDGET_COMPONENT 指定组件名和入口组件路径
 *
 * 重要：不使用 @vue/web-component-wrapper（默认创建 Shadow DOM），
 *   改为手写 HTMLElement 挂载到 light DOM，让 ElementUI 全局样式与主题变量能穿透。
 */
import Vue from 'vue';
import { createWidgetScope } from '../widget-scope/index.js';

export function parseConfig(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (e) {
    console.error(`[${process.env.WIDGET_NAME}] config parse error:`, e);
    return {};
  }
}

export function createWidgetWrapper(Component, widgetName) {
  // 手写 HTMLElement，挂载到 light DOM（不使用 Shadow DOM）
  // 原因：ElementUI 全局样式与主题变量需要穿透到物料内部，Shadow DOM 会隔离样式
  //
  // config 处理：connectedCallback/attributeChangedCallback 中调用 parseConfig
  // 解析为 Object 存入 reactive data widgetConfig，Vue 检测到引用变化后
  // 自动重渲染并传给业务组件。每次 parseConfig 返回新对象引用，确保
  // 业务组件的 watch: { config } / watch: { config: { deep: true } } 都能触发（P2-22）
  class WidgetElement extends HTMLElement {
    constructor() {
      super();
      this.vm = null;
      // 每个物料实例创建独立的 widgetScope 软隔离对象，
      // 物料组件通过 props.scope 接收，而非直接访问 window
      this._scope = createWidgetScope({ name: widgetName });
      this._widgetScope = this._scope;
    }

    static get observedAttributes() {
      return ['config'];
    }

    connectedCallback() {
      const config = this.getAttribute('config');
      // 使用 reactive data 承载已解析的 config，attributeChangedCallback 中更新
      // this.vm.widgetConfig 即可触发响应式重渲染，无需依赖 $children 内部 API
      // 同时把 scope 作为 data 暴露给 render，注入到业务组件 props
      this.vm = new Vue({
        data: { widgetConfig: parseConfig(config), widgetScope: this._scope },
        render(h) {
          return h(Component, { props: { config: this.widgetConfig, scope: this.widgetScope } });
        }
      });
      this.vm.$mount();
      this.appendChild(this.vm.$el);
    }

    disconnectedCallback() {
      if (this.vm) {
        this.vm.$destroy();
        this.vm = null;
        this._scope = null;
        this._widgetScope = null;
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      // 更新 reactive data，Vue 自动触发重渲染，不依赖 $children[0] 顺序
      if (name === 'config' && this.vm) {
        this.vm.widgetConfig = parseConfig(newValue);
      }
    }
  }

  return WidgetElement;
}

const widgetName = process.env.WIDGET_NAME;
const componentPath = process.env.WIDGET_COMPONENT;

if (!widgetName || !componentPath) {
  throw new Error('WIDGET_NAME 和 WIDGET_COMPONENT 环境变量必须设置');
}

// 动态引入业务组件并注册 Custom Element。
// 生产环境（webpack CJS）require 必然存在；ESM 环境下 require 可能未定义，
// 此时跳过自动注册（仅导出 parseConfig/createWidgetWrapper 供测试），
// 不影响生产构建行为。
if (typeof require !== 'undefined') {
  const Component = require(componentPath).default;
  const WidgetElement = createWidgetWrapper(Component, widgetName);
  customElements.define(widgetName, WidgetElement);
}
