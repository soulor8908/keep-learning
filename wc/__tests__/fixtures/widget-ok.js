// 成功物料 fixture：mount 写入 DOM，返回 unmount
export default {
  mount(container, props = {}) {
    container.innerHTML = `<div class="ok-widget">${props.title || ''}</div>`;
    return {
      unmount() {
        container.innerHTML = '';
      }
    };
  }
};
