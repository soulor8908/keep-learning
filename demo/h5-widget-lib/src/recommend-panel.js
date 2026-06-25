/**
 * 原生 H5 物料示例：推荐区域（C 业务团队）
 *
 * 演示配置对象入口模式——default 导出含 render + onMount 的对象：
 *   render(config, scope) 返回 HTML 字符串
 *   onMount(element, config, scope) 绑定点击事件，返回清理函数
 *
 * 无框架依赖，vueVersion='none'，构建产物极小。
 * 点击推荐卡片通过 widget-bus 发出 recommend:expose 事件。
 */

export default {
  render(config, scope) {
    const items = Array.isArray(config.items) ? config.items : [];
    const title = config.title || '推荐区域';

    const cardsHtml = items.length > 0
      ? items.map(item => {
          const id = (item && item.id) || '';
          const name = (item && item.name) || '';
          const price = (item && item.price) || '';
          return `
            <div class="bi-recommend-panel__card" data-id="${id}">
              <div class="bi-recommend-panel__name">${name}</div>
              <div class="bi-recommend-panel__price">¥${price}</div>
            </div>
          `;
        }).join('')
      : '<div class="bi-recommend-panel__empty">暂无推荐</div>';

    return `
      <div class="bi-recommend-panel">
        <div class="bi-recommend-panel__header">
          <span class="bi-recommend-panel__title">${title}</span>
          <span class="bi-recommend-panel__team">C 业务团队 · 原生H5</span>
        </div>
        <div class="bi-recommend-panel__grid">${cardsHtml}</div>
      </div>
    `;
  },

  onMount(element, config, scope) {
    const cards = element.querySelectorAll('.bi-recommend-panel__card');
    const handler = (e) => {
      const card = e.currentTarget;
      const id = card.getAttribute('data-id');
      const name = card.querySelector('.bi-recommend-panel__name').textContent;
      // 通过 widget-bus 发出业务事件
      if (window.widgetBus) {
        window.widgetBus.emit('recommend:expose', { id, name });
      }
    };
    cards.forEach(c => c.addEventListener('click', handler));

    scope.log.info('推荐区域已挂载');

    return () => {
      cards.forEach(c => c.removeEventListener('click', handler));
    };
  }
};
