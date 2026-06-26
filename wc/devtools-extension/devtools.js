/**
 * DevTools 页面入口：创建 WC Widget 面板
 *
 * 面板展示：
 * 1. 物料列表 — 已加载 Custom Element 及其挂载状态、props、scope meta
 * 2. 事件流   — widgetBus 实时消息（时间戳、类型、payload 预览）
 * 3. 性能     — 物料生命周期瀑布图（loading → loaded → error → unmount）
 */
chrome.devtools.panels.create(
  'WC Widgets',
  null,
  'panel.html'
);
