// 本地开发预览入口：手动注册 Custom Element 后预览组件
import Vue from 'vue';
import wrap from '@vue/web-component-wrapper';
import SalesPanel from './components/SalesPanel.vue';

// 桥接组件：把宿主传入的扁平化 props 透传给 SalesPanel
// （@vue/web-component-wrapper 把宿主 attribute 映射为桥接组件的 prop）
const BridgeComponent = {
  props: ['title', 'showTrend', 'currency', 'period'],
  render(h) {
    return h(SalesPanel, {
      props: {
        title: this.title,
        showTrend: this.showTrend,
        currency: this.currency,
        period: this.period
      }
    });
  }
};

customElements.define('bi-sales-panel', wrap(Vue, BridgeComponent));

new Vue({
  el: '#app',
  template: `
    <div>
      <h2>Vue2 物料库本地预览</h2>
      <bi-sales-panel
        title="Vue2 销售看板"
        show-trend
        currency="CNY"
        :period="period"
      ></bi-sales-panel>
      <button @click="togglePeriod">切换周期</button>
    </div>
  `,
  data: {
    period: 'month'
  },
  methods: {
    togglePeriod() {
      const periods = ['day', 'week', 'month', 'year'];
      const idx = periods.indexOf(this.period);
      this.period = periods[(idx + 1) % periods.length];
    }
  }
});
