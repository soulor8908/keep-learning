/**
 * 原生 H5 物料示例：公告板
 *
 * 演示最简入口模式——default 导出 render 函数（无生命周期回调）：
 *   export default function render(config, scope) { return '<div>...</div>'; }
 *
 * 适用于纯展示物料：无定时器、无事件绑定、config 变化时自动重渲染即可。
 * 如需 onMount/onUnmount（绑定事件/定时器），改用配置对象模式（见 clock-card.js）。
 */

export default function render(config, scope) {
  const items = Array.isArray(config.items) ? config.items : [];
  const title = config.title || scope.meta.name;

  const listHtml = items.length > 0
    ? items.map(item => {
        const text = typeof item === 'string' ? item : (item.text || '');
        const level = (item && item.level) || 'info';
        return `<li class="bi-notice-board__item bi-notice-board__item--${level}">${text}</li>`;
      }).join('')
    : '<li class="bi-notice-board__item bi-notice-board__item--empty">暂无公告</li>';

  return `
    <div class="bi-notice-board">
      <div class="bi-notice-board__title">${title}</div>
      <ul class="bi-notice-board__list">${listHtml}</ul>
    </div>
  `;
}
