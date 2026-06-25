// 老项目本地预览入口（迁移前）：
// 这是一个普通的 Vue2 业务组件，未接入 wc，通过常规 Vue 实例直接渲染预览。
// 迁移后此文件可保留作为本地调试入口，也可改为物料预览入口。
import Vue from 'vue';
import SalesDashboard from './components/SalesDashboard.vue';

new Vue({
  el: '#app',
  components: { SalesDashboard },
  template: `
    <div class="preview">
      <h2>老 Vue2 项目本地预览（迁移前）</h2>
      <sales-dashboard
        title="Q3 销售概览"
        :metrics="metrics"
        :show-footer="true"
      />
    </div>
  `,
  data: {
    metrics: [
      { label: '营收', value: 128000 },
      { label: '订单数', value: 342 },
      { label: '客单价', value: 374 }
    ]
  }
});
