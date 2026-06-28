/**
 * 渲染简单柱状图
 *
 * @param {HTMLElement} container
 * @param {object} props
 * @param {string} [props.title]
 * @param {number[]} [props.data]
 * @param {Function} [props.t]
 * @param {Function} [props.emit]
 * @returns {() => void} cleanup
 */
export function renderChart(container, props = {}) {
  if (!container) return () => {};

  const t = props.t || ((key) => key);
  const title = t(props.title || 'common.chart');
  const data = props.data || [30, 50, 80, 40, 60];
  const max = Math.max(...data);

  const bars = data.map((v) => {
    const height = (v / max) * 100;
    return `<div class="chart-bar" style="flex:1;height:${height}%;background:#409eff;border-radius:4px 4px 0 0;transition:height 0.3s"></div>`;
  }).join('');

  container.innerHTML = `
    <div class="chart-widget" style="padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <h3 class="chart-title" style="margin:0 0 4px;font-size:18px">${escapeHtml(title)}</h3>
      <div class="chart-props" style="margin-bottom:8px">
        <span style="display:inline-block;padding:2px 8px;background:#f0f2f5;border-radius:4px;font-size:12px;color:#606266">data: [${data.join(', ')}]</span>
      </div>
      <div class="chart-container" style="display:flex;align-items:flex-end;gap:8px;height:120px;margin-top:8px">
        ${bars}
      </div>
      <div class="chart-actions" style="margin-top:12px">
        <button class="chart-btn" style="padding:4px 12px;border:1px solid #409eff;border-radius:4px;background:#409eff;color:#fff;cursor:pointer;font-size:12px">Refresh</button>
      </div>
    </div>
  `;

  // 绑定刷新按钮事件
  const btn = container.querySelector('.chart-btn');
  if (btn && props.emit) {
    btn.addEventListener('click', () => {
      props.emit('refresh', { source: 'chart-widget', timestamp: Date.now() });
    });
  }

  return () => {};
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
