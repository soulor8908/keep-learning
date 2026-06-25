/**
 * 原生 H5 物料示例：时钟卡片
 *
 * 演示配置对象入口模式——default 导出含 render + 生命周期回调的对象：
 *   export default { render(config, scope) {...}, onMount(el, cfg, scope) {...}, ... }
 *
 * 构建插件（h5-vite-plugin）会自动把此对象包装为 Custom Element：
 * - 包装层创建 widgetScope（context/bus/log/t/request/loader）
 * - connectedCallback 调用 render(config, scope)，用 innerHTML 设置返回的 HTML
 * - onMount 在渲染后调用（绑定事件/启动定时器），返回的清理函数在卸载时自动调用
 * - onConfigChange 在 config 变化重渲染后调用
 *
 * 本物料无框架依赖，不依赖 Vue，vueVersion='none'，构建产物极小。
 * scope 通过回调参数注入，物料可读取上下文、发事件、翻译文案，无需访问 window。
 */

// 模块级 WeakMap 跟踪每个元素实例的定时器，避免多实例互相干扰
const timers = new WeakMap();

export default {
  /**
   * 渲染函数：返回 HTML 字符串
   * @param {object} config 物料配置（由基座 config attribute JSON.parse 而来）
   * @param {object} scope widgetScope 软隔离对象
   * @returns {string} HTML 字符串
   */
  render(config, scope) {
    const timezone = config.timezone || 'UTC';
    const label = config.label || scope.meta.name;

    return `
      <div class="bi-clock-card">
        <div class="bi-clock-card__label">${label}</div>
        <div class="bi-clock-card__time">--:--:--</div>
        <div class="bi-clock-card__zone">${timezone}</div>
      </div>
    `;
  },

  /**
   * 挂载后回调：启动每秒刷新定时器
   * @returns {Function} 清理函数（disconnectedCallback 时自动调用）
   */
  onMount(element, config, scope) {
    const timeEl = element.querySelector('.bi-clock-card__time');
    if (!timeEl) return null;

    function update() {
      const tz = config.timezone || 'UTC';
      try {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString('zh-CN', { timeZone: tz, hour12: false });
      } catch (e) {
        // 无效时区，回退到本地时间
        timeEl.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      }
    }

    update();
    const timer = setInterval(update, 1000);
    timers.set(element, timer);

    scope.log.info('时钟卡片已挂载');

    // 返回清理函数，包装层在 disconnectedCallback 中自动调用
    return () => {
      clearInterval(timer);
      timers.delete(element);
    };
  },

  onUnmount(element, scope) {
    // onMount 返回的清理函数已自动调用，这里做额外清理（如有）
    scope.log.info('时钟卡片已卸载');
  },

  onConfigChange(element, newConfig, oldConfig, scope) {
    if (newConfig.timezone !== oldConfig.timezone) {
      scope.log.info('时区切换:', oldConfig.timezone, '->', newConfig.timezone);
    }
  }
};
