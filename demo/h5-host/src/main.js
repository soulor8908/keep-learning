// H5 Host 启动入口
// 基座完全是 vanilla JS。
// - 同栈 H5 物料：ESM 直引 render 函数，零 UMD 中转。
// - 跨栈 Vue2/Vue3 物料：mountWidget，loader 内部 ensureRuntimes 按需加载。

import { mountWidget, unmountWidget } from '@wc/core/loader';

// ─── 同栈 H5 物料：ESM 直引 render 函数 ───
// h5-widgets 的 render 函数本来就在源码里（ChartWidget.js / ClockWidget.js），
// 没必要为 demo 走一遍 UMD 构建。
import { renderChart } from '../../h5-widgets/src/widgets/chart-widget/ChartWidget.js';

// ─── 注册表 ───
// stack 字段决定挂载路径：
//   'esm-h5'  → 直接调用 render fn，返回 cleanup
//   'loader'  → mountWidget，loader 内部按需加载运行时
const WIDGETS = [
  { key: 'h5',   tag: 'H5 · ESM',    title: '柱状图',   stack: 'esm-h5',   render: renderChart },
  { key: 'vue2', tag: 'Vue2 · loader', title: '订单面板', stack: 'loader', name: 'biOrderPanel',  js: '/widgets/order-panel.js',  vueVersion: '2', runtimeDeps: ['element-ui'] },
  { key: 'vue3', tag: 'Vue3 · loader', title: '用户面板', stack: 'loader', name: 'biUserPanel',   js: '/widgets/user-panel.js',   vueVersion: '3', runtimeDeps: ['element-plus'] }
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

// 同栈 H5 物料的轻量挂载：直接调用 render 函数
function mountH5ESM(container, renderFn, props) {
  const cleanup = renderFn(container, props);
  return {
    unmount: () => {
      if (typeof cleanup === 'function') cleanup();
      if (container) container.innerHTML = '';
    }
  };
}

// ─── 启动：依次挂载三套物料 ───
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
        js: w.js,
        vueVersion: w.vueVersion,
        runtimeDeps: w.runtimeDeps || [],
        props
      });
    }
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
