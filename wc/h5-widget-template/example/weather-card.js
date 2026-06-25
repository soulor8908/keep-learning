/**
 * 原生 H5 物料示例：天气卡片
 *
 * 演示如何用 createH5Widget 创建一个无框架依赖的物料：
 * - render 返回 HTML 字符串
 * - onMount 绑定点击事件
 * - onUnmount 清理监听
 * - onConfigChange 响应 config 变化
 *
 * 构建方式（无需打包工具，直接 IIFE）：
 *   不需要 webpack/vite，直接在 HTML 中 <script src> 引入即可。
 *   如需打包，可用任何工具输出 IIFE/UMD 格式。
 */

// 如果在打包环境中，从 widget-wrapper 导入
// 在直接引用场景中，createH5Widget 已通过其他方式加载
const { createH5Widget } = typeof require !== 'undefined'
  ? require('./widget-wrapper')
  : (window.__h5WidgetFactory || { createH5Widget: window.createH5Widget });

const WeatherCard = createH5Widget({
  name: 'bi-weather-card',
  render(config) {
    const city = config.city || '未知城市';
    const temp = config.temperature != null ? config.temperature : '--';
    const condition = config.condition || '未知';
    const unit = config.unit || '°C';

    return `
      <div class="bi-weather-card">
        <div class="bi-weather-card__city">${city}</div>
        <div class="bi-weather-card__temp">${temp}<span class="bi-weather-card__unit">${unit}</span></div>
        <div class="bi-weather-card__condition">${condition}</div>
      </div>
    `;
  },
  onMount(element, config) {
    // 绑定点击事件：通过 widget-bus 广播城市选择
    const handler = () => {
      if (window.widgetBus) {
        window.widgetBus.emit('city-selected', { city: config.city });
      }
    };
    element.addEventListener('click', handler);

    // 返回清理函数
    return () => {
      element.removeEventListener('click', handler);
    };
  },
  onUnmount(element) {
    // onMount 返回的清理函数会自动调用，这里可做额外清理
  },
  onConfigChange(element, newConfig, oldConfig) {
    // config 变化时 render 已自动重绘，这里可做额外逻辑
    if (newConfig.city !== oldConfig.city) {
      console.log(`[bi-weather-card] 城市切换: ${oldConfig.city} → ${newConfig.city}`);
    }
  }
});

// 注册 Custom Element
if (!customElements.get('bi-weather-card')) {
  customElements.define('bi-weather-card', WeatherCard);
}
