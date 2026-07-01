// 重试场景 fixture：首次 mount 抛错，置 globalThis.__RETRY_READY=true 后成功
export default {
  mount(container, props = {}) {
    if (!globalThis.__RETRY_READY) {
      throw new Error('重试前不可用');
    }
    container.innerHTML = `<div class="retry-ok">${props.title || ''}</div>`;
    return {
      unmount() {
        container.innerHTML = '';
      }
    };
  }
};
