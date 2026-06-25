// 老项目本地预览入口（迁移前）：
// 这是一个普通的 Vue3 业务组件（Composition API），未接入 wc，通过常规 createApp 直接渲染预览。
// 迁移后此文件可保留作为本地调试入口，也可改为物料预览入口。
import { createApp } from 'vue';
import FinanceOverview from './components/FinanceOverview.vue';

const app = createApp({
  components: { FinanceOverview },
  data() {
    return {
      panelTitle: '2026 Q2 财务概览',
      summaryData: [
        { key: 'revenue', label: '营业收入', value: 9821000 },
        { key: 'cost', label: '营业成本', value: -3120000 },
        { key: 'profit', label: '净利润', value: 6701000 }
      ],
      closable: true,
      footnote: '数据更新于 2026-06-25'
    };
  },
  template: `
    <div class="preview">
      <h2>老 Vue3 项目本地预览（迁移前）</h2>
      <finance-overview
        :panel-title="panelTitle"
        :summary-data="summaryData"
        :closable="closable"
        :footnote="footnote"
        @close="onClose"
      />
    </div>
  `,
  methods: {
    onClose(payload) {
      // eslint-disable-next-line no-console
      console.log('[preview] finance-overview close:', payload);
    }
  }
});

app.mount('#app');
