// 主动 emit 物料 fixture：mount 时通过 props.emit 发一个 ready 事件
export default {
  mount(container, props = {}) {
    container.innerHTML = '<div class="emits-widget">ok</div>';
    props.emit('ready', { ok: true });
    return {
      unmount() {}
    };
  }
};
