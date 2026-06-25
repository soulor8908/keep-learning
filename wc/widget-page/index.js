/**
 * 页面编排层（widget-page）
 *
 * 在物料加载层（widget-loader）之上引入"页面"概念，解决微前端/看板场景的页面编排需求：
 * - 一个 Page 由多个 WidgetSlot 组成，每个 slot 把一个物料挂载到指定 container。
 * - PageManager 管理多个页面，支持创建/激活/停用/销毁/切换，并批量挂载/卸载物料。
 * - 物料归属权：跟踪每个物料元素所属页面，跨页面切换/卸载时正确清理，避免误卸载他页物料。
 * - 多 Host 隔离：构造接收 hostId，生命周期事件 payload 携带 hostId
 *   （与 widget-loader 的 N8 修复一致，便于微前端/iframe 嵌套场景区分事件来源）。
 * - 状态机：页面状态 loading→active→inactive→destroyed，destroyed 为终态不可逆。
 * - 错误隔离：单个 slot 物料挂载失败不影响其他 slot（catch 并记录到 failedSlots，继续）。
 *
 * 设计说明：
 * - 页面层不直接操作 DOM，物料的加载/挂载/卸载全部委托给 widget-loader 的
 *   mountWidget/unmountWidget，本层只做"页面级编排"（批量挂载、归属权、生命周期）。
 * - destroy 采用"墓碑"语义：置为 destroyed 终态后保留页面记录，使状态机的不可逆校验
 *   可被显式查询与测试（getPage 仍可返回 destroyed 页面，便于基座审计/排错）。
 */

import { createWidgetLoader } from '../widget-loader/index.js';

// ─── 页面状态枚举 ───
// loading：已创建未挂载；active：已挂载；inactive：已卸载（可重新 activate）；destroyed：终态
export const PageStatus = {
  LOADING: 'loading',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DESTROYED: 'destroyed'
};

// ─── 生命周期事件名 ───
export const PageLifecycleEvent = {
  CREATING: 'pagecreating',
  ACTIVATED: 'pageactivated',
  DEACTIVATED: 'pagedeactivated',
  DESTROYED: 'pagedestroyed'
};

/**
 * @typedef {Object} WidgetSlot
 * @property {string} slotId 槽位 id（页内唯一）
 * @property {Object} widget 物料配置（{ name, js, css, ... }），透传给 loader.mountWidget
 * @property {HTMLElement|null} container 挂载容器 DOM 元素
 * @property {HTMLElement|null} element 挂载后的物料元素（未挂载/已卸载为 null）
 */

/**
 * Page：一个页面实例
 *
 * 对外只读属性：id、name、slots、status（通过 getter 暴露，ESM 严格模式下赋值会抛错）。
 * 内部状态变更方法（_setStatus 等）仅供同模块的 PageManager 调用，不对外契约。
 */
export class Page {
  constructor(config) {
    if (!config || !config.id) {
      throw new Error('[widget-page] pageConfig.id is required');
    }
    this._id = config.id;
    this._name = config.name || config.id;
    this._status = PageStatus.LOADING;
    // slotId -> WidgetSlot
    this._slots = new Map();
    for (const s of config.slots || []) {
      if (!s || !s.slotId) {
        throw new Error('[widget-page] each slot requires slotId');
      }
      if (this._slots.has(s.slotId)) {
        throw new Error(`[widget-page] duplicate slotId in page "${config.id}": ${s.slotId}`);
      }
      this._slots.set(s.slotId, {
        slotId: s.slotId,
        widget: s.widget,
        container: s.container || null,
        element: null
      });
    }
  }

  get id() { return this._id; }
  get name() { return this._name; }
  /** 返回槽位数组（每次返回新数组拷贝，避免外部直接改动内部 Map） */
  get slots() { return this.getSlots(); }
  get status() { return this._status; }

  /** 按 slotId 获取槽位（返回内部对象，element 反映实时挂载状态） */
  getSlot(slotId) { return this._slots.get(slotId); }

  /** 获取所有槽位 */
  getSlots() { return Array.from(this._slots.values()); }

  // ─── 以下为内部方法，仅供 PageManager 使用 ───
  _setStatus(status) { this._status = status; }
  _setElement(slotId, element) {
    const s = this._slots.get(slotId);
    if (s) s.element = element || null;
  }
}

/**
 * PageManager：管理多个页面，支持页面切换、批量挂载/卸载、生命周期事件
 */
export class PageManager {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.hostId] 宿主标识，用于多 Host 隔离（携带在生命周期事件 payload）
   * @param {Object} [opts.loader] 物料加载器实例（需含 mountWidget/unmountWidget）；
   *   不传则通过 createWidgetLoader 创建绑定同 hostId 的独立实例
   */
  constructor(opts = {}) {
    this.hostId = opts.hostId || '';
    // 物料加载器：接受注入（便于测试与多 Host 隔离），否则创建独立实例
    this.loader = opts.loader || createWidgetLoader({ hostId: this.hostId });
    // pageId -> Page（含 destroyed 墓碑记录）
    this._pages = new Map();
    // 当前 active 页面 id（单 active 模型：同一时刻只允许一个页面处于 active）
    this._activePageId = null;
    // 物料元素 -> 所属 pageId：归属权跟踪，跨页面卸载时据此正确清理
    this._elementOwner = new Map();
    // 生命周期钩子：事件名 -> 回调数组
    this._hooks = {
      [PageLifecycleEvent.CREATING]: [],
      [PageLifecycleEvent.ACTIVATED]: [],
      [PageLifecycleEvent.DEACTIVATED]: [],
      [PageLifecycleEvent.DESTROYED]: []
    };
  }

  /**
   * 创建页面（不挂载）
   * @param {Object} pageConfig
   * @param {string} pageConfig.id
   * @param {string} [pageConfig.name]
   * @param {Array<{ slotId: string, widget: Object, container?: HTMLElement }>} pageConfig.slots
   * @returns {Page}
   */
  createPage(pageConfig) {
    const page = new Page(pageConfig);
    if (this._pages.has(page.id)) {
      throw new Error(`[widget-page] page already exists: ${page.id}`);
    }
    this._pages.set(page.id, page);
    this._emit(PageLifecycleEvent.CREATING, { pageId: page.id, name: page.name });
    return page;
  }

  /**
   * 激活页面：挂载所有 slot 的物料到各自 container
   * 单 active 模型：若已有其他页面处于 active，会先停用它（触发 pagedeactivated）。
   * @param {string} pageId
   * @returns {Promise<void>}
   */
  async activate(pageId) {
    const page = this._requirePage(pageId);
    if (page.status === PageStatus.DESTROYED) {
      throw new Error(`[widget-page] cannot activate destroyed page: ${pageId}`);
    }
    // 幂等：已 active 直接返回，不重复挂载、不重复发事件
    if (page.status === PageStatus.ACTIVE) return;
    // 单 active：先停用其他 active 页面
    await this._deactivateActiveExcept(pageId);
    const failedSlots = await this._mountSlots(page);
    page._setStatus(PageStatus.ACTIVE);
    this._activePageId = pageId;
    this._emit(PageLifecycleEvent.ACTIVATED, { pageId, failedSlots });
  }

  /**
   * 停用页面：卸载所有物料（保留页面定义，可重新 activate）
   * @param {string} pageId
   * @returns {Promise<void>}
   */
  async deactivate(pageId) {
    const page = this._requirePage(pageId);
    if (page.status === PageStatus.DESTROYED) {
      throw new Error(`[widget-page] cannot deactivate destroyed page: ${pageId}`);
    }
    // 非 active（loading/inactive）无物料需卸载，静默返回
    if (page.status !== PageStatus.ACTIVE) return;
    const failedSlots = await this._unmountSlots(page);
    page._setStatus(PageStatus.INACTIVE);
    if (this._activePageId === pageId) this._activePageId = null;
    this._emit(PageLifecycleEvent.DEACTIVATED, { pageId, failedSlots });
  }

  /**
   * 销毁页面：卸载物料并置为 destroyed 终态（不可再 activate）
   * 采用墓碑语义：保留页面记录以便状态机查询，getPage 仍可返回 destroyed 页面。
   * @param {string} pageId
   * @returns {Promise<void>}
   */
  async destroy(pageId) {
    const page = this._requirePage(pageId);
    if (page.status === PageStatus.DESTROYED) {
      throw new Error(`[widget-page] page already destroyed: ${pageId}`);
    }
    // 处于 active 时先卸载物料
    if (page.status === PageStatus.ACTIVE) {
      await this._unmountSlots(page);
    }
    // 防御性清理残留归属权记录（如卸载失败的 slot 可能仍持有 element）
    for (const slot of page.getSlots()) {
      if (slot.element) {
        this._elementOwner.delete(slot.element);
        page._setElement(slot.slotId, null);
      }
    }
    page._setStatus(PageStatus.DESTROYED);
    if (this._activePageId === pageId) this._activePageId = null;
    this._emit(PageLifecycleEvent.DESTROYED, { pageId });
  }

  /**
   * 页面切换：deactivate 当前 active 页，activate 目标页
   * @param {string} pageId
   * @returns {Promise<void>}
   */
  async switchTo(pageId) {
    const target = this._requirePage(pageId);
    if (target.status === PageStatus.DESTROYED) {
      throw new Error(`[widget-page] cannot switchTo destroyed page: ${pageId}`);
    }
    // 已是当前 active 页：幂等返回
    if (this._activePageId === pageId && target.status === PageStatus.ACTIVE) return;
    // 先停用当前 active 页（若有）
    await this._deactivateActiveExcept(pageId);
    // 再激活目标页（若已是 active 则只更新当前指针）
    if (target.status !== PageStatus.ACTIVE) {
      const failedSlots = await this._mountSlots(target);
      target._setStatus(PageStatus.ACTIVE);
      this._activePageId = pageId;
      this._emit(PageLifecycleEvent.ACTIVATED, { pageId, failedSlots });
    } else {
      this._activePageId = pageId;
    }
  }

  /** 获取页面（含 destroyed 墓碑） */
  getPage(pageId) { return this._pages.get(pageId); }

  /** 获取所有页面（含 destroyed 墓碑，调用方可按 status 过滤） */
  getPages() { return Array.from(this._pages.values()); }

  /**
   * 查询物料元素归属的页面 id（归属权跟踪，便于跨页面卸载时校验）
   * @param {HTMLElement} element
   * @returns {string|undefined}
   */
  getOwnerPageId(element) { return this._elementOwner.get(element); }

  /**
   * 订阅页面生命周期事件
   * @param {'pagecreating'|'pageactivated'|'pagedeactivated'|'pagedestroyed'} event
   * @param {Function} cb 回调，参数为 { pageId, hostId, name?, failedSlots? }
   * @returns {Function} 取消订阅
   */
  onPageLifecycle(event, cb) {
    if (!this._hooks[event]) return () => {};
    this._hooks[event].push(cb);
    return () => {
      const idx = this._hooks[event].indexOf(cb);
      if (idx >= 0) this._hooks[event].splice(idx, 1);
    };
  }

  // ─── 内部方法 ───

  _requirePage(pageId) {
    const page = this._pages.get(pageId);
    if (!page) throw new Error(`[widget-page] page not found: ${pageId}`);
    return page;
  }

  /**
   * 挂载页面所有 slot 的物料（错误隔离：单 slot 失败不影响其他）
   * @param {Page} page
   * @returns {Promise<Array<{ slotId: string, error: Error }>>} 失败 slot 列表
   */
  async _mountSlots(page) {
    const failedSlots = [];
    // 并发挂载各 slot；每个 slot 独立 try/catch，失败只记录不抛出
    await Promise.all(page.getSlots().map(async (slot) => {
      try {
        if (!slot.container) {
          throw new Error(`slot "${slot.slotId}" has no container`);
        }
        const element = await this.loader.mountWidget(slot.container, slot.widget);
        page._setElement(slot.slotId, element);
        // 记录物料归属权：该元素属于此页面
        if (element) this._elementOwner.set(element, page.id);
      } catch (err) {
        console.error(`[widget-page] mount slot "${slot.slotId}" of page "${page.id}" failed:`, err);
        failedSlots.push({ slotId: slot.slotId, error: err });
      }
    }));
    return failedSlots;
  }

  /**
   * 卸载页面所有 slot 的物料（错误隔离：单 slot 卸载失败不影响其他）
   * @param {Page} page
   * @returns {Promise<Array<{ slotId: string, error: Error }>>} 失败 slot 列表
   */
  async _unmountSlots(page) {
    const failedSlots = [];
    await Promise.all(page.getSlots().map(async (slot) => {
      const element = slot.element;
      if (!element) return; // 未挂载，跳过
      try {
        await this.loader.unmountWidget(element);
      } catch (err) {
        console.error(`[widget-page] unmount slot "${slot.slotId}" of page "${page.id}" failed:`, err);
        failedSlots.push({ slotId: slot.slotId, error: err });
      } finally {
        // 无论卸载成功与否，都清理归属权并置空 element，避免残留导致重复卸载
        this._elementOwner.delete(element);
        page._setElement(slot.slotId, null);
      }
    }));
    return failedSlots;
  }

  /**
   * 停用除指定页面外的所有 active 页面（单 active 模型维护）
   * @param {string} exceptPageId 保持激活的页面 id
   */
  async _deactivateActiveExcept(exceptPageId) {
    for (const p of this._pages.values()) {
      if (p.id !== exceptPageId && p.status === PageStatus.ACTIVE) {
        const failedSlots = await this._unmountSlots(p);
        p._setStatus(PageStatus.INACTIVE);
        this._emit(PageLifecycleEvent.DEACTIVATED, { pageId: p.id, failedSlots });
      }
    }
    if (this._activePageId && this._activePageId !== exceptPageId) {
      this._activePageId = null;
    }
  }

  /**
   * 派发生命周期事件，payload 统一附加 hostId（多 Host 隔离，与 widget-loader N8 一致）
   * @param {string} event
   * @param {Object} payload
   */
  _emit(event, payload) {
    const enriched = { ...payload, hostId: this.hostId };
    (this._hooks[event] || []).forEach(cb => {
      try { cb(enriched); } catch (e) { console.error('[widget-page] lifecycle hook error:', e); }
    });
  }
}

export default PageManager;
