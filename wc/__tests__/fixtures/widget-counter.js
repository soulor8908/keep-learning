// 计数 fixture：模块顶层执行时自增 globalThis.__WIDGET_EVAL_COUNT，用于断言「同一 URL 不重复求值」
globalThis.__WIDGET_EVAL_COUNT = (globalThis.__WIDGET_EVAL_COUNT || 0) + 1;

export default {
  mount(container) {
    container.innerHTML = '<div class="counter-widget">ok</div>';
    return { unmount() { container.innerHTML = ''; } };
  }
};
