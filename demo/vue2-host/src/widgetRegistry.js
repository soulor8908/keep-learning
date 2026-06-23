// 基座物料注册表
// 开发模式下自动指向本地物料热构建服务，生产环境使用 public/widgets 下的产物

const isLocal = process.env.NODE_ENV === 'development';

export const widgets = [
  {
    name: 'bi-sales-panel',
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
