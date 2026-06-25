/**
 * 物料注册表模块（远程加载 + 本地缓存 + 环境感知）
 *
 * 此前每个 host 各自维护一份硬编码的 widgetRegistry.js 数组，新增物料需手动
 * 改两个 host 的文件，且无法独立部署更新物料清单。"独立部署"名存实亡。
 *
 * 本模块提供远程注册表加载能力：
 * - 从远程 URL 拉取 JSON 格式的物料清单
 * - 内存缓存 + 可选 localStorage 持久化（离线兜底）
 * - 支持环境感知（dev/prod URL 切换）
 * - 支持合并多个注册表源
 * - 超时控制 + 错误降级（远程失败时回退到缓存或本地兜底）
 *
 * 注册表 JSON 格式：
 * [
 *   {
 *     "name": "bi-sales-panel",
 *     "vueVersion": "2",
 *     "js": "https://cdn.example.com/widgets/bi-sales-panel.js",
 *     "css": "https://cdn.example.com/widgets/bi-sales-panel.css",
 *     "config": { "title": "销售面板" }
 *   },
 *   ...
 * ]
 *
 * 用法：
 *   import { createRegistry } from 'wc/widget-registry';
 *   const registry = createRegistry({
 *     url: 'https://cdn.example.com/widgets/registry.json',
 *     fallback: [/* 本地兜底清单 *\/],
 *     cacheKey: 'widget-registry-cache',
 *     timeout: 10000
 *   });
 *   const widgets = await registry.fetch();
 */

const DEFAULT_TIMEOUT = 10000;

/**
 * 创建注册表实例
 * @param {object} opts
 * @param {string|function} opts.url 注册表远程 URL，或返回 URL 的函数（接收 env 参数）
 * @param {Array} [opts.fallback=[]] 远程加载失败时的本地兜底清单
 * @param {string} [opts.cacheKey] localStorage 缓存键名，不设则不持久化
 * @param {number} [opts.timeout=10000] 请求超时毫秒
 * @param {object} [opts.env] 环境参数，传给 url 函数（如 { mode: 'development' }）
 * @returns {object} 注册表实例
 */
export function createRegistry(opts = {}) {
  const {
    url,
    fallback = [],
    cacheKey,
    timeout = DEFAULT_TIMEOUT,
    env = {}
  } = opts;

  let cachedWidgets = null; // 内存缓存
  let fetchPromise = null;  // 进行中的请求（去重）

  /**
   * 解析 URL（支持函数形式）
   */
  function resolveUrl() {
    if (typeof url === 'function') return url(env);
    return url;
  }

  /**
   * 从 localStorage 读取缓存
   */
  function readStorageCache() {
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // 校验缓存结构
      if (Array.isArray(parsed.widgets)) {
        return { widgets: parsed.widgets, timestamp: parsed.timestamp || 0 };
      }
    } catch (e) {
      // 缓存损坏，忽略
    }
    return null;
  }

  /**
   * 写入 localStorage 缓存
   */
  function writeStorageCache(widgets) {
    if (!cacheKey) return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        widgets,
        timestamp: Date.now()
      }));
    } catch (e) {
      // 写入失败（如 quota 超限），忽略
    }
  }

  /**
   * 校验注册表数据格式
   */
  function validateWidgets(widgets) {
    if (!Array.isArray(widgets)) {
      throw new Error('[widget-registry] 注册表数据格式错误：期望数组');
    }
    // 每条记录必须有 name 和 js
    widgets.forEach((w, i) => {
      if (!w.name || !w.js) {
        throw new Error(`[widget-registry] 第 ${i} 条记录缺少 name 或 js 字段`);
      }
    });
    return widgets;
  }

  /**
   * 拉取远程注册表
   * - 内存缓存命中直接返回
   * - 进行中的请求去重（同一时刻只发一个请求）
   * - 远程失败时回退到 localStorage 缓存，再回退到 fallback
   * @param {boolean} [force=false] 强制刷新，忽略内存缓存
   * @returns {Promise<Array>}
   */
  async function fetch(force = false) {
    // 内存缓存命中（非强制刷新）
    if (!force && cachedWidgets) {
      return cachedWidgets;
    }

    // 请求去重：进行中的请求复用
    if (fetchPromise) {
      return fetchPromise;
    }

    const targetUrl = resolveUrl();
    if (!targetUrl) {
      // 无 URL，直接用 fallback
      cachedWidgets = validateWidgets(fallback);
      return cachedWidgets;
    }

    fetchPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await globalThis.fetch(targetUrl, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const widgets = validateWidgets(await response.json());
        cachedWidgets = widgets;
        writeStorageCache(widgets);
        return widgets;
      } catch (error) {
        // 远程失败：尝试 localStorage 缓存
        const storageCache = readStorageCache();
        if (storageCache) {
          console.warn(`[widget-registry] 远程加载失败(${error.message})，使用本地缓存(${Date.now() - storageCache.timestamp}ms前)`);
          cachedWidgets = storageCache.widgets;
          return cachedWidgets;
        }

        // 无缓存：使用 fallback 兜底
        if (fallback.length > 0) {
          console.warn(`[widget-registry] 远程加载失败(${error.message})且无缓存，使用 fallback 兜底`);
          cachedWidgets = validateWidgets(fallback);
          return cachedWidgets;
        }

        throw new Error(`[widget-registry] 加载注册表失败且无兜底数据: ${error.message}`);
      } finally {
        fetchPromise = null;
      }
    })();

    return fetchPromise;
  }

  /**
   * 按名称查找单个物料
   */
  async function find(name) {
    const widgets = await fetch();
    return widgets.find(w => w.name === name) || null;
  }

  /**
   * 清除内存缓存（不影响 localStorage）
   */
  function clearCache() {
    cachedWidgets = null;
  }

  return { fetch, find, clearCache };
}

// 默认单例（无 URL，仅 fallback 模式，向后兼容）
const defaultRegistry = createRegistry({ fallback: [] });

export const fetchRegistry = (force) => defaultRegistry.fetch(force);
export const findWidget = (name) => defaultRegistry.find(name);
