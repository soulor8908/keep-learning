/**
 * 页面上下文注入脚本（运行在 MAIN world）
 *
 * 职责：
 * 1. Hook window.widgetBus.emit — 捕获事件总线消息流
 * 2. Wrap customElements.define — 跟踪物料注册
 * 3. 暴露 window.__wcDevtoolsBridge.onLifecycle — 接收 widget-loader 生命周期事件
 * 4. 响应 DevTools 面板的查询请求（通过 CustomEvent 双向通信）
 *
 * 通信协议：
 *   面板 → 页面: window.dispatchEvent(new CustomEvent('__wc-devtools-request', { detail: { id, action } }))
 *   页面 → 面板: window.dispatchEvent(new CustomEvent('__wc-devtools-response', { detail: { id, data } }))
 */
(function () {
  'use strict';

  // 避免重复注入
  if (window.__wcDevtoolsInjected) return;
  window.__wcDevtoolsInjected = true;

  // ─── 状态收集 ───
  var registeredWidgetsMap = new Map();   // Map<name, { name, timestamp }> 同名物料只保留最新注册时间
  var lifecycleEvents = [];     // [{ event, payload, timestamp }]
  var busEvents = [];           // [{ type, payload, timestamp }]
  var MAX_EVENTS = 500;         // 环形缓冲，避免无限增长

  function pushCapped(arr, item) {
    arr.push(item);
    if (arr.length > MAX_EVENTS) arr.shift();
  }

  // ─── 1. Hook customElements.define ───
  var origDefine = customElements.define.bind(customElements);
  customElements.define = function (name, constructor, options) {
    // 只追踪 bi-* 前缀的物料（约定物料名以 bi- 开头）
    if (typeof name === 'string' && name.indexOf('bi-') === 0) {
      registeredWidgetsMap.set(name, { name: name, timestamp: Date.now() });
    }
    return origDefine(name, constructor, options);
  };

  // ─── 2. Hook window.widgetBus.emit ───
  function hookBus() {
    var bus = window.widgetBus;
    if (!bus || bus.__wcHooked) return;
    var origEmit = bus.emit;
    bus.emit = function (type, payload) {
      pushCapped(busEvents, { type: type, payload: safePreview(payload), timestamp: Date.now() });
      return origEmit.apply(this, arguments);
    };
    bus.__wcHooked = true;
  }

  // 延迟 hook：widgetBus 可能在页面脚本之后才挂载到 window
  var busHookRetries = 0;
  function tryHookBus() {
    hookBus();
    if (!window.widgetBus && busHookRetries < 20) {
      busHookRetries++;
      setTimeout(tryHookBus, 500);
    }
  }
  tryHookBus();

  // ─── 3. 暴露 lifecycle bridge（widget-loader.emitLifecycle 调用）───
  window.__wcDevtoolsBridge = {
    onLifecycle: function (event, payload) {
      pushCapped(lifecycleEvents, {
        event: event,
        payload: safePreview(payload),
        timestamp: Date.now()
      });
    }
  };

  // ─── 4. 响应 DevTools 查询 ───
  window.addEventListener('__wc-devtools-request', function (e) {
    var detail = e.detail || {};
    var id = detail.id;
    var action = detail.action;
    var data;

    switch (action) {
      case 'getSnapshot':
        data = collectSnapshot();
        break;
      case 'clearEvents':
        lifecycleEvents = [];
        busEvents = [];
        data = { ok: true };
        break;
      default:
        data = { error: 'unknown action: ' + action };
    }

    window.dispatchEvent(new CustomEvent('__wc-devtools-response', {
      detail: { id: id, data: data }
    }));
  });

  // ─── 收集页面快照 ───
  function collectSnapshot() {
    var domWidgets = [];
    // 遍历所有已注册的 bi-* custom element，查找 DOM 中的实例
    Array.from(registeredWidgetsMap.values()).forEach(function (reg) {
      var instances = document.querySelectorAll(reg.name);
      instances.forEach(function (el) {
        domWidgets.push({
          name: reg.name,
          registeredAt: reg.timestamp,
          connected: el.isConnected,
          props: safePreview(el._props || el._propsRef && el._propsRef.value || null),
          scopeMeta: safePreview(extractScopeMeta(el._scope || el._widgetScope))
        });
      });
    });

    return {
      timestamp: Date.now(),
      url: location.href,
      // 运行时全局变量状态
      runtime: {
        Vue2: window.Vue2 ? { version: window.Vue2.version } : null,
        Vue3: window.Vue3 ? { version: window.Vue3.version } : null,
        lodash: !!window._,
        axios: !!window.axios,
        wcI18n: !!window.__wcI18n__,
        wcWidgetScope: !!window.__wcWidgetScope__,
        widgetBus: !!window.widgetBus
      },
      registeredWidgets: Array.from(registeredWidgetsMap.values()),
      domWidgets: domWidgets,
      lifecycleEvents: lifecycleEvents.slice(-100),  // 最近 100 条
      busEvents: busEvents.slice(-100),
      stats: {
        totalRegistered: registeredWidgetsMap.size,
        totalInDom: domWidgets.length,
        lifecycleCount: lifecycleEvents.length,
        busEventCount: busEvents.length
      }
    };
  }

  // 提取 scope meta（只取安全字段，避免循环引用）
  function extractScopeMeta(scope) {
    if (!scope) return null;
    var meta = scope.meta || {};
    return {
      name: meta.name,
      version: meta.version,
      host: meta.host,
      isMinimal: !!meta.__minimal
    };
  }

  // 安全序列化 payload 预览（截断长字符串，处理循环引用）
  function safePreview(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    try {
      var seen = [];
      var json = JSON.stringify(obj, function (key, val) {
        if (typeof val === 'object' && val !== null) {
          if (seen.indexOf(val) >= 0) return '[Circular]';
          seen.push(val);
        }
        if (typeof val === 'function') return '[Function]';
        return val;
      });
      // 截断超长 JSON
      if (json && json.length > 2000) json = json.substring(0, 2000) + '...[truncated]';
      return JSON.parse(json);
    } catch (e) {
      return String(obj);
    }
  }
})();
