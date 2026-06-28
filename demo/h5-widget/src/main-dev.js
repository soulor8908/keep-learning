import { renderClock } from './ClockWidget.js';

// 开发预览：直接在 #app 中渲染时钟
const app = document.getElementById('app');
if (app) {
  renderClock(app, { title: '示例时钟' });
} else {
  console.warn('[main-dev] 未找到 #app 容器');
}
