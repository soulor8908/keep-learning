import { renderClock } from './widgets/clock-widget/ClockWidget.js';
import { renderChart } from './widgets/chart-widget/ChartWidget.js';
import { createH5Widget } from '@wc/core/templates/h5';

export default {
  biClockWidget: createH5Widget(renderClock),
  biChartWidget: createH5Widget(renderChart)
};
