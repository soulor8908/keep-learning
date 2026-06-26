/**
 * DevTools 面板逻辑
 *
 * 三 Tab 展示：
 * 1. 物料列表 — DOM 中的 bi-* 物料元素、运行时全局变量状态
 * 2. 事件流   — widgetBus 实时消息流
 * 3. 性能     — widget-loader 生命周期事件瀑布图
 *
 * 通信：通过 chrome.tabs.sendMessage 向 content-script 发请求，
 *       content-script 转发到页面 injected.js，返回快照数据。
 */
(function () {
  'use strict';

  // ─── DOM 引用 ───
  var tabs = document.querySelectorAll('.tab');
  var tabContents = document.querySelectorAll('.tab-content');
  var refreshBtn = document.getElementById('refresh-btn');
  var clearBtn = document.getElementById('clear-btn');
  var autoRefreshCheckbox = document.getElementById('auto-refresh');
  var statusBar = document.getElementById('status-bar');
  var runtimeInfo = document.getElementById('runtime-info');
  var widgetTbody = document.getElementById('widget-tbody');
  var eventList = document.getElementById('event-list');
  var perfStats = document.getElementById('perf-stats');
  var timeline = document.getElementById('timeline');

  var activeTab = 'widgets';
  var autoRefreshTimer = null;
  var AUTO_REFRESH_INTERVAL = 2000;

  // ─── Tab 切换 ───
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      tabContents.forEach(function (tc) { tc.classList.remove('active'); });
      document.getElementById('tab-' + activeTab).classList.add('active');
      refresh();
    });
  });

  // ─── 刷新按钮 ───
  refreshBtn.addEventListener('click', refresh);
  clearBtn.addEventListener('click', clearEvents);

  // ─── 自动刷新 ───
  autoRefreshCheckbox.addEventListener('change', function () {
    if (autoRefreshCheckbox.checked) startAutoRefresh();
    else stopAutoRefresh();
  });

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(refresh, AUTO_REFRESH_INTERVAL);
  }
  function stopAutoRefresh() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  }

  // ─── 向页面请求快照 ───
  function requestSnapshot() {
    return new Promise(function (resolve) {
      var tabId = chrome.devtools.inspectedWindow.tabId;
      chrome.tabs.sendMessage(tabId, { action: 'getSnapshot', id: String(Date.now()) }, function (response) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: 'no response' });
      });
    });
  }

  function clearEvents() {
    var tabId = chrome.devtools.inspectedWindow.tabId;
    chrome.tabs.sendMessage(tabId, { action: 'clearEvents', id: String(Date.now()) }, function () {
      refresh();
    });
  }

  // ─── 刷新所有 Tab 数据 ───
  async function refresh() {
    var response = await requestSnapshot();
    if (!response || !response.ok) {
      statusBar.textContent = '未连接: ' + (response && response.error ? response.error : '未知错误');
      statusBar.className = 'status-bar error';
      return;
    }
    var data = response.data;
    if (!data) {
      statusBar.textContent = '未连接';
      statusBar.className = 'status-bar warning';
      return;
    }
    statusBar.textContent = formatStatus(data);
    statusBar.className = 'status-bar';
    renderRuntime(data.runtime);
    renderWidgets(data.domWidgets);
    renderEvents(data.busEvents);
    renderPerformance(data.lifecycleEvents, data.stats);
  }

  function formatStatus(data) {
    var s = data.url || '';
    if (data.stats) {
      s += ' | 物料: ' + data.stats.totalInDom + '/' + data.stats.totalRegistered;
      s += ' | 事件: ' + data.stats.busEventCount;
      s += ' | 生命周期: ' + data.stats.lifecycleCount;
    }
    return s;
  }

  // ─── 渲染：运行时信息 ───
  function renderRuntime(runtime) {
    if (!runtime) { runtimeInfo.innerHTML = ''; return; }
    var badges = [];
    function badge(label, present, extra) {
      badges.push('<span class="runtime-badge' + (present ? '' : ' missing') + '">' +
        '<span class="dot"></span>' + label + (extra || '') + '</span>');
    }
    badge('Vue2', !!runtime.Vue2, runtime.Vue2 ? ' ' + runtime.Vue2.version : '');
    badge('Vue3', !!runtime.Vue3, runtime.Vue3 ? ' ' + runtime.Vue3.version : '');
    badge('lodash', runtime.lodash);
    badge('axios', runtime.axios);
    badge('wcI18n', runtime.wcI18n);
    badge('wcWidgetScope', runtime.wcWidgetScope);
    badge('widgetBus', runtime.widgetBus);
    runtimeInfo.innerHTML = badges.join('');
  }

  // ─── 渲染：物料表格 ───
  function renderWidgets(widgets) {
    if (!widgets || widgets.length === 0) {
      widgetTbody.innerHTML = '<tr><td colspan="5" class="empty">暂无物料</td></tr>';
      return;
    }
    widgetTbody.innerHTML = widgets.map(function (w) {
      var status = w.connected
        ? '<span class="status-pill connected">已挂载</span>'
        : '<span class="status-pill disconnected">已卸载</span>';
      return '<tr>' +
        '<td>' + escapeHtml(w.name) + '</td>' +
        '<td>' + status + '</td>' +
        '<td class="props-cell">' + escapeHtml(JSON.stringify(w.props, null, 1)) + '</td>' +
        '<td class="scope-cell">' + escapeHtml(JSON.stringify(w.scopeMeta, null, 1)) + '</td>' +
        '<td>' + formatTime(w.registeredAt) + '</td>' +
        '</tr>';
    }).join('');
  }

  // ─── 渲染：事件流 ───
  function renderEvents(events) {
    if (!events || events.length === 0) {
      eventList.innerHTML = '<div class="empty">暂无事件</div>';
      return;
    }
    // 倒序显示（最新在上）
    eventList.innerHTML = events.slice().reverse().map(function (ev) {
      return '<div class="event-item">' +
        '<span class="event-time">' + formatTime(ev.timestamp) + '</span>' +
        '<span class="event-type">' + escapeHtml(ev.type) + '</span>' +
        '<span class="event-payload">' + escapeHtml(JSON.stringify(ev.payload)) + '</span>' +
        '</div>';
    }).join('');
  }

  // ─── 渲染：性能时间线 ───
  function renderPerformance(events, stats) {
    if (stats) {
      perfStats.innerHTML =
        '<span class="perf-stat">已注册: <strong>' + stats.totalRegistered + '</strong></span>' +
        '<span class="perf-stat">DOM 中: <strong>' + stats.totalInDom + '</strong></span>' +
        '<span class="perf-stat">生命周期事件: <strong>' + stats.lifecycleCount + '</strong></span>' +
        '<span class="perf-stat">总线事件: <strong>' + stats.busEventCount + '</strong></span>';
    }
    if (!events || events.length === 0) {
      timeline.innerHTML = '<div class="empty">暂无生命周期事件</div>';
      return;
    }
    // 倒序显示
    timeline.innerHTML = events.slice().reverse().map(function (ev) {
      var detail = ev.payload && ev.payload.name ? ev.payload.name : '';
      if (ev.payload && ev.payload.error) detail += ' | ' + (ev.payload.error.message || ev.payload.error);
      return '<div class="timeline-row ' + ev.event + '">' +
        '<span class="timeline-time">' + formatTime(ev.timestamp) + '</span>' +
        '<span class="timeline-event">' + ev.event + '</span>' +
        '<span class="timeline-detail">' + escapeHtml(detail) + '</span>' +
        '</div>';
    }).join('');
  }

  // ─── 工具函数 ───
  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad3(d.getMilliseconds());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function pad3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n; }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── 初始化 ───
  refresh();
  startAutoRefresh();
})();
