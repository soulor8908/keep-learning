// widget-page 测试：用 vitest 验证页面编排层
// environment 为 node（见 vitest.config.js），通过 mock widget-loader 避免真实 DOM 加载
import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock widget-loader 模块：避免真实资源加载与 DOM 操作
// 仅提供桩函数，实际 loader 行为由各用例通过注入可控的 vi.fn 控制
vi.mock('../../widget-loader/index.js', () => ({
  createWidgetLoader: vi.fn(() => ({
    mountWidget: vi.fn(async () => ({})),
    unmountWidget: vi.fn(async () => {})
  })),
  WidgetLoader: vi.fn(function () {
    this.mountWidget = vi.fn(async () => ({}));
    this.unmountWidget = vi.fn(async () => {});
  }),
  mountWidget: vi.fn(async () => ({})),
  unmountWidget: vi.fn(async () => {})
}));

import { PageManager, Page, PageStatus } from '../index.js';

// 构造一个可控的假 loader：
// - mountWidget 返回唯一的元素对象（模拟挂载产物），记录调用参数
// - unmountWidget 记录被卸载的元素
function makeLoader() {
  let seq = 0;
  const mountWidget = vi.fn(async (container, widget) => ({
    __isWidgetEl: true,
    id: ++seq,
    name: widget && widget.name,
    container
  }));
  const unmountWidget = vi.fn(async (element) => {
    // 模拟从容器移除：仅记录调用
  });
  return { mountWidget, unmountWidget };
}

describe('widget-page 基础流程', () => {
  let pm, loader;
  beforeEach(() => {
    loader = makeLoader();
    pm = new PageManager({ loader, hostId: 'host-A' });
  });

  it('createPage 创建页面，状态为 loading，触发 pagecreating', () => {
    const events = [];
    pm.onPageLifecycle('pagecreating', e => events.push(e));
    const page = pm.createPage({
      id: 'p1',
      name: '首页',
      slots: [{ slotId: 's1', widget: { name: 'w1' }, container: { id: 'c1' } }]
    });
    expect(page).toBeInstanceOf(Page);
    expect(page.id).toBe('p1');
    expect(page.name).toBe('首页');
    expect(page.status).toBe(PageStatus.LOADING);
    expect(page.getSlots()).toHaveLength(1);
    expect(page.getSlot('s1').widget).toEqual({ name: 'w1' });
    expect(page.getSlot('s1').element).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ pageId: 'p1', name: '首页', hostId: 'host-A' });
  });

  it('createPage 缺 id 抛错；slot 缺 slotId 抛错；重复 id 抛错', () => {
    expect(() => pm.createPage({ slots: [] })).toThrow(/id is required/);
    expect(() => pm.createPage({ id: 'p', slots: [{ widget: {} }] })).toThrow(/slotId/);
    pm.createPage({ id: 'dup', slots: [] });
    expect(() => pm.createPage({ id: 'dup', slots: [] })).toThrow(/already exists/);
  });

  it('Page 只读属性：赋值抛错（ESM 严格模式）', () => {
    const page = pm.createPage({ id: 'p1', slots: [] });
    expect(() => { page.id = 'x'; }).toThrow();
    expect(() => { page.status = 'active'; }).toThrow();
    expect(page.id).toBe('p1');
    expect(page.status).toBe(PageStatus.LOADING);
  });

  it('activate 挂载所有 slot 物料，状态变 active，记录归属权', async () => {
    const page = pm.createPage({
      id: 'p1',
      slots: [
        { slotId: 's1', widget: { name: 'w1' }, container: { id: 'c1' } },
        { slotId: 's2', widget: { name: 'w2' }, container: { id: 'c2' } }
      ]
    });
    await pm.activate('p1');
    expect(page.status).toBe(PageStatus.ACTIVE);
    expect(loader.mountWidget).toHaveBeenCalledTimes(2);
    expect(loader.mountWidget).toHaveBeenCalledWith({ id: 'c1' }, { name: 'w1' });
    expect(page.getSlot('s1').element).toBeTruthy();
    expect(page.getSlot('s2').element).toBeTruthy();
    // 物料归属权
    expect(pm.getOwnerPageId(page.getSlot('s1').element)).toBe('p1');
    expect(pm.getOwnerPageId(page.getSlot('s2').element)).toBe('p1');
  });

  it('activate 幂等：已 active 再次 activate 不重复挂载、不发事件', async () => {
    const events = [];
    pm.onPageLifecycle('pageactivated', e => events.push(e));
    const page = pm.createPage({
      id: 'p1',
      slots: [{ slotId: 's1', widget: { name: 'w1' }, container: {} }]
    });
    await pm.activate('p1');
    await pm.activate('p1');
    expect(loader.mountWidget).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(page.status).toBe(PageStatus.ACTIVE);
  });

  it('deactivate 卸载所有物料，状态变 inactive，可重新 activate', async () => {
    const page = pm.createPage({
      id: 'p1',
      slots: [{ slotId: 's1', widget: { name: 'w1' }, container: {} }]
    });
    await pm.activate('p1');
    await pm.deactivate('p1');
    expect(page.status).toBe(PageStatus.INACTIVE);
    expect(loader.unmountWidget).toHaveBeenCalledTimes(1);
    expect(page.getSlot('s1').element).toBeNull();
    // 归属权已清理
    expect(pm.getPages().length).toBe(1);
    // 重新激活：再次挂载
    loader.mountWidget.mockClear();
    await pm.activate('p1');
    expect(page.status).toBe(PageStatus.ACTIVE);
    expect(loader.mountWidget).toHaveBeenCalledTimes(1);
    expect(page.getSlot('s1').element).toBeTruthy();
  });

  it('deactivate 非 active 页面静默返回（不抛错、不发事件）', async () => {
    const events = [];
    pm.onPageLifecycle('pagedeactivated', e => events.push(e));
    pm.createPage({ id: 'p1', slots: [] });
    // loading 状态 deactivate：无操作
    await expect(pm.deactivate('p1')).resolves.toBeUndefined();
    expect(events).toHaveLength(0);
  });

  it('destroy 卸载物料并置 destroyed 终态', async () => {
    const page = pm.createPage({
      id: 'p1',
      slots: [{ slotId: 's1', widget: { name: 'w1' }, container: {} }]
    });
    await pm.activate('p1');
    const element = page.getSlot('s1').element;
    await pm.destroy('p1');
    expect(page.status).toBe(PageStatus.DESTROYED);
    expect(loader.unmountWidget).toHaveBeenCalledWith(element);
    // 墓碑语义：getPage 仍可查询到 destroyed 页面
    expect(pm.getPage('p1')).toBe(page);
    // 归属权已清理
    expect(pm.getOwnerPageId(element)).toBeUndefined();
  });

  it('destroy 未激活页面直接置 destroyed（不调 unmount）', async () => {
    const page = pm.createPage({ id: 'p1', slots: [] });
    await pm.destroy('p1');
    expect(page.status).toBe(PageStatus.DESTROYED);
    expect(loader.unmountWidget).not.toHaveBeenCalled();
  });
});

describe('widget-page 状态机校验', () => {
  let pm, loader;
  beforeEach(() => {
    loader = makeLoader();
    pm = new PageManager({ loader, hostId: 'h' });
  });

  it('destroyed 后 activate 抛错', async () => {
    pm.createPage({ id: 'p1', slots: [{ slotId: 's1', widget: { name: 'w' }, container: {} }] });
    await pm.activate('p1');
    await pm.destroy('p1');
    await expect(pm.activate('p1')).rejects.toThrow(/destroyed/);
  });

  it('destroyed 后 deactivate / switchTo 抛错', async () => {
    pm.createPage({ id: 'p1', slots: [{ slotId: 's1', widget: { name: 'w' }, container: {} }] });
    await pm.activate('p1');
    await pm.destroy('p1');
    await expect(pm.deactivate('p1')).rejects.toThrow(/destroyed/);
    await expect(pm.switchTo('p1')).rejects.toThrow(/destroyed/);
  });

  it('destroyed 后再次 destroy 抛错（不可逆）', async () => {
    pm.createPage({ id: 'p1', slots: [] });
    await pm.destroy('p1');
    await expect(pm.destroy('p1')).rejects.toThrow(/already destroyed/);
  });

  it('操作不存在的页面抛错', async () => {
    await expect(pm.activate('nope')).rejects.toThrow(/not found/);
    await expect(pm.deactivate('nope')).rejects.toThrow(/not found/);
    await expect(pm.destroy('nope')).rejects.toThrow(/not found/);
    await expect(pm.switchTo('nope')).rejects.toThrow(/not found/);
  });
});

describe('widget-page switchTo 切换', () => {
  let pm, loader;
  beforeEach(() => {
    loader = makeLoader();
    pm = new PageManager({ loader, hostId: 'h' });
  });

  it('switchTo 停用当前 active 页、激活目标页', async () => {
    const events = [];
    pm.onPageLifecycle('pageactivated', e => events.push(['act', e.pageId]));
    pm.onPageLifecycle('pagedeactivated', e => events.push(['deact', e.pageId]));
    pm.createPage({ id: 'p1', slots: [{ slotId: 's1', widget: { name: 'w1' }, container: {} }] });
    pm.createPage({ id: 'p2', slots: [{ slotId: 's2', widget: { name: 'w2' }, container: {} }] });
    await pm.activate('p1');
    const p1 = pm.getPage('p1');
    const p2 = pm.getPage('p2');
    const p1Element = p1.getSlot('s1').element;
    expect(p1.status).toBe(PageStatus.ACTIVE);

    await pm.switchTo('p2');

    expect(p1.status).toBe(PageStatus.INACTIVE);
    expect(p2.status).toBe(PageStatus.ACTIVE);
    // 旧页物料已卸载，新页物料已挂载
    expect(p1.getSlot('s1').element).toBeNull();
    expect(p2.getSlot('s2').element).toBeTruthy();
    // 归属权：旧元素已释放，新元素归属 p2
    expect(pm.getOwnerPageId(p1Element)).toBeUndefined();
    expect(pm.getOwnerPageId(p2.getSlot('s2').element)).toBe('p2');
    // 事件顺序：activate p1 → deactivate p1 → activate p2
    expect(events).toEqual([['act', 'p1'], ['deact', 'p1'], ['act', 'p2']]);
  });

  it('switchTo 到当前已 active 页幂等返回', async () => {
    const events = [];
    pm.onPageLifecycle('pageactivated', e => events.push(e.pageId));
    pm.onPageLifecycle('pagedeactivated', e => events.push(e.pageId));
    pm.createPage({ id: 'p1', slots: [{ slotId: 's1', widget: { name: 'w' }, container: {} }] });
    await pm.activate('p1');
    events.length = 0;
    await pm.switchTo('p1');
    expect(events).toHaveLength(0);
    expect(pm.getPage('p1').status).toBe(PageStatus.ACTIVE);
  });

  it('switchTo 从 inactive 页重新切回（重新挂载）', async () => {
    pm.createPage({ id: 'p1', slots: [{ slotId: 's1', widget: { name: 'w1' }, container: {} }] });
    pm.createPage({ id: 'p2', slots: [{ slotId: 's2', widget: { name: 'w2' }, container: {} }] });
    await pm.activate('p1');
    await pm.switchTo('p2');
    // 此时 p1 inactive, p2 active
    loader.mountWidget.mockClear();
    await pm.switchTo('p1');
    expect(pm.getPage('p1').status).toBe(PageStatus.ACTIVE);
    expect(pm.getPage('p2').status).toBe(PageStatus.INACTIVE);
    // p1 重新挂载了一次
    expect(loader.mountWidget).toHaveBeenCalledTimes(1);
  });
});

describe('widget-page 错误隔离', () => {
  it('单个 slot 挂载失败不影响其他 slot，failedSlots 记录失败项', async () => {
    const loader = makeLoader();
    loader.mountWidget.mockImplementation(async (container, widget) => {
      if (widget && widget.name === 'w-fail') {
        throw new Error('mount boom');
      }
      return { name: widget && widget.name };
    });
    const pm = new PageManager({ loader, hostId: 'h' });
    const events = [];
    pm.onPageLifecycle('pageactivated', e => events.push(e));
    const page = pm.createPage({
      id: 'p1',
      slots: [
        { slotId: 's1', widget: { name: 'w-ok' }, container: {} },
        { slotId: 's2', widget: { name: 'w-fail' }, container: {} },
        { slotId: 's3', widget: { name: 'w-ok2' }, container: {} }
      ]
    });
    await pm.activate('p1');
    // 整体仍进入 active，失败 slot 不阻断
    expect(page.status).toBe(PageStatus.ACTIVE);
    expect(page.getSlot('s1').element).toBeTruthy();
    expect(page.getSlot('s2').element).toBeNull(); // 失败，未挂载
    expect(page.getSlot('s3').element).toBeTruthy();
    // 事件 payload 携带 failedSlots
    expect(events).toHaveLength(1);
    expect(events[0].failedSlots).toHaveLength(1);
    expect(events[0].failedSlots[0].slotId).toBe('s2');
    expect(events[0].failedSlots[0].error).toBeInstanceOf(Error);
  });

  it('slot 缺 container 时记为失败，不影响其他 slot', async () => {
    const loader = makeLoader();
    const pm = new PageManager({ loader, hostId: 'h' });
    const page = pm.createPage({
      id: 'p1',
      slots: [
        { slotId: 's1', widget: { name: 'w1' }, container: {} },
        { slotId: 's2', widget: { name: 'w2' } /* 无 container */ }
      ]
    });
    let payload;
    pm.onPageLifecycle('pageactivated', e => { payload = e; });
    await pm.activate('p1');
    expect(page.status).toBe(PageStatus.ACTIVE);
    expect(page.getSlot('s1').element).toBeTruthy();
    expect(payload.failedSlots).toHaveLength(1);
    expect(payload.failedSlots[0].slotId).toBe('s2');
  });

  it('卸载时单个 slot 失败不影响其他 slot 卸载', async () => {
    const loader = makeLoader();
    loader.unmountWidget.mockImplementation(async (element) => {
      if (element && element.name === 'w-fail') throw new Error('unmount boom');
    });
    const pm = new PageManager({ loader, hostId: 'h' });
    const page = pm.createPage({
      id: 'p1',
      slots: [
        { slotId: 's1', widget: { name: 'w-ok' }, container: {} },
        { slotId: 's2', widget: { name: 'w-fail' }, container: {} }
      ]
    });
    await pm.activate('p1');
    let payload;
    pm.onPageLifecycle('pagedeactivated', e => { payload = e; });
    await pm.deactivate('p1');
    expect(page.status).toBe(PageStatus.INACTIVE);
    // 两个 slot 的 element 都被置空（finally 清理）
    expect(page.getSlot('s1').element).toBeNull();
    expect(page.getSlot('s2').element).toBeNull();
    expect(payload.failedSlots).toHaveLength(1);
    expect(payload.failedSlots[0].slotId).toBe('s2');
  });
});

describe('widget-page 生命周期事件', () => {
  it('完整生命周期顺序：creating → activated → deactivated → destroyed', async () => {
    const loader = makeLoader();
    const pm = new PageManager({ loader, hostId: 'h1' });
    const log = [];
    pm.onPageLifecycle('pagecreating', e => log.push({ type: 'creating', pageId: e.pageId, hostId: e.hostId }));
    pm.onPageLifecycle('pageactivated', e => log.push({ type: 'activated', pageId: e.pageId, hostId: e.hostId }));
    pm.onPageLifecycle('pagedeactivated', e => log.push({ type: 'deactivated', pageId: e.pageId, hostId: e.hostId }));
    pm.onPageLifecycle('pagedestroyed', e => log.push({ type: 'destroyed', pageId: e.pageId, hostId: e.hostId }));

    pm.createPage({ id: 'p1', slots: [{ slotId: 's1', widget: { name: 'w' }, container: {} }] });
    await pm.activate('p1');
    await pm.deactivate('p1');
    await pm.destroy('p1');

    expect(log).toEqual([
      { type: 'creating', pageId: 'p1', hostId: 'h1' },
      { type: 'activated', pageId: 'p1', hostId: 'h1' },
      { type: 'deactivated', pageId: 'p1', hostId: 'h1' },
      { type: 'destroyed', pageId: 'p1', hostId: 'h1' }
    ]);
  });

  it('pageactivated payload 含 failedSlots（成功时为空数组）', async () => {
    const loader = makeLoader();
    const pm = new PageManager({ loader, hostId: 'h' });
    let payload;
    pm.onPageLifecycle('pageactivated', e => { payload = e; });
    pm.createPage({ id: 'p1', slots: [{ slotId: 's1', widget: { name: 'w' }, container: {} }] });
    await pm.activate('p1');
    expect(Array.isArray(payload.failedSlots)).toBe(true);
    expect(payload.failedSlots).toHaveLength(0);
  });

  it('取消订阅后不再收到事件', async () => {
    const loader = makeLoader();
    const pm = new PageManager({ loader, hostId: 'h' });
    const log = [];
    const unsub = pm.onPageLifecycle('pagecreating', e => log.push(e.pageId));
    pm.createPage({ id: 'p1', slots: [] });
    unsub();
    pm.createPage({ id: 'p2', slots: [] });
    expect(log).toEqual(['p1']);
  });

  it('订阅未知事件返回空函数且不抛错', () => {
    const pm = new PageManager({ loader: makeLoader() });
    expect(() => pm.onPageLifecycle('unknown', () => {})).not.toThrow();
  });
});

describe('widget-page 多 hostId 隔离', () => {
  it('各 PageManager 事件互不干扰，payload 携带各自 hostId', async () => {
    const pmA = new PageManager({ loader: makeLoader(), hostId: 'A' });
    const pmB = new PageManager({ loader: makeLoader(), hostId: 'B' });
    const aEvents = [];
    const bEvents = [];
    pmA.onPageLifecycle('pageactivated', e => aEvents.push(e));
    pmB.onPageLifecycle('pageactivated', e => bEvents.push(e));

    pmA.createPage({ id: 'pa', slots: [{ slotId: 's', widget: { name: 'w' }, container: {} }] });
    pmB.createPage({ id: 'pb', slots: [{ slotId: 's', widget: { name: 'w' }, container: {} }] });
    await pmA.activate('pa');
    await pmB.activate('pb');

    // 各自只收到自己的事件，hostId 隔离
    expect(aEvents).toHaveLength(1);
    expect(aEvents[0].pageId).toBe('pa');
    expect(aEvents[0].hostId).toBe('A');
    expect(bEvents).toHaveLength(1);
    expect(bEvents[0].pageId).toBe('pb');
    expect(bEvents[0].hostId).toBe('B');
  });

  it('归属权在不同 PageManager 间独立跟踪（互不污染）', async () => {
    const pmA = new PageManager({ loader: makeLoader(), hostId: 'A' });
    const pmB = new PageManager({ loader: makeLoader(), hostId: 'B' });
    pmA.createPage({ id: 'pa', slots: [{ slotId: 's', widget: { name: 'wa' }, container: {} }] });
    pmB.createPage({ id: 'pb', slots: [{ slotId: 's', widget: { name: 'wb' }, container: {} }] });
    await pmA.activate('pa');
    await pmB.activate('pb');
    const elA = pmA.getPage('pa').getSlot('s').element;
    const elB = pmB.getPage('pb').getSlot('s').element;
    // 各自归属各自的页面
    expect(pmA.getOwnerPageId(elA)).toBe('pa');
    expect(pmB.getOwnerPageId(elB)).toBe('pb');
    // A 管理器看不到 B 的元素
    expect(pmA.getOwnerPageId(elB)).toBeUndefined();
    expect(pmB.getOwnerPageId(elA)).toBeUndefined();
  });
});

describe('widget-page 默认 loader 回退', () => {
  it('不注入 loader 时使用 createWidgetLoader 创建实例', async () => {
    // 此处依赖模块级 mock 的 createWidgetLoader 返回的桩 loader
    const pm = new PageManager({ hostId: 'default-host' });
    expect(pm.hostId).toBe('default-host');
    expect(pm.loader).toBeTruthy();
    expect(typeof pm.loader.mountWidget).toBe('function');
    expect(typeof pm.loader.unmountWidget).toBe('function');
    pm.createPage({ id: 'p1', slots: [{ slotId: 's1', widget: { name: 'w' }, container: {} }] });
    await pm.activate('p1');
    expect(pm.getPage('p1').status).toBe(PageStatus.ACTIVE);
  });
});
