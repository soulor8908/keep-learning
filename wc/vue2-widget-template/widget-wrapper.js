/**
 * Vue2 物料组件自动包装器
 * 使用方式：在 vue.config.js 的 configureWebpack.entry 中引用此文件
 * 通过环境变量 WIDGET_NAME 和 WIDGET_COMPONENT 指定组件名和入口组件路径
 *
 * 重要：不使用 @vue/web-component-wrapper（默认创建 Shadow DOM），
 *   改为手写 HTMLElement 挂载到 light DOM，让 ElementUI 全局样式与主题变量能穿透。
 *
 * ─── config 与 props 双模兼容 ───
 * 包装层同时支持两种传参方式，业务组件改造时无需额外添加 config 属性：
 *   1. config 模式（向后兼容）：宿主写 <bi-xxx config='{"title":"a"}'>，
 *      包装层解析为 Object，作为 config prop 传入（组件需声明 props.config）。
 *   2. props 模式（推荐）：宿主把业务组件原有的 props 直接作为属性传入，
 *      如 <bi-xxx title="a" :count="5">，包装层按属性名（kebab→camel）解析后
 *      作为独立 prop 传入，组件无需新增 config，原有 props 即可直接复用。
 * 两种模式可混用：config 提供聚合配置，个别 props 显式覆盖。
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

// camelCase → kebab-case，用于把 prop 名映射为可观察的 attribute 名
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * 提取业务组件声明的 prop 名列表
 * 支持 Options API 的 props（数组 / 对象）
 */
function getDeclaredPropNames(Component) {
  const props = Component && Component.props;
  if (!props) return [];
  if (Array.isArray(props)) return props.filter(p => typeof p === 'string');
  return Object.keys(props);
}

/**
 * 取某个 prop 的声明类型构造器（或构造器数组），用于按类型解析属性值
 * 支持三种声明形式：简写（a: String）、简写数组（a: [String, Number]）、完整（a: { type: String }）
 */
function getPropType(Component, name) {
  const props = Component && Component.props;
  if (!props || Array.isArray(props)) return null;
  const def = props[name];
  if (!def) return null;
  if (Array.isArray(def)) return def;
  if (typeof def === 'function') return def;
  return def.type || null;
}

/**
 * 按属性值与 prop 类型解析为最终传入组件的值
 * - Boolean 类型：遵循 HTML 布尔属性语义（存在即 true，"false" 为 false）
 * - 其它类型：优先 JSON.parse，失败则回退为原始字符串
 */
function parseAttrValue(raw, type) {
  if (type === Boolean) {
    if (raw === '' || raw === 'true') return true;
    if (raw === 'false') return false;
    return true;
  }
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
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

  // 声明的 prop 名：剔除 config（由专用 widgetConfig data 处理）与 scope（框架注入）
  const individualPropNames = getDeclaredPropNames(Component)
    .filter(n => n !== 'config' && n !== 'scope');
  const attrToProp = new Map(individualPropNames.map(n => [camelToKebab(n), n]));
  // 观察的属性：config（向后兼容）+ 各独立 prop 的 kebab attribute（去重）
  const observedAttrs = [...new Set(['config', ...individualPropNames.map(camelToKebab)])];
  const declaresConfig = getDeclaredPropNames(Component).includes('config');

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
      return observedAttrs;
    }

    connectedCallback() {
      const config = this.getAttribute('config');
      // 使用 reactive data 承载已解析的 config 与独立 props，
      // attributeChangedCallback 中更新即可触发响应式重渲染，无需依赖 $children 内部 API
      // 同时把 scope 作为 data 暴露给 render，注入到业务组件 props
      this.vm = new Vue({
        data: {
          widgetConfig: parseConfig(config),
          widgetProps: this._collectProps(),
          widgetScope: this._scope
        },
        render(h) {
          const props = { ...this.widgetProps, scope: this.widgetScope };
          if (declaresConfig) {
            props.config = this.widgetConfig;
          }
          return h(Component, { props });
        }
      });
      this.vm.$mount();
      this.appendChild(this.vm.$el);
    }

    // 收集所有已设置的独立 prop 属性，按声明类型解析为值
    _collectProps() {
      const result = {};
      for (const [attrName, propName] of attrToProp) {
        if (this.hasAttribute(attrName)) {
          const type = getPropType(Component, propName);
          result[propName] = parseAttrValue(this.getAttribute(attrName), type);
        }
      }
      return result;
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
      if (!this.vm || oldValue === newValue) return;
      // 更新 reactive data，Vue 自动触发重渲染，不依赖 $children[0] 顺序
      if (name === 'config') {
        this.vm.widgetConfig = parseConfig(newValue);
        return;
      }
      // 独立 prop 属性变化：整体替换 widgetProps 触发重渲染
      const propName = attrToProp.get(name);
      if (propName) {
        const type = getPropType(Component, propName);
        this.vm.widgetProps = {
          ...this.vm.widgetProps,
          [propName]: parseAttrValue(newValue, type)
        };
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
