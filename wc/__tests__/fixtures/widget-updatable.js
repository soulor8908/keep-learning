// 支持热更新物料 fixture：mount 渲染 title，返回 update 直接改 DOM
export default {
  mount(container, props = {}) {
    container.innerHTML = `<div class="updatable">${props.title || ''}</div>`;
    return {
      unmount() {
        container.innerHTML = '';
      },
      update(next) {
        container.innerHTML = `<div class="updatable">${next.title || ''}</div>`;
      }
    };
  }
};
