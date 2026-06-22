/**
 * Vue2 物料组件自动包装器
 * 使用方式：在 vue.config.js 的 configureWebpack.entry 中引用此文件
 * 通过环境变量 WIDGET_NAME 和 WIDGET_COMPONENT 指定组件名和入口组件路径
 */
import Vue from 'vue';
import wrap from '@vue/web-component-wrapper';

function parseConfig(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (e) {
    console.error(`[${process.env.WIDGET_NAME}] config parse error:`, e);
    return {};
  }
}

function createWidgetWrapper(Component, widgetName) {
  const Wrapped = wrap(Vue, Component);

  // 扩展原 wrapper，确保 config 变更时能正确透传
  class WidgetElement extends Wrapped {
    static get observedAttributes() {
      return ['config'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (name === 'config' && this._vnode && this._vnode.componentInstance) {
        this._vnode.componentInstance.config = parseConfig(newValue);
      }
      super.attributeChangedCallback && super.attributeChangedCallback(name, oldValue, newValue);
    }
  }

  return WidgetElement;
}

const widgetName = process.env.WIDGET_NAME;
const componentPath = process.env.WIDGET_COMPONENT;

if (!widgetName || !componentPath) {
  throw new Error('WIDGET_NAME 和 WIDGET_COMPONENT 环境变量必须设置');
}

// 动态引入业务组件
const Component = require(componentPath).default;
const WidgetElement = createWidgetWrapper(Component, widgetName);

customElements.define(widgetName, WidgetElement);
