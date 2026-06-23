// 本地开发预览入口：手动注册 Custom Element 后预览组件
import { createApp, h } from 'vue';
import FinancePanel from './components/FinancePanel.vue';

function parseConfig(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

class FinancePanelElement extends HTMLElement {
  constructor() {
    super();
    this.app = null;
  }

  static get observedAttributes() {
    return ['config'];
  }

  connectedCallback() {
    const config = this.getAttribute('config');
    this.app = createApp({
      render: () => h(FinancePanel, { config: parseConfig(config) })
    });
    this.app.mount(this);
  }

  disconnectedCallback() {
    if (this.app) {
      this.app.unmount();
      this.app = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'config' && this.app) {
      this.app._instance.props.config = parseConfig(newValue);
    }
  }
}

customElements.define('bi-finance-panel', FinancePanelElement);

createApp({
  data() {
    return {
      config: {
        title: 'Vue3 财务看板',
        currency: 'CNY',
        showBreakdown: true
      }
    };
  },
  methods: {
    toggleCurrency() {
      this.config.currency = this.config.currency === 'CNY' ? 'USD' : 'CNY';
    }
  },
  template: `
    <div>
      <h2>Vue3 物料库本地预览</h2>
      <bi-finance-panel :config="JSON.stringify(config)"></bi-finance-panel>
      <button @click="toggleCurrency">切换币种</button>
    </div>
  `
}).mount('#app');
