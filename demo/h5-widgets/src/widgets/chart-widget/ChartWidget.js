/**
 * 渲染简单柱状图
 *
 * @param {HTMLElement} container
 * @param {object} props
 * @param {string} [props.title]
 * @param {number[]} [props.data]
 * @param {Function} [props.t]
 * @returns {() => void} cleanup
 */
export function renderChart(container, props = {}) {
  if (!container) {
    console.warn('[ChartWidget] container 不存在');
    return () => {};
  }

  const t = props.t || ((key) => key);
  const title = t(props.title || 'common.chart');
  const data = props.data || [30, 50, 80, 40, 60];
  const max = Math.max(...data);

  const bars = data.map((v) => {
    const height = (v / max) * 100;
    return `<div class="chart-bar" style="flex:1;height:${height}%;background:#409eff;border-radius:4px 4px 0 0"></div>`;
  }).join('');

  container.innerHTML = `
    <div class="chart-widget" style="padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <h3 class="chart-title" style="margin:0 0 4px;font-size:18px">${escapeHtml(title)}</h3>
      <div class="chart-container" style="display:flex;align-items:flex-end;gap:8px;height:120px;margin-top:12px">
        ${bars}
      </div>
    </div>
  `;

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
