/**
 * 原生 H5 物料示例：公告板
 *
 * 演示最简配置对象入口模式——default 导出含 render 的对象（无生命周期回调）：
 *   export default { props: [...], render(props, scope) { return '<div>...</div>'; } }
 *
 * 扁平化 props 协议：宿主把每个 prop 作为独立 kebab-case attribute 传入
 * （title、items），包装层收集后作为扁平 props 对象传给 render。
 *
 * 适用于纯展示物料：无定时器、无事件绑定、props 变化时自动重渲染即可。
 * 如需 onMount/onUnmount（绑定事件/定时器），补充对应回调（见 clock-card.js）。
 */

export default {
  // 声明的独立 prop 名：包装层据此观察对应 kebab-case attribute
  props: ['title', 'items'],

  render(props, scope) {
    const items = Array.isArray(props.items) ? props.items : [];
    const title = props.title || scope.meta.name;

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
};
