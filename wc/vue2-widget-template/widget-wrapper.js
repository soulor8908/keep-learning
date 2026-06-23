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
  // 桥接组件：把 Custom Element 接收到的 String config 转成 Object 再传给业务组件
  const BridgeComponent = {
    props: ['config'],
    render(h) {
      return h(Component, {
        props: { config: parseConfig(this.config) }
      });
    }
  };

  return wrap(Vue, BridgeComponent);
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
