/**
 * Vue2 物料组件自动包装器
 * 使用方式：在 vue.config.js 的 configureWebpack.entry 中引用此文件
 * 通过环境变量 WIDGET_NAME 和 WIDGET_COMPONENT 指定组件名和入口组件路径
 *
 * 重要：不使用 @vue/web-component-wrapper（默认创建 Shadow DOM），
 *   改为手写 HTMLElement 挂载到 light DOM，让 ElementUI 全局样式与主题变量能穿透。
 *
 * ─── 扁平化 props 传递 ───
 * 宿主把业务组件原有的 props 直接作为独立属性传入，如
 *   <bi-xxx title="a" max-count="5" is-visible>
 * 包装层按属性名（kebab→camel）与声明类型解析后，作为独立 prop 传入组件。
 * 组件无需新增任何 config 属性，原有 props 即可直接复用。
 * scope 仍由框架作为独立 prop 注入（与业务 props 区分）。
 */
import Vue from 'vue';
import { createWidgetScope } from '../widget-scope/index.js';
import { onLocaleChange } from '../i18n/index.js';

// 告诉 Vue2 编译器 el-* 是自定义元素，不要当 Vue 组件解析
// 使用合并而非覆盖，避免污染基座或其他物料的 ignoredElements 配置
// 去重检查：同页多物料加载时避免重复添加 /^el-/
// 防御：Vue.config 可能不存在（如测试环境 mock），此时跳过
if (Vue && Vue.config) {
  const _existing = Array.isArray(Vue.config.ignoredElements) ? Vue.config.ignoredElements : [];
  const _hasEl = _existing.some(re => re instanceof RegExp && re.source === '^el-');
  if (!_hasEl) Vue.config.ignoredElements = [..._existing, /^el-/];
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
  // props 处理：connectedCallback/attributeChangedCallback 中调用 _collectProps
  // 把已设置的独立 prop 属性解析为值，存入 reactive data widgetProps，Vue 检测到
  // 引用变化后自动重渲染并传给业务组件。每次 _collectProps 返回新对象引用，确保
  // 业务组件的 watch: { xxx } / deep watch 都能触发。

  // 声明的 prop 名：剔除 scope（框架注入，非宿主传入）
  const individualPropNames = getDeclaredPropNames(Component)
    .filter(n => n !== 'scope');
  const attrToProp = new Map(individualPropNames.map(n => [camelToKebab(n), n]));
  // 观察的属性：仅各独立 prop 的 kebab attribute（去重）
  const observedAttrs = [...new Set(individualPropNames.map(camelToKebab))];

  class WidgetElement extends HTMLElement {
    constructor() {
      super();
      this.vm = null;
      this._offLocale = null;
      // 每个物料实例创建独立的 widgetScope 软隔离对象，
      // 物料组件通过 props.scope 接收，而非直接访问 window
      // 使用全局 bus 实例，确保 scope.bus 与基座总线共享同一通道
      this._scope = createWidgetScope({
        name: widgetName,
        busInstance: window.__wcGlobalBus__ || undefined
      });
      this._widgetScope = this._scope;
    }

    static get observedAttributes() {
      return observedAttrs;
    }

    connectedCallback() {
      // 防御性守卫：若未来误引入 attachShadow，立即告警（与 vue3/h5 wrapper 对齐）
      if (this.shadowRoot) {
        console.error(
          `[widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，` +
          'ElementUI 全局样式将无法穿透。请勿使用 attachShadow。'
        );
      }
      // 使用 reactive data 承载已解析的独立 props，
      // attributeChangedCallback 中更新即可触发响应式重渲染，无需依赖 $children 内部 API
      // 同时把 scope 作为 data 暴露给 render，注入到业务组件 props
      this.vm = new Vue({
        data: {
          widgetProps: this._collectProps(),
          widgetScope: this._scope
        },
        render(h) {
          return h(Component, { props: { ...this.widgetProps, scope: this.widgetScope } });
        }
      });
      this.vm.$mount();
      this.appendChild(this.vm.$el);
      // locale 变化时对物料组件实例本身调用 $forceUpdate 触发重渲染，
      // 组件内 t() 自然返回新语言文案（与 vue-cli-plugin / vue3-wrapper 行为对齐）
      // 必须 forceUpdate 物料组件（this.vm.$children[0]），而非外壳——
      // Vue2 在子组件 props 未变时不会重渲染子组件（已用真实 Vue2 验证）
      this._offLocale = onLocaleChange(() => {
        const widget = this.vm && this.vm.$children && this.vm.$children[0];
        if (widget) widget.$forceUpdate();
      });
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
      if (this._offLocale) { this._offLocale(); this._offLocale = null; }
      if (this.vm) {
        this.vm.$destroy();
        this.vm = null;
        // 清理 scope bus 上所有 window 事件监听器，防止泄漏
        if (this._scope && typeof this._scope.destroy === 'function') this._scope.destroy();
        this._scope = null;
        this._widgetScope = null;
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (!this.vm || oldValue === newValue) return;
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
// 此时跳过自动注册（仅导出 createWidgetWrapper 供测试），
// 不影响生产构建行为。
if (typeof require !== 'undefined') {
  const Component = require(componentPath).default;
  const WidgetElement = createWidgetWrapper(Component, widgetName);
  customElements.define(widgetName, WidgetElement);
}
