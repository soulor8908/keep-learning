/**
 * 轻量 widgetScope 软隔离对象
 *
 * 目标：每个物料包装层创建一个 widgetScope 对象，物料通过 props 接收，
 * 而非直接访问 window/document。形成"软隔离"——不用 Shadow DOM / iframe，
 * 但通过受控 API 表面限制物料对全局环境的直接依赖。
 *
 * 软隔离能解决什么：
 * - 物料不再 window.xxx 直接读写 → 避免 全局变量污染、误改基座状态
 * - 事件总线按物料名命名空间隔离 → 避免 物料间事件名冲突
 * - 上下文只读快照 → 避免 物料反向修改基座上下文
 * - 受控的日志/请求/i18n → 统一注入鉴权、locale、前缀，便于治理
 * - 多 Host 场景：每个 Host 的 scope 互不影响（createWidgetScope 工厂）
 *
 * 软隔离不能解决什么（需配合其它机制）：
 * - 样式隔离 → 由 postcss-namespace + scoped CSS 负责
 * - JS 沙箱（恶意代码）→ 需 iframe/Worker，软隔离只防"误伤"不防"攻击"
 * - DOM 结构隔离 → light DOM 共享，靠命名空间约定
 *
 * 用法（基座 / wrapper 层创建并注入）：
 *   import { createWidgetScope } from 'wc/widget-scope';
 *   const scope = createWidgetScope({
 *     name: 'bi-sales-panel',
 *     version: '1.0.0',
 *     host: 'dashboard-vue2'
 *   });
 *   // 作为 prop 传给物料组件：
 *   <Component :scope="scope" :config="config" />
 *
 * 物料内部使用：
 *   props: { scope: Object, config: Object }
 *   const user = scope.context.get('user');
 *   const off = scope.context.onChange('user', u => refresh(u));
 *   scope.bus.emit('resize', { width: 100 });
 *   scope.log('info', 'mounted');
 *   scope.t('title');
 */

// ─── 懒加载依赖：仅在物料实际调用对应 API 时才 import，减小首屏体积 ───
let contextModulePromise = null;
function getContextModule() {
  if (!contextModulePromise) {
    contextModulePromise = import('../widget-context/index.js');
  }
  return contextModulePromise;
}

let busModulePromise = null;
function getBusModule() {
  if (!busModulePromise) {
    busModulePromise = import('../widget-bus/index.js');
  }
  return busModulePromise;
}

let i18nModulePromise = null;
function getI18nModule() {
  if (!i18nModulePromise) {
    i18nModulePromise = import('../i18n/index.js');
  }
  return i18nModulePromise;
}

let loaderModulePromise = null;
function getLoaderModule() {
  if (!loaderModulePromise) {
    loaderModulePromise = import('../widget-loader/index.js');
  }
  return loaderModulePromise;
}

// ─── 嵌套加载的循环依赖检测 ───
// pendingAncestors: 物料名 -> 祖先物料名集合
// 父物料通过 scope.loader.loadWidget(child) 加载子物料时，会把
// [父自身名 + 父的祖先链] 写入 pendingAncestors[child.name]；
// 子物料的 wrapper 调用 createWidgetScope({name: child.name}) 时，
// 自动取出并继承该祖先链，从而支持多级嵌套的循环检测（A→B→A）。
const pendingAncestors = new Map();

/**
 * 读取并清除待继承的祖先链（供 createWidgetScope 内部调用）
 * @param {string} widgetName
 * @returns {Set<string>|null}
 */
function consumePendingAncestors(widgetName) {
  if (pendingAncestors.has(widgetName)) {
    const set = pendingAncestors.get(widgetName);
    pendingAncestors.delete(widgetName);
    return set;
  }
  return null;
}

/**
 * 为即将被加载的子物料设置祖先链（供 scope.loader 内部调用）
 * @param {string} childName 子物料名
 * @param {Set<string>} ancestors 祖先物料名集合
 */
function setPendingAncestors(childName, ancestors) {
  pendingAncestors.set(childName, ancestors);
}

/**
 * 创建一个物料的 widgetScope 软隔离对象
 * @param {object} opts
 * @param {string} opts.name 物料名（Custom Element 名），用作 bus 命名空间与日志前缀
 * @param {string} [opts.version] 物料版本
 * @param {string} [opts.host] 宿主标识（如 'dashboard-vue2'），用于多 Host 区分
 * @param {object} [opts.contextInstance] 自定义上下文实例（多 Host 场景），不传用全局
 * @param {object} [opts.busInstance] 自定义 bus 实例，不传则按 name 创建命名空间 bus
 * @returns {object} 冻结的 widgetScope 对象
 */
export function createWidgetScope(opts = {}) {
  const { name, version, host } = opts;
  if (!name) {
    throw new Error('[widget-scope] opts.name is required');
  }

  // ─── 祖先链继承（嵌套加载循环检测）───
  // 若父物料通过 scope.loader 加载本物料，会在 pendingAncestors 中预置祖先链。
  // 此处取出并继承；同时支持 opts.ancestors 显式传入（多 Host 场景）。
  const inheritedAncestors = consumePendingAncestors(name);
  const ancestorSet = new Set(
    opts.ancestors
      ? opts.ancestors
      : (inheritedAncestors ? Array.from(inheritedAncestors) : [])
  );

  // ─── 命名空间隔离的事件总线 ───
  // 每个物料用自身 name 作为命名空间，避免不同物料的事件名碰撞
  // 例如 bi-sales-panel 的 'resize' 与 bi-finance-panel 的 'resize' 互不干扰
  const busNS = name;
  let _bus = null;
  function getBus() {
    if (_bus) return _bus;
    if (opts.busInstance) { _bus = opts.busInstance; return _bus; }
    // 懒加载：首次调用时才 import widget-bus 并创建命名空间实例
    _bus = getBusModule().then(m => {
      const factory = m.createBus || m.default;
      const bus = typeof factory === 'function' ? factory(busNS) : m.defaultBus;
      // 缓存已解析的实例，覆盖 promise
      _bus = bus;
      return bus;
    });
    return _bus;
  }

  // ─── 只读上下文访问 ───
  // 物料只能 get/订阅，不能 set（set 走基座 setContext，避免反向耦合）
  const context = {
    /**
     * 获取上下文值（只读快照）
     * @param {string} [key] 不传返回整个上下文快照
     */
    async get(key) {
      const mod = await getContextModule();
      const inst = opts.contextInstance || mod;
      return typeof inst.get === 'function'
        ? inst.get(key)
        : (mod.getContext ? mod.getContext(key) : undefined);
    },
    /**
     * 订阅上下文变化，返回取消订阅函数
     */
    async onChange(key, cb) {
      const mod = await getContextModule();
      const inst = opts.contextInstance || mod;
      if (typeof inst.onChange === 'function') return inst.onChange(key, cb);
      if (typeof mod.onContextChange === 'function') return mod.onContextChange(key, cb);
      return () => {};
    }
  };

  // ─── 命名空间事件总线便捷方法 ───
  // 软隔离原则：bus 失败不应 crash 物料渲染，统一 try/catch 并记日志
  //
  // on/once 同步返回 unsubscribe 函数（与主流事件库约定一致）：
  // - bus 就绪前调用 on：先返回 unsubscribe，bus 就绪后在微任务中补注册；
  //   若 unsubscribe 已被调用（disposed=true），则跳过注册，避免回调泄漏。
  // - bus 就绪后调用 on：realOff 在微任务中被赋值，unsubscribe 调用时清理。
  // - emit 保持 async fire-and-forget。
  const bus = {
    async emit(type, payload, options) {
      try {
        const b = await getBus();
        if (b && b.emit) b.emit(type, payload, options);
      } catch (e) {
        log.error('bus.emit failed:', e.message);
      }
    },
    on(type, cb) {
      let realOff = null;
      let disposed = false;
      // getBus() 可能返回 Promise（首次懒加载）或已解析的实例，统一用 Promise.resolve 包裹
      Promise.resolve(getBus()).then(b => {
        if (disposed) return;
        if (b && typeof b.on === 'function') realOff = b.on(type, cb);
      }).catch(e => log.error('bus.on failed:', e.message));
      return () => {
        disposed = true;
        if (realOff) {
          try { realOff(); } catch (e) { /* ignore */ }
          realOff = null;
        }
      };
    },
    once(type, cb) {
      let realOff = null;
      let disposed = false;
      Promise.resolve(getBus()).then(b => {
        if (disposed) return;
        if (b && typeof b.once === 'function') realOff = b.once(type, cb);
      }).catch(e => log.error('bus.once failed:', e.message));
      return () => {
        disposed = true;
        if (realOff) {
          try { realOff(); } catch (e) { /* ignore */ }
          realOff = null;
        }
      };
    }
  };

  // ─── 受控日志（自动加物料名前缀，便于排查）───
  const log = {
    info: (...args) => console.log(`[${name}]`, ...args),
    warn: (...args) => console.warn(`[${name}]`, ...args),
    error: (...args) => console.error(`[${name}]`, ...args),
    debug: (...args) => {
      // debug 默认关闭，可通过 localStorage 开启，避免生产噪音
      try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('widget-scope-debug') === 'true') {
          console.log(`[${name}:debug]`, ...args);
        }
      } catch (e) { /* ignore */ }
    }
  };

  // ─── i18n 翻译（共享基座 locale 状态）───
  async function t(key, params) {
    const mod = await getI18nModule();
    if (typeof mod.t === 'function') return mod.t(key, params);
    return key;
  }

  // ─── 环境元信息（只读）───
  const meta = Object.freeze({
    name,
    version: version || '',
    host: host || '',
    // 标记为 widgetScope，便于物料侧校验 props
    __isWidgetScope: true
  });

  // ─── 受控的 fetch 封装（可选注入鉴权头，避免物料裸调 fetch 漏带 token）───
  // 不直接暴露 window.fetch，物料统一走 scope.request，便于基座注入拦截器
  let _requestInterceptors = [];
  async function request(url, options = {}) {
    const merged = { ...options };
    merged.headers = { ...options.headers };
    // 应用注入的拦截器（如添加 Authorization）
    for (const interceptor of _requestInterceptors) {
      try { await interceptor(merged, meta); } catch (e) { /* ignore interceptor errors */ }
    }
    if (typeof globalThis.fetch !== 'function') {
      throw new Error('[widget-scope] fetch is not available in this environment');
    }
    return globalThis.fetch(url, merged);
  }
  request.addInterceptor = (fn) => {
    if (typeof fn === 'function') _requestInterceptors.push(fn);
    return () => { _requestInterceptors = _requestInterceptors.filter(f => f !== fn); };
  };

  // ─── 嵌套物料加载器（带循环依赖检测）───
  // 物料可通过 scope.loader.loadWidget(child) / mountWidget(container, child)
  // 加载子物料，无需直接访问基座 loader。
  //
  // 循环检测策略：
  // - 直接自引用（child.name === 自身 name）→ 立即抛错
  // - child.name 在祖先链中（如 A→B→A）→ 立即抛错
  // - 否则把 [自身名 + 祖先链] 写入 pendingAncestors[child.name]，
  //   子物料 createWidgetScope 时自动继承，支持多级嵌套检测
  function checkCycle(childName) {
    if (childName === name) {
      const chain = [...ancestorSet, name, childName].join(' -> ');
      throw new Error(`[widget-scope] 循环加载检测: 物料 ${name} 试图加载自身。链路: ${chain}`);
    }
    if (ancestorSet.has(childName)) {
      const chain = [...ancestorSet, name, childName].join(' -> ');
      throw new Error(`[widget-scope] 循环加载检测: 物料 ${name} 试图加载祖先物料 ${childName}。链路: ${chain}`);
    }
  }
  function propagateAncestors(childName) {
    const childAncestors = new Set([...ancestorSet, name]);
    setPendingAncestors(childName, childAncestors);
  }

  const loader = {
    /**
     * 加载子物料资源（JS/CSS），不挂载
     * @param {object} widget 子物料配置 { name, js, css, vueVersion? }
     */
    async loadWidget(widget) {
      if (!widget || !widget.name) throw new Error('[widget-scope] loader.loadWidget: widget.name required');
      checkCycle(widget.name);
      propagateAncestors(widget.name);
      const mod = await getLoaderModule();
      const inst = mod.defaultLoader || mod;
      return inst.loadWidget(widget);
    },
    /**
     * 加载并挂载子物料到指定容器
     * @param {HTMLElement} container
     * @param {object} widget
     * @returns {Promise<HTMLElement>} 挂载的物料元素
     */
    async mountWidget(container, widget) {
      if (!widget || !widget.name) throw new Error('[widget-scope] loader.mountWidget: widget.name required');
      checkCycle(widget.name);
      propagateAncestors(widget.name);
      const mod = await getLoaderModule();
      const inst = mod.defaultLoader || mod;
      return inst.mountWidget(container, widget);
    },
    /**
     * 卸载子物料元素
     * @param {HTMLElement} element
     */
    async unmountWidget(element) {
      const mod = await getLoaderModule();
      const inst = mod.defaultLoader || mod;
      return inst.unmountWidget(element);
    }
  };

  // 组装并冻结 scope，防止物料随意扩展
  const scope = Object.freeze({
    meta,
    context,
    bus,
    log,
    t,
    request,
    loader,
    // 显式声明：scope 不提供 window/document 直接访问（软隔离约束）
    // 物料若强引用 window 会被 js-risk-scanner 在构建期告警
    __noGlobalAccess: true
  });

  return scope;
}

/**
 * 判断一个对象是否为 widgetScope 实例
 * @param {*} obj
 * @returns {boolean}
 */
export function isWidgetScope(obj) {
  return obj && obj.meta && obj.meta.__isWidgetScope === true && obj.__noGlobalAccess === true;
}

export default createWidgetScope;
