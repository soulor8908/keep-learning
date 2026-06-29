// H5 Host 启动入口（ESM 版）
// 基座完全是 vanilla JS。
// - 同栈 H5 物料：ESM 直引 render 函数，零中转
// - 跨栈 Vue2/Vue3 物料：mountWidget 动态 import()，依赖由 importmap scope 解析
// 对照 UMD 版：跨栈条目从 { js, vueVersion, runtimeDeps } 简化为 { url, css }

import { mountWidget, unmountWidget } from '@wc/esm-core/loader';

// ─── 同栈 H5 物料：ESM 直引 render 函数 ───
import { renderChart } from '../../../demo/h5-widgets/src/widgets/chart-widget/ChartWidget.js';

// ─── 注册表 ───
const WIDGETS = [
  { key: 'h5',   tag: 'H5 · ESM',     title: '柱状图',   stack: 'esm-h5',   render: renderChart },
  { key: 'vue2', tag: 'Vue2 · loader', title: '订单面板', stack: 'loader', name: 'order-panel', url: '/widgets/vue2/order-panel.js', css: '/widgets/vue2/order-panel.css' },
  { key: 'vue3', tag: 'Vue3 · loader', title: '用户面板', stack: 'loader', name: 'user-panel',  url: '/widgets/vue3/user-panel.js',  css: '/widgets/vue3/user-panel.css' }
];

const events = [];
const apis = {};

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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

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

function mountH5ESM(container, renderFn, props) {
  const cleanup = renderFn(container, props);
  return {
    unmount: () => {
      if (typeof cleanup === 'function') cleanup();
      if (container) container.innerHTML = '';
    }
  };
}

async function boot() {
  buildCards();
  for (const w of WIDGETS) {
    const container = document.getElementById(`mount-${w.key}`);
    if (!container) continue;
    const props = { emit: (event, payload) => logEvent(w.name || w.key, event, payload), title: w.title };
    if (w.stack === 'esm-h5') {
      apis[w.key] = mountH5ESM(container, w.render, props);
    } else {
      apis[w.key] = await mountWidget(container, {
        name: w.name,
        url: w.url,
        css: w.css,
        props
      });
    }
  }
}

document.getElementById('clear')?.addEventListener('click', () => {
  events.length = 0;
  renderLog();
});

window.addEventListener('beforeunload', () => {
  Object.values(apis).forEach(unmountWidget);
});

boot();
