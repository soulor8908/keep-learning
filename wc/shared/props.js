/**
 * 共享工具函数
 *
 * camelToKebab / parseAttrValue 在 widget-loader、h5-widget-template、
 * vue2-widget-template、vue3-widget-template 各实现一份，提取为统一模块。
 * 物料构建时 external 化（见 widget-wrapper-plugin），不增加物料包体积。
 */

/**
 * camelCase → kebab-case
 * @param {string} str
 * @returns {string}
 */
export function camelToKebab(str) {
  return String(str).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * 按属性值与 prop 类型解析为最终传入组件的值
 *
 * - Boolean 类型：遵循 HTML 布尔属性语义（存在即 true，"false" 为 false）
 * - 其它类型：优先 JSON.parse，失败则回退为原始字符串
 * - null → undefined（表示未设置）
 *
 * @param {string|null} raw 属性原始值
 * @param {Function|Function[]|null} type prop 声明类型构造器（Vue wrapper 场景），
 *   不传则按通用规则解析（H5 wrapper 场景）
 * @returns {any}
 */
export function parseAttrValue(raw, type) {
  // Boolean 类型语义
  if (type === Boolean) {
    if (raw === '' || raw === 'true') return true;
    if (raw === 'false') return false;
    return true;
  }
  if (raw === null) return undefined;
  // H5 场景（无 type 参数）：空 attribute 也视为 true
  if (type === undefined && raw === '') return true;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

/**
 * 提取业务组件声明的 prop 名列表
 * 支持 Options API 的 props（数组 / 对象）与 defineProps 编译产物
 * @param {object} Component Vue 组件选项对象
 * @returns {string[]}
 */
export function getDeclaredPropNames(Component) {
  const props = Component && Component.props;
  if (!props) return [];
  if (Array.isArray(props)) return props.filter(p => typeof p === 'string');
  return Object.keys(props);
}

/**
 * 取某个 prop 的声明类型构造器（或构造器数组）
 * @param {object} Component
 * @param {string} name
 * @returns {Function|Function[]|null}
 */
export function getPropType(Component, name) {
  const props = Component && Component.props;
  if (!props || Array.isArray(props)) return null;
  const def = props[name];
  if (!def) return null;
  if (Array.isArray(def)) return def;
  if (typeof def === 'function') return def;
  return def.type || null;
}
