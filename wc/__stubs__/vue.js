/**
 * 统一 Vue stub（仅供测试用）
 *
 * 同时满足 vue2-widget-template（默认导出 Vue 构造函数）与
 * vue3-widget-template（createApp/h/ref 命名导出）的测试需求。
 * 通过 vitest.config.js 的 resolve.alias 将裸模块 'vue' 指向本文件，
 * 避免 vi.mock 无法拦截 Vite 裸模块预解析的问题，也无需在
 * wc/vue{2,3}-widget-template/node_modules/vue/ 下放本地 stub。
 *
 * 行为约定（供测试断言）：
 * - vue2: new Vue(opts) 实例 $mount() 打 _mounted=true、$el 为真实 <div>；
 *   $destroy() 打 _destroyed=true。opts.data 上的字段挂到实例。
 * - vue3: createApp(opts).mount(el) 打 app._mounted=true、app._vnode 含
 *   { Component, props }（由 render 返回的 h() 占位）；unmount() 打 _unmounted。
 *   ref(v) 返回 { value: v }。
 */

// ─── vue3 命名导出 ───
export function ref(value) {
  return { value };
}

export function h(Component, props) {
  // 占位 vnode：测试断言 vnode.Component 与 vnode.props
  return { Component, props: props || {}, __isVNode: true };
}

export function createApp(opts) {
  const app = {
    _mounted: false,
    _unmounted: false,
    _vnode: null,
    mount(el) {
      this._mounted = true;
      // 调用 render 得到 vnode（h() 占位），供测试断言 props 注入
      try {
        this._vnode = typeof opts.render === 'function' ? opts.render() : null;
      } catch (e) {
        this._vnode = null;
      }
      // 渲染一个占位 DOM 节点，供 querySelector 断言
      if (el && typeof document !== 'undefined') {
        const marker = document.createElement('div');
        marker.setAttribute('data-mock-vue3', 'true');
        el.appendChild(marker);
      }
      return el;
    },
    unmount() {
      this._unmounted = true;
    }
  };
  return app;
}

export const nextTick = (cb) => Promise.resolve().then(() => cb && cb());

// ─── vue2 默认导出 ───
function Vue(options) {
  this.$options = options || {};
  this._mounted = false;
  this._destroyed = false;
  // 把 data 字段挂到实例（wrapper 通过 data 传 widgetProps/widgetScope）
  const data = typeof options.data === 'function' ? options.data() : (options.data || {});
  Object.assign(this, data);
  // render 函数存档（测试可检视）
  this.$render = options.render;
}

Vue.version = '2.6.14';

Vue.prototype.$mount = function () {
  this._mounted = true;
  // 生成真实 $el（<div>），供 wrapper appendChild 到 Custom Element
  if (typeof document !== 'undefined') {
    this.$el = document.createElement('div');
    this.$el.setAttribute('data-mock-vue2', 'true');
  } else {
    this.$el = {};
  }
  return this;
};

Vue.prototype.$destroy = function () {
  this._destroyed = true;
};

export default Vue;
