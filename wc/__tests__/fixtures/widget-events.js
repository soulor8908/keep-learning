// 事件监听物料 fixture：通过 props.on 注册全局监听，卸载时应被 loader 自动清理
export default {
  mount(container, props = {}) {
    container.innerHTML = '<div class="events-widget">ok</div>';
    props.on('ping', () => {
      globalThis.__PING_COUNT = (globalThis.__PING_COUNT || 0) + 1;
    });
    return {
      unmount() {}
    };
  }
};
