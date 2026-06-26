// 本地开发预览入口：手动注册 Custom Element 后预览组件
import { createApp, h, reactive } from 'vue';
import FinancePanel from './components/FinancePanel.vue';

// 按属性值解析为最终值：优先 JSON.parse，失败回退原始字符串
function parseAttr(raw) {
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}

// 观察的 kebab attribute → camel prop 映射
const ATTR_TO_PROP = {
  title: 'title',
  'show-breakdown': 'showBreakdown',
  currency: 'currency'
};

class FinancePanelElement extends HTMLElement {
  static get observedAttributes() {
    return Object.keys(ATTR_TO_PROP);
  }

  connectedCallback() {
    this._props = reactive(this._collectProps());
    this.app = createApp({
      render: () => h(FinancePanel, { ...this._props })
    });
    this.app.mount(this);
  }

  // 收集已设置的独立 prop attribute（Boolean 属性按 presence 语义解析）
  _collectProps() {
    const props = {};
    for (const [attr, prop] of Object.entries(ATTR_TO_PROP)) {
      if (!this.hasAttribute(attr)) continue;
      if (attr === 'show-breakdown') {
        props[prop] = this.getAttribute(attr) !== 'false';
      } else {
        props[prop] = parseAttr(this.getAttribute(attr));
      }
    }
    return props;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._props) return;
    if (name === 'show-breakdown') {
      this._props.showBreakdown = newValue !== null && newValue !== 'false';
    } else {
      this._props[ATTR_TO_PROP[name]] = parseAttr(newValue);
    }
  }

  disconnectedCallback() {
    if (this.app) {
      this.app.unmount();
      this.app = null;
    }
  }
}

customElements.define('bi-finance-panel', FinancePanelElement);

createApp({
  data() {
    return {
      title: 'Vue3 财务看板',
      currency: 'CNY'
    };
  },
  methods: {
    toggleCurrency() {
      this.currency = this.currency === 'CNY' ? 'USD' : 'CNY';
    }
  },
  template: `
    <div>
      <h2>Vue3 物料库本地预览</h2>
      <bi-finance-panel
        :title="title"
        show-breakdown
        :currency="currency"
      ></bi-finance-panel>
      <button @click="toggleCurrency">切换币种</button>
    </div>
  `
}).mount('#app');
