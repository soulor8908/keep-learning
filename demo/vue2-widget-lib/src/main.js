// 本地开发预览入口：手动注册 Custom Element 后预览组件
import Vue from 'vue';
import wrap from '@vue/web-component-wrapper';
import SalesPanel from './components/SalesPanel.vue';

function parseConfig(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

const BridgeComponent = {
  props: ['config'],
  render(h) {
    return h(SalesPanel, {
      props: { config: parseConfig(this.config) }
    });
  }
};

customElements.define('bi-sales-panel', wrap(Vue, BridgeComponent));

new Vue({
  el: '#app',
  template: `
    <div>
      <h2>Vue2 物料库本地预览</h2>
      <bi-sales-panel :config='JSON.stringify(config)'></bi-sales-panel>
      <button @click="togglePeriod">切换周期</button>
    </div>
  `,
  data: {
    config: {
      title: 'Vue2 销售看板',
      period: 'month',
      showTrend: true
    }
  },
  methods: {
    togglePeriod() {
      const periods = ['day', 'week', 'month', 'year'];
      const idx = periods.indexOf(this.config.period);
      this.config.period = periods[(idx + 1) % periods.length];
    }
  }
});
