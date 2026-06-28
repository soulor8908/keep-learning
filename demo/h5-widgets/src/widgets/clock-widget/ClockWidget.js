/**
 * 渲染简单时钟 UI
 *
 * @param {HTMLElement} container
 * @param {object} props
 * @param {string} [props.title]
 * @returns {() => void} cleanup
 */
export function renderClock(container, props = {}) {
  if (!container) {
    console.warn('[ClockWidget] container 不存在');
    return () => {};
  }

  const t = props.t || ((key) => key);
  const title = t(props.title || '时钟');

  container.innerHTML = `
    <div class="clock-widget">
      <h3 class="clock-title">${escapeHtml(title)}</h3>
      <div class="clock-time">${new Date().toLocaleString()}</div>
    </div>
  `;

  const timeEl = container.querySelector('.clock-time');
  let timer = null;

  if (timeEl) {
    timer = setInterval(() => {
      timeEl.textContent = new Date().toLocaleString();
    }, 1000);
  }

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * 基础 HTML 转义，避免标题注入
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
