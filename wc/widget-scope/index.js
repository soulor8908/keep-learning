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

// widget-bus 同步引入：事件总线 emit/on/once 本身是同步 API（基于 window.dispatchEvent），
// 为保证 scope.bus 同步语义（基座同步监听器在同一事件循环内收到事件），必须同步可用，
// 故不再懒加载。widget-bus 体积极小且与 widget-scope 同属基座侧运行时（widget-scope 经
// external 由基座 window.__wcWidgetScope__ 提供），同步引入不影响物料包首屏体积。
import { createBus } from '../widget-bus/index.js';
// widget-context / i18n 同步引入（K2）：保证 scope.context.get/onChange/t
// 同步语义与全局 API 一致，消除"同一上下文两套异步语义"的心智负担。
// widget-bus 已同步引入（上方），widget-loader 保持懒加载（loadWidget 本身是异步操作）。
import { getContext, onContextChange } from '../widget-context/index.js';
import { t as i18nT } from '../i18n/index.js';

// loader 保持懒加载（loadWidget 是真正的异步操作）
let loaderModulePromise = null;
function getLoaderModule() {
  if (!loaderModulePromise) {
    loaderModulePromise = import('../widget-loader/index.js');
  }
  return loaderModulePromise;
}

// ─── 嵌套加载的循环依赖检测 ───
// 父物料通过 scope.loader.loadWidget(child) 加载子物料时，会把
// [父自身名 + 父的祖先链] 写入待继承区；子物料的 wrapper 调用
// createWidgetScope({name: child.name, host}) 时自动取出并继承，支持多级嵌套循环检测（A→B→A）。
//
// 多 Host 隔离（修复 N5）：原为单一模块级 Map，微前端/iframe 嵌套场景下
// A Host 的祖先链可能被 B Host 的同名物料消费，导致循环检测误判。现按 host 分桶：
// pendingAncestorsByHost: host -> Map(widgetName -> Set<ancestor>)
// 父写入用父的 host，子读取用子的 host；同 host 内行为与原实现一致（host='' 时即单桶）。
// 注：当前 wrapper 模板未传 host（默认 ''），所有 scope 落入同一空桶，与历史行为完全一致；
//     基座若需多 Host 隔离，应在 createWidgetScope opts 中显式传入不同的 host 标识。
const pendingAncestorsByHost = new Map();

function getAncestorBucket(host) {
  const key = host || '';
  let bucket = pendingAncestorsByHost.get(key);
  if (!bucket) { bucket = new Map(); pendingAncestorsByHost.set(key, bucket); }
  return bucket;
}

/**
 * 读取并清除待继承的祖先链（供 createWidgetScope 内部调用）
 * @param {string} widgetName
 * @param {string} [host] 宿主标识，用于多 Host 分桶
 * @returns {Set<string>|null}
 */
function consumePendingAncestors(widgetName, host) {
  const bucket = getAncestorBucket(host);
  if (bucket.has(widgetName)) {
    const set = bucket.get(widgetName);
    bucket.delete(widgetName);
    return set;
  }
  return null;
}

/**
 * 为即将被加载的子物料设置祖先链（供 scope.loader 内部调用）
 * @param {string} childName 子物料名
 * @param {Set<string>} ancestors 祖先物料名集合
 * @param {string} [host] 宿主标识，用于多 Host 分桶
 */
function setPendingAncestors(childName, ancestors, host) {
  getAncestorBucket(host).set(childName, ancestors);
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
  // 若父物料通过 scope.loader 加载本物料，会在对应 host 的待继承桶中预置祖先链。
  // 此处取出并继承；同时支持 opts.ancestors 显式传入（多 Host 场景）。
  const inheritedAncestors = consumePendingAncestors(name, host);
  const ancestorSet = new Set(
    opts.ancestors
      ? opts.ancestors
      : (inheritedAncestors ? Array.from(inheritedAncestors) : [])
  );

  // ─── 命名空间隔离的事件总线（同步）───
  // 每个物料用自身 name 作为命名空间，避免不同物料的事件名碰撞
  // 例如 bi-sales-panel 的 'resize' 与 bi-finance-panel 的 'resize' 互不干扰
  // bus 实例在 scope 创建时同步构建：opts.busInstance 优先，否则用 createBus(name)。
  // 同步构建保证 scope.bus.emit/on/once 是同步调用——基座同步监听器在同一事件循环
  // 内即可收到事件，避免初始化时同步请求数据丢失时机（修复 N1/N2）。
  const busNS = name;
  const busInstance = opts.busInstance || createBus(busNS);

  // ─── 只读上下文访问 ───
  // 物料只能 get/订阅，不能 set（set 走基座 setContext，避免反向耦合）
  const context = {
    /**
     * 获取上下文值（只读快照，同步返回）
     * @param {string} [key] 不传返回整个上下文快照
     */
    get(key) {
      if (opts.contextInstance) {
        return typeof opts.contextInstance.get === 'function'
          ? opts.contextInstance.get(key) : undefined;
      }
      return getContext(key);
    },
    /**
     * 订阅上下文变化，同步返回取消订阅函数
     */
    onChange(key, cb) {
      if (opts.contextInstance) {
        return typeof opts.contextInstance.onChange === 'function'
          ? opts.contextInstance.onChange(key, cb) : (() => {});
      }
      return onContextChange(key, cb);
    }
  };

  // ─── 命名空间事件总线便捷方法（同步）───
  // 与 widget-bus 的同步 API 对齐：emit/on/once 不再是 async，派发不推迟到 microtask，
  // 返回值也与 widget-bus 一致（emit: void, on/once: 取消订阅函数）。
  // on/once 同步返回 unsubscribe 函数（与主流事件库约定一致）：busInstance 在 scope
  // 创建时已同步构建，故 on/once 直接同步注册并返回取消订阅函数，无需微任务延迟。
  // 软隔离原则：bus 失败不应 crash 物料渲染，统一 try/catch 并记日志。
  const bus = {
    emit(type, payload, options) {
      try {
        if (busInstance && busInstance.emit) busInstance.emit(type, payload, options);
      } catch (e) {
        log.error('bus.emit failed:', e.message);
      }
    },
    on(type, cb) {
      try {
        if (busInstance && busInstance.on) return busInstance.on(type, cb);
      } catch (e) {
        log.error('bus.on failed:', e.message);
      }
      return () => {};
    },
    once(type, cb) {
      try {
        if (busInstance && busInstance.once) return busInstance.once(type, cb);
      } catch (e) {
        log.error('bus.once failed:', e.message);
      }
      return () => {};
    },
    off(type, cb) {
      try {
        if (busInstance && busInstance.off) busInstance.off(type, cb);
      } catch (e) {
        log.error('bus.off failed:', e.message);
      }
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

  // ─── i18n 翻译（同步，共享基座 locale 状态）───
  function t(key, params) {
    return i18nT(key, params);
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
    return () => {
      const idx = _requestInterceptors.indexOf(fn);
      if (idx >= 0) _requestInterceptors.splice(idx, 1);
    };
  };

  // ─── 嵌套物料加载器（带循环依赖检测）───
  // 物料可通过 scope.loader.loadWidget(child) / mountWidget(container, child)
  // 加载子物料，无需直接访问基座 loader。
  //
  // 循环检测策略：
  // - 直接自引用（child.name === 自身 name）→ 立即抛错
  // - child.name 在祖先链中（如 A→B→A）→ 立即抛错
  // - 否则把 [自身名 + 祖先链] 写入对应 host 的待继承桶[child.name]，
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
    setPendingAncestors(childName, childAncestors, host);
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
      try {
        return await inst.loadWidget(widget);
      } catch (e) {
        // 失败回滚：清除预置的祖先链，避免泄漏 + 循环检测误判（N11）
        const bucket = getAncestorBucket(host);
        bucket.delete(widget.name);
        throw e;
      }
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
      try {
        return await inst.mountWidget(container, widget);
      } catch (e) {
        // 失败回滚：清除预置的祖先链，避免泄漏 + 循环检测误判（N11）
        const bucket = getAncestorBucket(host);
        bucket.delete(widget.name);
        throw e;
      }
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
    // 销毁 scope：移除 bus 上所有 window 事件监听器，防止物料卸载后监听器泄漏
    // wrapper disconnectedCallback 中调用，无需物料手动清理每个 on() 返回的取消函数
    destroy: () => {
      if (typeof busInstance.destroy === 'function') busInstance.destroy();
    },
    // 显式声明：scope 不提供 window/document 直接访问（软隔离约束）
    // 物料若强引用 window 会被 js-risk-scanner 在构建期告警
    __noGlobalAccess: true
  });

  return scope;
}

/**
 * 判断一个对象是否为 widgetScope 实例
 *
 * 身份判据统一收敛到 meta.__isWidgetScope：meta 在创建时即 Object.freeze，
 * 是 scope 的身份对象，会随任何合理的拷贝（解构、Object.assign、展开）自然传递。
 *
 * 不再同时校验顶层 __noGlobalAccess——它是"不直接访问 window/document"的能力契约标记，
 * 而非身份标识。物料若通过解构重建 scope（如
 *   const { meta, context, bus } = scope; const copy = { meta, context, bus }
 * ），__noGlobalAccess 会丢失但 meta 仍在，旧逻辑会误判 copy 非 widgetScope。
 * 改为只认 meta.__isWidgetScope 即可消除该误判。
 *
 * @param {*} obj
 * @returns {boolean}
 */
export function isWidgetScope(obj) {
  return !!(obj && obj.meta && obj.meta.__isWidgetScope === true);
}

export default createWidgetScope;

// 挂载到全局，供物料 external 'wc-widget-scope' 引用
// 必须是含 createWidgetScope 属性的对象（模块命名空间形态），
// 与 wrapper 的 named import `import { createWidgetScope } from 'wc-widget-scope'` 匹配
// 幂等：多次求值（多 bundle 引入）不覆盖已有实例，避免状态分裂
if (typeof window !== 'undefined') {
  if (!window.__wcWidgetScope__) {
    window.__wcWidgetScope__ = { createWidgetScope, isWidgetScope };
  }
  // 暴露全局 bus 实例，供 widget-wrapper 在创建 scope 时注入
  // 这样 scope.bus 与基座总线共享同一通道，物料 emit 的事件基座可直接 on 到
  if (!window.__wcGlobalBus__) {
    window.__wcGlobalBus__ = createBus();
  }
}
