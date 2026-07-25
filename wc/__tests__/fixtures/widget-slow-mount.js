// 慢挂载 fixture：mount 延迟 resolve，用于竞态 / 取消 / loading class 场景。
// 注意用 appendChild 追加而非 innerHTML 覆盖，unmount 只移除自己创建的节点，
// 模拟真实物料行为，便于断言「迟到实例被反向卸载且不误伤同容器新物料」。
export default {
  mount(container, props = {}) {
    // 同步记录 mount 已被调用，测试用 waitFor 等待该信号再取消，避免时序猜测
    globalThis.__SLOW_MOUNT_CALLED = (globalThis.__SLOW_MOUNT_CALLED || 0) + 1;
    return new Promise((resolve) => {
      setTimeout(() => {
        globalThis.__SLOW_MOUNTED = (globalThis.__SLOW_MOUNTED || 0) + 1;
        const el = document.createElement('div');
        el.className = 'slow-widget';
        el.textContent = props.title || '';
        container.appendChild(el);
        resolve({
          unmount() {
            globalThis.__SLOW_UNMOUNTED = (globalThis.__SLOW_UNMOUNTED || 0) + 1;
            el.parentNode?.removeChild(el);
          }
        });
      }, Number(globalThis.__SLOW_MOUNT_MS || 30));
    });
  }
};
