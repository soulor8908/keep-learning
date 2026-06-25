/**
 * Vue3 物料组件自动包装器
 * 使用方式：vite.config.js 中把入口设为此文件
 * 通过构建工具注入的全局变量 __WIDGET_NAME__ 和 __WIDGET_COMPONENT__ 指定
 *
 * 说明：不使用 import.meta.env（Vite 特有），改用构建工具 define 注入的
 * 全局变量 __WIDGET_NAME__ / __WIDGET_COMPONENT__，使本文件可被 webpack 等
 * 其他工具处理（通过 NormalModuleReplacementPlugin 或 DefinePlugin 注入）。
 *
 * ─── config 与 props 双模兼容 ───
 * 包装层同时支持两种传参方式，业务组件改造时无需额外添加 config 属性：
 *   1. config 模式（向后兼容）：宿主写 <bi-xxx config='{"title":"a"}'>，
 *      包装层解析为 Object，作为 config prop 传入（组件需声明 props.config）。
 *   2. props 模式（推荐）：宿主把业务组件原有的 props 直接作为属性传入，
 *      如 <bi-xxx title="a" :count="5">，包装层按属性名（kebab→camel）解析后
 *      作为独立 prop 传入，组件无需新增 config，原有 props 即可直接复用。
 * 两种模式可混用：config 提供聚合配置，个别 props 显式覆盖。
 *
 * ─── 重要：禁止使用 Shadow DOM ───
 * 不要改用 Vue3 官方的 defineCustomElement()——它默认调用 attachShadow()，
 * 会把物料样式完全隔离，导致基座注入的 ElementPlus 全局样式 / 主题变量 / 字体图标无法穿透。
 * 本包装层手写 HTMLElement + createApp().mount(this)，挂载到 light DOM，
 * 与"不开启 Shadow DOM"的架构决策保持一致。
 */
import { createApp, h, ref } from 'vue';
import { createWidgetScope } from '../widget-scope/index.js';

function parseConfig(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (e) {
    console.error(`[${__WIDGET_NAME__}] config parse error:`, e);
    return {};
  }
}

// camelCase → kebab-case，用于把 prop 名映射为可观察的 attribute 名
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * 提取业务组件声明的 prop 名列表
 * 支持 Options API 的 props（数组 / 对象）与 <script setup> 编译后的 defineProps 产物
 */
function getDeclaredPropNames(Component) {
  const props = Component && Component.props;
  if (!props) return [];
  if (Array.isArray(props)) return props.filter(p => typeof p === 'string');
  return Object.keys(props);
}

/**
 * 取某个 prop 的声明类型构造器（或构造器数组），用于按类型解析属性值
 * 仅对对象式 props 有效；数组式 props 返回 null（按 JSON 推断）
 * 支持三种声明形式：
 *   - 简写：  props: { a: String }            → def 是构造器，直接返回
 *   - 简写数组：props: { a: [String, Number] }  → def 是数组，直接返回
 *   - 完整：  props: { a: { type: String } }   → def 是对象，返回 def.type
 */
function getPropType(Component, name) {
  const props = Component && Component.props;
  if (!props || Array.isArray(props)) return null;
  const def = props[name];
  if (!def) return null;
  // 简写数组形式：a: [String, Number]
  if (Array.isArray(def)) return def;
  // 简写形式：a: String（构造器本身）。函数的 .type 属性为 undefined，需直接返回构造器
  if (typeof def === 'function') return def;
  // 完整形式：a: { type: String }
  return def.type || null;
}

/**
 * 按属性值与 prop 类型解析为最终传入组件的值
 * - Boolean 类型：遵循 HTML 布尔属性语义（存在即 true，"false" 为 false）
 * - 其它类型：优先 JSON.parse（与 config 协议一致，无歧义），失败则回退为原始字符串
 */
function parseAttrValue(raw, type) {
  if (type === Boolean) {
    if (raw === '' || raw === 'true') return true;
    if (raw === 'false') return false;
    return true; // 任何非 "false" 的值都视为 true（属性存在即启用）
  }
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

export function createWidgetWrapper(Component, widgetName) {
  // 声明的 prop 名：剔除 config（由专用 configRef 处理）与 scope（框架注入，非宿主传入）
  const individualPropNames = getDeclaredPropNames(Component)
    .filter(n => n !== 'config' && n !== 'scope');
  // attribute 名 → prop 名 映射，用于 attributeChangedCallback 反查
  const attrToProp = new Map(individualPropNames.map(n => [camelToKebab(n), n]));
  // 观察的属性：config（向后兼容）+ 各独立 prop 的 kebab attribute（去重）
  const observedAttrs = [...new Set(['config', ...individualPropNames.map(camelToKebab)])];
  const declaresConfig = getDeclaredPropNames(Component).includes('config');

  return class WidgetElement extends HTMLElement {
    constructor() {
      super();
      this.app = null;
      this._configRef = null;
      // 独立 props 的响应式容器：变化时整体替换 value 触发重渲染
      this._propsRef = null;
      // 每个物料实例创建独立的 widgetScope 软隔离对象，
      // 物料组件通过 props.scope 接收，而非直接访问 window。
      this._scope = createWidgetScope({ name: widgetName });
      // 同时挂到元素实例，供非 Vue 物料/调试读取
      this._widgetScope = this._scope;
    }

    static get observedAttributes() {
      return observedAttrs;
    }

    connectedCallback() {
      // 防御性守卫：若未来误引入 attachShadow / defineCustomElement，立即告警
      if (this.shadowRoot) {
        console.error(
          `[widget-wrapper] 物料 ${widgetName} 检测到 shadowRoot，` +
          'ElementPlus 全局样式将无法穿透。请勿使用 defineCustomElement 或 attachShadow。'
        );
      }
      this._mount();
    }

    // 挂载：仅首次创建 app 与 reactive refs
    _mount() {
      if (this.app) return; // 已挂载，属性变化由 _updateConfig/_updateProp 处理
      // config 与 props 各用独立 ref 承载，render 中访问 .value 建立响应式依赖；
      // 任一变化时只需更新对应 ref.value，Vue3 自动触发重渲染，无需 unmount/remount
      this._configRef = ref(parseConfig(this.getAttribute('config')));
      this._propsRef = ref(this._collectProps());
      this.app = createApp({
        // 注入 scope（必传）+ config（仅当组件声明时）+ 各独立 prop
        render: () => {
          const passProps = { ...this._propsRef.value, scope: this._scope };
          if (declaresConfig) {
            passProps.config = this._configRef.value;
          }
          return h(Component, passProps);
        }
      });
      this.app.mount(this);
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

    // config 变化时更新 ref，避免 unmount/remount 带来的性能损耗与状态丢失
    _updateConfig(newValue) {
      if (this._configRef) {
        this._configRef.value = parseConfig(newValue);
      }
    }

    // 独立 prop 属性变化时更新对应键，整体替换 value 触发重渲染
    _updateProp(propName, newValue) {
      if (!this._propsRef) return;
      const type = getPropType(Component, propName);
      this._propsRef.value = {
        ...this._propsRef.value,
        [propName]: parseAttrValue(newValue, type)
      };
    }

    disconnectedCallback() {
      if (this.app) {
        this.app.unmount();
        this.app = null;
        this._configRef = null;
        this._propsRef = null;
        this._scope = null;
        this._widgetScope = null;
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      // 首次挂载前 connectedCallback 会统一收集，这里只处理挂载后的变化
      if (oldValue === newValue) return;
      if (name === 'config') {
        // config 变化：更新 reactive ref，走标准公开 API，不触碰内部 _instance
        if (this.app) this._updateConfig(newValue);
        return;
      }
      // 独立 prop 属性变化
      const propName = attrToProp.get(name);
      if (propName && this.app) {
        this._updateProp(propName, newValue);
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
