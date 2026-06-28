import { createH5Widget } from '@wc/core/templates/h5';
import { renderClock } from './ClockWidget.js';

// 导出 UMD 物料入口：{ mount, unmount }
export default createH5Widget(renderClock);
