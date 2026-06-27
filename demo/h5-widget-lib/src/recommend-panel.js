/**
 * 原生 H5 物料示例：推荐区域（C 业务团队）
 *
 * 演示配置对象入口模式——default 导出含 render + onMount 的对象：
 *   render(props, scope) 返回 HTML 字符串
 *   onMount(element, props, scope) 绑定点击事件，返回清理函数
 *
 * 扁平化 props 协议：宿主把每个 prop 作为独立 kebab-case attribute 传入
 * （title、items），包装层收集后作为扁平 props 对象传给 render/onMount。
 *
 * 无框架依赖，vueVersion='none'，构建产物极小。
 * 点击推荐卡片通过 widget-bus 发出 recommend:expose 事件。
 */

export default {
  // 声明的独立 prop 名：包装层据此观察对应 kebab-case attribute
  props: ['title', 'items'],

  render(props, scope) {
    const items = Array.isArray(props.items) ? props.items : [];
    const title = props.title || '推荐区域';

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

  onMount(element, props, scope) {
    const cards = element.querySelectorAll('.bi-recommend-panel__card');
    const handler = (e) => {
      const card = e.currentTarget;
      const id = card.getAttribute('data-id');
      const name = card.querySelector('.bi-recommend-panel__name').textContent;
      // 通过 scope.bus 发出业务事件
      if (scope && scope.bus) {
        scope.bus.emit('recommend:expose', { id, name });
      }
    };
    cards.forEach(c => c.addEventListener('click', handler));

    scope.log.info('推荐区域已挂载');

    return () => {
      cards.forEach(c => c.removeEventListener('click', handler));
    };
  }
};
