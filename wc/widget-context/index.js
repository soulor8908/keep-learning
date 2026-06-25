/**
 * 全局上下文注入 + 状态共享模块
 *
 * 此前物料只能通过 config attribute 接收展示配置，无法获取基座的
 * 用户信息、权限、全局筛选条件等上下文。卡片间共享用户/权限/筛选是高频需求。
 *
 * 本模块提供：
 * - 全局上下文存储（user/permissions/theme/tenant 等基座级共享数据）
 * - 上下文注入：mountWidget 时自动将上下文注入到物料元素
 * - 状态订阅：物料可订阅上下文变化，实时响应基座状态更新
 * - 与 widget-bus 集成：上下文变化时通过 bus 广播事件
 *
 * 设计要点：
 * - 跨技术栈通用：不依赖 Vue provide/inject（无法跨 Vue 应用边界）
 * - 响应式更新：上下文变化时通过事件通知所有订阅者
 * - 只读快照：物料获取的是上下文快照，不能直接修改（避免双向耦合）
 * - 命名空间隔离：多 Host 场景可用 createContext() 创建独立上下文
 *
 * 用法（基座）：
 *   import { setContext, getContext } from 'wc/widget-context';
 *   setContext({ user: { id: '1', name: '张三' }, permissions: ['read'] });
 *
 * 用法（物料）：
 *   import { getContext, onContextChange } from 'wc/widget-context';
 *   const { user } = getContext();
 *   onContextChange('user', (newUser) => { /* 更新物料 *\/ });
 */

// ─── 全局上下文存储 ───
// 使用模块级单例 + window 挂载，确保跨技术栈（Vue2/Vue3/原生）共享同一实例
const GLOBAL_KEY = '__wcContext__';

function getStore() {
  if (typeof window === 'undefined') return null;
  if (!window[GLOBAL_KEY]) {
    window[GLOBAL_KEY] = {
      data: {},           // 上下文数据 { user, permissions, theme, ... }
      listeners: new Map() // key -> Set<callback>
    };
  }
  return window[GLOBAL_KEY];
}

/**
 * 设置全局上下文（合并模式）
 * @param {object} partial 要更新的上下文片段，如 { user: {...} }
 * @param {object} [opts]
 * @param {boolean} [opts.broadcast=true] 是否通过 widget-bus 广播变化事件
 */
export function setContext(partial, opts = {}) {
  const { broadcast = true } = opts;
  const store = getStore();
  if (!store) return;

  const changedKeys = [];
  for (const key of Object.keys(partial)) {
    const oldValue = store.data[key];
    const newValue = partial[key];
    // 浅比较：值不同才更新和通知
    if (oldValue !== newValue) {
      store.data[key] = newValue;
      changedKeys.push(key);
    }
  }

  // 通知订阅者
  changedKeys.forEach(key => {
    const callbacks = store.listeners.get(key);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(store.data[key], partial);
        } catch (e) {
          console.error(`[widget-context] context change callback error for "${key}":`, e);
        }
      });
    }
  });

  // 通过 widget-bus 广播（让跨技术栈物料都能收到）
  if (broadcast && changedKeys.length > 0 && typeof window !== 'undefined' && window.widgetBus) {
    window.widgetBus.emit('context-change', { keys: changedKeys, context: { ...store.data } });
  }
}

/**
 * 获取全局上下文（只读快照）
 * @param {string} [key] 可选，只获取指定 key 的值；不传则返回整个上下文
 * @returns {*} 上下文值或整个上下文对象
 */
export function getContext(key) {
  const store = getStore();
  if (!store) return key ? undefined : {};
  if (key) return store.data[key];
  // 返回浅拷贝，避免物料直接修改内部状态
  return { ...store.data };
}

/**
 * 订阅上下文变化
 * @param {string} key 要订阅的上下文 key（如 'user'、'permissions'）
 * @param {function} callback 回调，接收 (newValue, partial)
 * @returns {function} 取消订阅
 */
export function onContextChange(key, callback) {
  const store = getStore();
  if (!store) return () => {};

  if (!store.listeners.has(key)) {
    store.listeners.set(key, new Set());
  }
  store.listeners.get(key).add(callback);

  // 返回取消订阅函数
  return () => {
    const callbacks = store.listeners.get(key);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        store.listeners.delete(key);
      }
    }
  };
}

/**
 * 清除指定 key 的上下文
 * @param {string} key
 */
export function clearContext(key) {
  const store = getStore();
  if (!store) return;
  delete store.data[key];
  // 通知订阅者值为 undefined
  const callbacks = store.listeners.get(key);
  if (callbacks) {
    callbacks.forEach(cb => {
      try { cb(undefined); } catch (e) { /* ignore */ }
    });
  }
}

// ─── 多 Host 场景：独立上下文实例 ───
// 与 widget-bus 的 createBus 类似，为 iframe/微前端场景创建隔离的上下文

/**
 * 创建独立的上下文实例（多 Host 场景）
 * @returns {object} 独立上下文实例，API 与全局版本一致
 */
export function createContext() {
  const data = {};
  const listeners = new Map();

  return {
    set(partial, opts = {}) {
      const { broadcast = true } = opts;
      const changedKeys = [];
      for (const key of Object.keys(partial)) {
        if (data[key] !== partial[key]) {
          data[key] = partial[key];
          changedKeys.push(key);
        }
      }
      changedKeys.forEach(key => {
        const callbacks = listeners.get(key);
        if (callbacks) {
          callbacks.forEach(cb => {
            try { cb(data[key], partial); } catch (e) { /* ignore */ }
          });
        }
      });
      if (broadcast && changedKeys.length > 0 && typeof window !== 'undefined' && window.widgetBus) {
        window.widgetBus.emit('context-change', { keys: changedKeys, context: { ...data } });
      }
    },
    get(key) {
      if (key) return data[key];
      return { ...data };
    },
    onChange(key, callback) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(callback);
      return () => {
        const callbacks = listeners.get(key);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) listeners.delete(key);
        }
      };
    },
    clear(key) {
      delete data[key];
      const callbacks = listeners.get(key);
      if (callbacks) {
        callbacks.forEach(cb => { try { cb(undefined); } catch (e) { /* ignore */ } });
      }
    }
  };
}

// ─── 物料侧便捷 API ───
// 物料 wrapper 可调用 injectContext(element) 将上下文注入到元素属性上，
// 这样物料组件内部可通过 element.getAttribute('data-context') 或
// element._wcContext 读取上下文

/**
 * 安全序列化：跳过循环引用，保证 JSON.stringify 不抛错。
 * 仅在普通 JSON.stringify 失败（如上下文含 Vue 响应式对象/DOM 引用形成的环）时兜底，
 * 使 data-context 仍能携带去环后的可序列化基础数据，而非整体缺失（修复 N4）。
 */
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (value && typeof value === 'object') {
      if (seen.has(value)) return undefined; // 跳过环
      seen.add(value);
    }
    return value;
  });
}

/**
 * 将全局上下文注入到物料元素
 * @param {HTMLElement} element 物料 DOM 元素
 * @param {string[]} [keys] 要注入的上下文 key 列表，不传则注入全部
 */
export function injectContext(element, keys) {
  if (!element) return;
  const ctx = getContext();
  const filtered = keys ? {} : ctx;
  if (keys) {
    keys.forEach(k => { if (k in ctx) filtered[k] = ctx[k]; });
  }
  // 注入到元素属性（供 attributeChangedCallback 读取）
  // 优先用普通 stringify（快）；循环引用等导致失败时降级为 safeStringify，
  // 既保证不抛错，又让 data-context 携带去环后的可用数据而非整体缺失
  let serialized;
  try {
    serialized = JSON.stringify(filtered);
  } catch (e) {
    try { serialized = safeStringify(filtered); } catch (_) { serialized = '{}'; }
  }
  try {
    element.setAttribute('data-context', serialized);
  } catch (e) {
    // setAttribute 极少失败（如 XML 文档），忽略
  }
  // 同时挂载到元素实例（供 JS 直接读取）
  element._wcContext = filtered;
}
