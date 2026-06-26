/**
 * Content Script — 桥接 DevTools 面板与页面注入脚本
 *
 * 数据流：
 *   面板 → content-script: chrome.runtime.onMessage（来自 panel.js 的 chrome.tabs.sendMessage）
 *   content-script → 页面:  window.dispatchEvent(CustomEvent('__wc-devtools-request'))
 *   页面 → content-script:  window.addEventListener('__wc-devtools-response')
 *   content-script → 面板:  chrome.runtime.sendMessage / sendResponse
 *
 * 同时负责将 injected.js 注入到页面 MAIN world（content script 运行在隔离世界，
 * 无法直接访问 window.widgetBus 等页面变量，需注入 <script> 标签）。
 */
(function () {
  'use strict';

  // ─── 注入 injected.js 到页面 MAIN world ───
  var script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () { this.remove(); }; // 注入后移除标签，避免 DOM 残留
  (document.head || document.documentElement).appendChild(script);

  // ─── 消息桥接：面板 → 页面 → 面板 ───
  // 待处理的请求映射（id → sendResponse），用于异步响应
  var pendingRequests = new Map();
  var responseTimeout = 5000; // 页面响应超时

  // 监听页面的响应事件
  window.addEventListener('__wc-devtools-response', function (e) {
    var detail = e.detail || {};
    var id = detail.id;
    var callback = pendingRequests.get(id);
    if (!callback) return;
    pendingRequests.delete(id);
    clearTimeout(callback.timer);
    callback.sendResponse({ ok: true, data: detail.data });
  });

  // 监听来自 DevTools 面板的消息
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || !message.action) return;

    var id = message.id || String(Date.now() + Math.random());
    var timer = setTimeout(function () {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        sendResponse({ ok: false, error: 'timeout waiting for page response' });
      }
    }, responseTimeout);

    pendingRequests.set(id, { sendResponse: sendResponse, timer: timer });

    // 转发请求到页面
    window.dispatchEvent(new CustomEvent('__wc-devtools-request', {
      detail: { id: id, action: message.action }
    }));

    // 返回 true 表示异步调用 sendResponse
    return true;
  });
})();
