// 基座物料注册表
// 通过 wc/widget-registry 模块从远程加载物料清单，
// 远程失败时回退到本地 FALLBACK_WIDGETS。
// 统一使用 /widgets/ 相对路径，无需额外启动 widget-lib dev server。

import { createRegistry } from '@wc/widget-registry';

// 本地兜底清单：远程注册表不可用时使用。
// 统一使用 /widgets/ 相对路径（public/widgets 下的预构建产物）。
const FALLBACK_WIDGETS = [
  {
    name: 'bi-filter-bar',
    vueVersion: '2',
    js: '/widgets/bi-filter-bar.js',
    props: {
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
    js: '/widgets/bi-data-source.js',
    css: '/widgets/bi-data-source.css',
    props: {
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
    js: '/widgets/bi-metric-cards.js',
    css: '/widgets/bi-metric-cards.css',
    props: {
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
    js: '/widgets/bi-chart-panel.js',
    props: {
      title: '图表面板',
      chartType: 'bar'
    }
  },
  {
    name: 'bi-event-tester',
    vueVersion: '2',
    js: '/widgets/bi-event-tester.js',
    props: { title: '事件测试器' }
  },
  {
    name: 'bi-crash-tester',
    vueVersion: '3',
    js: '/widgets/bi-crash-tester.js',
    css: '/widgets/bi-crash-tester.css',
    props: { title: '崩溃测试器' }
  },
  // ===== 交叉页面演示：三业务域物料同页（Vue2 + Vue3 + 原生 H5）=====
  // 直接用 /widgets/ 路径，确保仅启动 vue2-host 即可运行，无需三个 widget-lib dev server
  {
    name: 'bi-orders-panel',
    vueVersion: '2',
    js: '/widgets/bi-orders-panel.js',
    props: {
      title: '订单区',
      orders: [
        { id: 'ORD-1001', name: '无线蓝牙耳机', amount: 299.00, status: '已支付' },
        { id: 'ORD-1002', name: '机械键盘', amount: 588.00, status: '待发货' },
        { id: 'ORD-1003', name: '4K 显示器', amount: 2199.00, status: '已发货' },
        { id: 'ORD-1004', name: '人体工学椅', amount: 1299.00, status: '已完成' }
      ]
    }
  },
  {
    name: 'bi-payment-panel',
    vueVersion: '3',
    js: '/widgets/bi-payment-panel.js',
    css: '/widgets/bi-payment-panel.css',
    props: {
      title: '支付区',
      amount: 4385.00,
      methods: [
        { id: 'alipay', label: '支付宝' },
        { id: 'wechat', label: '微信支付' },
        { id: 'card', label: '银行卡' }
      ]
    }
  },
  {
    name: 'bi-recommend-panel',
    vueVersion: 'none',
    js: '/widgets/bi-recommend-panel.js',
    props: {
      title: '推荐区',
      items: [
        { id: 'REC-01', name: 'USB-C 扩展坞', price: 159, tag: '热销' },
        { id: 'REC-02', name: '降噪入耳耳机', price: 399, tag: '新品' },
        { id: 'REC-03', name: '桌面理线器', price: 49, tag: '优惠' }
      ]
    }
  },
  // 错误边界演示：指向不存在的 JS 文件，应触发加载失败降级占位
  {
    name: 'bi-load-fail-test',
    vueVersion: '2',
    js: '/widgets/bi-not-exist.js',
    props: { title: '加载失败测试（应降级）' }
  }
];

// 创建注册表实例：
// 统一从 /widgets/registry.json 拉取注册表，失败时回退到 FALLBACK_WIDGETS。
const registry = createRegistry({
  url: '/widgets/registry.json',
  fallback: FALLBACK_WIDGETS,
  cacheKey: 'widget-registry-vue2-host',
  timeout: 8000
});

/**
 * 加载物料清单（远程优先，失败回退本地）
 * @param {boolean} [force=false] 强制刷新缓存
 * @returns {Promise<Array>}
 */
export async function loadWidgets(force = false) {
  return registry.fetch(force);
}

/**
 * 按名称查找物料
 * @param {string} name
 * @returns {Promise<object|null>}
 */
export function findWidget(name) {
  return registry.find(name);
}

export { registry };
