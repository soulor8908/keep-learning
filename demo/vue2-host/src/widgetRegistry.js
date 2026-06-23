// 基座物料注册表
// 开发模式下自动指向本地物料热构建服务，生产环境使用 public/widgets 下的产物

const isLocal = process.env.NODE_ENV === 'development';

export const widgets = [
  {
    name: 'bi-sales-panel',
    // 物料依赖的 Vue 主版本，供 widget-loader 做版本契约校验
    vueVersion: '2',
    js: isLocal
      ? 'http://localhost:8081/bi-sales-panel.js'
      : '/widgets/bi-sales-panel.js',
    config: {
      title: 'Vue2 基座 · 销售看板',
      period: 'month',
      showTrend: true
    }
  },
  {
    name: 'bi-finance-panel',
    // Vue3 物料：在仅提供 Vue2 运行时的基座中会被版本契约拒绝加载
    vueVersion: '3',
    js: isLocal
      ? 'http://localhost:8082/bi-finance-panel.js'
      : '/widgets/bi-finance-panel.js',
    config: {
      title: 'Vue2 基座 · 财务看板',
      currency: 'CNY',
      showBreakdown: true
    }
  }
];
