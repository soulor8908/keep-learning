// H5 Host 启动入口
// 基座完全是 vanilla JS：用 DOM API 创建卡片，把 loader 的 mountWidget 当成
// 一个返回 unmount() 的纯函数来调用。没有任何框架介入。

import { mountWidget, unmountWidget } from '@wc/core/loader';

// ─── 物料注册表 ───
// 与 vue2-host / vue3-host 选用不同的物料组合，覆盖另一组三技术栈，
// 顺带验证 h5-host 不挑食。
const WIDGETS = [
  { key: 'vue2', tag: 'Vue2', title: '订单面板', name: 'biOrderPanel',   js: '/widgets/order-panel.js',  vueVersion: '2' },
  { key: 'vue3', tag: 'Vue3', title: '用户面板', name: 'biUserPanel',    js: '/widgets/user-panel.js',   vueVersion: '3' },
  { key: 'h5',   tag: 'H5',   title: '柱状图',   name: 'biChartWidget',  js: '/widgets/chart-widget.js', vueVersion: 'none' }
];

const events = [];
const apis = {};

// ─── 事件日志渲染 ───
function logEvent(widget, event, payload) {
  events.unshift({ widget, event, payload, time: new Date().toLocaleTimeString() });
  if (events.length > 20) events.pop();
  renderLog();
}

function renderLog() {
  const list = document.getElementById('log-list');
  const empty = document.getElementById('log-empty');
  if (!list || !empty) return;

  if (events.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = events.map((e) => `
    <li>
      <span class="time">${e.time}</span>
      <strong>${e.widget}</strong>
      <span class="event">${e.event}</span>
      ${e.payload ? `<code>${escapeHtml(JSON.stringify(e.payload))}</code>` : ''}
    </li>
  `).join('');
}

// 输出到事件日志的内容可能含 payload，需要转义避免注入
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ─── 卡片骨架 ───
function buildCards() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  grid.innerHTML = WIDGETS.map((w) => `
    <section class="h5host__card">
      <header class="h5host__card-head">
        <span class="badge badge--${w.key}">${w.tag}</span>
        <h2>${w.title}</h2>
      </header>
      <div id="mount-${w.key}" class="h5host__mount"></div>
    </section>
  `).join('');
}

// ─── 启动：依次挂载三套物料 ───
async function boot() {
  buildCards();
  for (const w of WIDGETS) {
    const container = document.getElementById(`mount-${w.key}`);
    if (!container) continue;
    const emit = (event, payload) => logEvent(w.name, event, payload);
    apis[w.key] = await mountWidget(container, {
      name: w.name,
      js: w.js,
      vueVersion: w.vueVersion,
      props: { emit, title: w.title }
    });
  }
}

document.getElementById('clear')?.addEventListener('click', () => {
  events.length = 0;
  renderLog();
});

// 页面卸载前清理物料，避免遗留定时器/监听器
window.addEventListener('beforeunload', () => {
  Object.values(apis).forEach(unmountWidget);
});

boot();
