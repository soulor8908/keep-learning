/**
 * bi-event-tester —— 事件测试器（原生物料，纯 JS Custom Element）
 *
 * 验证能力：跨技术栈通讯、事件监听/发送、unmountWidget 触发的清理。
 *
 * 行为：
 *   1. connectedCallback 时通过 widgetBus 广播 'widget:loaded'。
 *   2. 监听关键事件（filter-change / data-updated / widget:loaded / locale-change / test-event），
 *      每条事件记录到日志列表（最多 20 条，超出自动丢弃最早）。
 *   3. "发送测试事件"按钮 → emit('test-event', { time, from })。
 *   4. "清空日志"按钮 → 清空日志列表。
 *   5. disconnectedCallback 时取消所有监听，验证 unmountWidget 的清理。
 *   6. 通过 window.__wcI18n__ 接入 i18n，监听 locale-change 事件自动重渲染。
 *
 * 不依赖任何框架，直接被基座作为静态 JS 加载。
 */
(function () {
  // 通过全局 i18n 运行时获取翻译，语言切换时自动生效
  function t(key) {
    return (window.__wcI18n__ && window.__wcI18n__.t) ? window.__wcI18n__.t(key) : key;
  }

  class BiEventTester extends HTMLElement {
    static get observedAttributes() {
      return ['config'];
    }

    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this._logs = [];
      this._handlers = {};
      this._render();
      this._installListeners();
      if (window.widgetBus) {
        window.widgetBus.emit('widget:loaded', { widget: 'bi-event-tester' });
      }
    }

    disconnectedCallback() {
      // 取消所有监听，验证 unmountWidget 的清理
      Object.values(this._handlers).forEach(function (off) {
        if (typeof off === 'function') off();
      });
      this._handlers = {};
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (name === 'config' && this._init) {
        this._config = this._parseConfig(newVal);
        this._render();
      }
    }

    _parseConfig(value) {
      try {
        return value ? JSON.parse(value) : {};
      } catch (e) {
        return {};
      }
    }

    _installListeners() {
      if (!window.widgetBus) return;
      var self = this;
      var events = [
        'filter-change',
        'data-updated',
        'widget:loaded',
        'test-event'
      ];
      events.forEach(function (evt) {
        self._handlers[evt] = window.widgetBus.on(evt, function (payload) {
          self._addLog(evt, payload);
        });
      });
      // 监听 locale-change 事件，语言切换时自动重渲染
      self._handlers['locale-change'] = window.widgetBus.on('locale-change', function () {
        self._render();
        self._renderLogs();
      });
    }

    _addLog(event, payload) {
      var payloadStr;
      try {
        payloadStr = JSON.stringify(payload);
      } catch (e) {
        payloadStr = String(payload);
      }
      this._logs.unshift({
        time: new Date().toLocaleTimeString(),
        event: event,
        payload: payloadStr.slice(0, 100)
      });
      if (this._logs.length > 20) this._logs.pop();
      this._renderLogs();
    }

    _render() {
      var config = this._config || {};
      this.innerHTML =
        '<style>' +
        '.bi-event-tester{' +
          'box-sizing:border-box;' +
          'display:block;' +
          'padding:12px;' +
          'border:1px solid #d0d7de;' +
          'border-radius:8px;' +
          'background:#ffffff;' +
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;' +
          'font-size:13px;' +
          'color:#1f2328;' +
        '}' +
        '.bi-event-tester *{box-sizing:border-box;}' +
        '.evt-header{' +
          'margin-bottom:10px;' +
          'padding-bottom:8px;' +
          'border-bottom:1px solid #eaeef2;' +
          'font-size:15px;' +
          'font-weight:600;' +
          'color:#24292f;' +
        '}' +
        '.evt-buttons{display:flex;gap:8px;margin-bottom:10px;}' +
        '.evt-btn{' +
          'cursor:pointer;' +
          'padding:6px 12px;' +
          'border:1px solid #d0d7de;' +
          'border-radius:6px;' +
          'background:#f6f8fa;' +
          'color:#24292f;' +
          'font-size:13px;' +
          'line-height:1.4;' +
          'transition:background-color .15s ease,border-color .15s ease,color .15s ease;' +
        '}' +
        '.evt-btn:hover{background:#eaeef2;border-color:#afb8c1;}' +
        '.evt-btn:active{background:#d8dee4;}' +
        '.evt-btn-primary{' +
          'background:#2563eb;' +
          'border-color:#2563eb;' +
          'color:#ffffff;' +
        '}' +
        '.evt-btn-primary:hover{background:#1d4ed8;border-color:#1d4ed8;}' +
        '.evt-btn-primary:active{background:#1e40af;}' +
        '.evt-logs{' +
          'max-height:280px;' +
          'overflow:auto;' +
          'border:1px solid #eaeef2;' +
          'border-radius:6px;' +
          'background:#f6f8fa;' +
        '}' +
        '.evt-empty{' +
          'padding:16px;' +
          'text-align:center;' +
          'color:#8c959f;' +
        '}' +
        '.evt-log-item{' +
          'display:flex;' +
          'align-items:center;' +
          'gap:8px;' +
          'padding:6px 10px;' +
          'border-bottom:1px solid #eaeef2;' +
          'font-size:12px;' +
        '}' +
        '.evt-log-item:nth-child(even){background:#ffffff;}' +
        '.evt-log-item:nth-child(odd){background:#f6f8fa;}' +
        '.evt-log-item:last-child{border-bottom:none;}' +
        '.evt-log-time{' +
          'flex:0 0 auto;' +
          'color:#8c959f;' +
          'font-variant-numeric:tabular-nums;' +
        '}' +
        '.evt-log-event{' +
          'flex:0 0 auto;' +
          'padding:1px 8px;' +
          'border-radius:10px;' +
          'background:#dbe9ff;' +
          'color:#1d4ed8;' +
          'font-weight:600;' +
          'white-space:nowrap;' +
        '}' +
        '.evt-log-payload{' +
          'flex:1 1 auto;' +
          'min-width:0;' +
          'overflow:hidden;' +
          'text-overflow:ellipsis;' +
          'white-space:nowrap;' +
          'color:#57606a;' +
          'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
        '}' +
        '</style>' +
        '<div class="bi-event-tester">' +
          '<div class="evt-header">' + (config.title || t('event_tester.title')) + '</div>' +
          '<div class="evt-buttons">' +
            '<button class="evt-btn evt-btn-primary" id="evt-send">' + t('event_tester.send_test') + '</button>' +
            '<button class="evt-btn" id="evt-clear">' + t('event_tester.clear_log') + '</button>' +
          '</div>' +
          '<div class="evt-logs" id="evt-logs"></div>' +
        '</div>';

      var self = this;
      var sendBtn = this.querySelector('#evt-send');
      var clearBtn = this.querySelector('#evt-clear');
      if (sendBtn) {
        sendBtn.addEventListener('click', function () {
          if (window.widgetBus) {
            window.widgetBus.emit('test-event', {
              time: Date.now(),
              from: 'bi-event-tester'
            });
          }
        });
      }
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          self._logs = [];
          self._renderLogs();
        });
      }
      this._renderLogs();
    }

    _renderLogs() {
      var container = this.querySelector('#evt-logs');
      if (!container) return;
      if (this._logs.length === 0) {
        container.innerHTML = '<div class="evt-empty">' + t('event_tester.no_logs') + '</div>';
        return;
      }
      container.innerHTML = this._logs
        .map(function (log) {
          return (
            '<div class="evt-log-item">' +
              '<span class="evt-log-time">' + log.time + '</span>' +
              '<span class="evt-log-event">' + log.event + '</span>' +
              '<span class="evt-log-payload">' + log.payload + '</span>' +
            '</div>'
          );
        })
        .join('');
    }
  }

  if (!customElements.get('bi-event-tester')) {
    customElements.define('bi-event-tester', BiEventTester);
  }
})();
