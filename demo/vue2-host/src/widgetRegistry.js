// 基座物料注册表
// 开发模式下自动指向本地物料热构建服务，生产环境使用 public/widgets 下的产物

const isLocal = process.env.NODE_ENV === 'development';

export const widgets = [
  {
    name: 'bi-filter-bar',
    vueVersion: '2',
    js: isLocal ? 'http://localhost:8081/bi-filter-bar.js' : '/widgets/bi-filter-bar.js',
    config: {
      title: '筛选栏',
      filters: [
        { field: 'region', label: '地区', default: 'all', options: [
          { value: 'all', label: '全部' },
          { value: 'east', label: '华东' },
          { value: 'west', label: '华西' },
          { value: 'north', label: '华北' },
          { value: 'south', label: '华南' }
        ]},
        { field: 'period', label: '周期', default: 'month', options: [
          { value: 'day', label: '日' },
          { value: 'week', label: '周' },
          { value: 'month', label: '月' },
          { value: 'year', label: '年' }
        ]}
      ]
    }
  },
  {
    name: 'bi-data-source',
    vueVersion: '3',
    js: isLocal ? 'http://localhost:8082/bi-data-source.js' : '/widgets/bi-data-source.js',
    config: {
      title: '数据源面板',
      metrics: [
        { id: 'sales', name: '销售额', value: 128000, unit: '元' },
        { id: 'orders', name: '订单数', value: 342, unit: '单' },
        { id: 'users', name: '活跃用户', value: 1560, unit: '人' }
      ],
      refreshInterval: 0
    }
  },
  {
    name: 'bi-metric-cards',
    vueVersion: '3',
    js: isLocal ? 'http://localhost:8082/bi-metric-cards.js' : '/widgets/bi-metric-cards.js',
    config: {
      title: '指标卡组',
      cards: [
        { id: 'growth', label: '增长率', value: '23.5%', trend: 'up', trendValue: '5.2%', extra: '同比上月' },
        { id: 'retention', label: '留存率', value: '68.2%', trend: 'down', trendValue: '2.1%', extra: '7日留存' },
        { id: 'conversion', label: '转化率', value: '4.8%', trend: 'up', trendValue: '0.8%', extra: '下单转化' },
        { id: 'revenue', label: '客单价', value: '¥374', trend: 'up', trendValue: '12元', extra: '平均订单金额' }
      ]
    }
  },
  {
    name: 'bi-chart-panel',
    vueVersion: '2',
    js: isLocal ? 'http://localhost:8081/bi-chart-panel.js' : '/widgets/bi-chart-panel.js',
    config: {
      title: '图表面板',
      chartType: 'bar'
    }
  },
  {
    name: 'bi-event-tester',
    vueVersion: '2',
    js: isLocal ? 'http://localhost:8081/bi-event-tester.js' : '/widgets/bi-event-tester.js',
    config: { title: '事件测试器' }
  },
  {
    name: 'bi-crash-tester',
    vueVersion: '3',
    js: isLocal ? 'http://localhost:8082/bi-crash-tester.js' : '/widgets/bi-crash-tester.js',
    config: { title: '崩溃测试器' }
  },
  // 错误边界演示：指向不存在的 JS 文件，应触发加载失败降级占位
  {
    name: 'bi-load-fail-test',
    vueVersion: '2',
    js: '/widgets/bi-not-exist.js',
    config: { title: '加载失败测试（应降级）' }
  }
];
