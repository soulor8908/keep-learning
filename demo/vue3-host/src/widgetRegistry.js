// 基座物料注册表
// 通过 wc/widget-registry 模块从远程加载物料清单，
// 远程失败时回退到本地 FALLBACK_WIDGETS。
// 统一使用 /widgets/ 相对路径，无需额外启动 widget-lib dev server。

import { createRegistry } from '@wc/widget-registry';

// 本地兜底清单：远程注册表不可用时使用。
// 统一使用 /widgets/ 相对路径（public/widgets 下的预构建产物）。
// 注意：不包含 title prop —— 物料内部通过 t('xxx.title') 自行翻译，
// 避免注册表硬编码中文导致语言切换时 title 覆盖内部 i18n 兜底。
const FALLBACK_WIDGETS = [
  {
    name: 'bi-filter-bar',
    vueVersion: '2',
    js: '/widgets/bi-filter-bar.js',
    props: {
      filters: [
        { field: 'region', default: 'all', options: ['all', 'east', 'west', 'north', 'south'] },
        { field: 'period', default: 'month', options: ['day', 'week', 'month', 'year'] }
      ]
    }
  },
  {
    name: 'bi-data-source',
    vueVersion: '3',
    js: '/widgets/bi-data-source.js',
    css: '/widgets/bi-data-source.css',
    props: {
      metrics: [
        { id: 'sales', value: 128000 },
        { id: 'orders', value: 342 },
        { id: 'users', value: 1560 }
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
      cards: [
        { id: 'growth', value: '23.5%', trend: 'up', trendValue: '5.2%' },
        { id: 'retention', value: '68.2%', trend: 'down', trendValue: '2.1%' },
        { id: 'conversion', value: '4.8%', trend: 'up', trendValue: '0.8%' },
        { id: 'revenue', value: '374', trend: 'up', trendValue: '12' }
      ]
    }
  },
  {
    name: 'bi-chart-panel',
    vueVersion: '3',
    js: '/widgets/bi-chart-panel.js',
    props: {
      chartType: 'bar'
    }
  },
  {
    name: 'bi-event-tester',
    vueVersion: '2',
    js: '/widgets/bi-event-tester.js'
  },
  {
    name: 'bi-crash-tester',
    vueVersion: '3',
    js: '/widgets/bi-crash-tester.js',
    css: '/widgets/bi-crash-tester.css'
  },
  // ===== 交叉页面演示：三业务域物料同页（Vue2 + Vue3 + 原生 H5）=====
  // 直接用 /widgets/ 路径，确保仅启动 vue3-host 即可运行，无需三个 widget-lib dev server
  {
    name: 'bi-orders-panel',
    vueVersion: '2',
    js: '/widgets/bi-orders-panel.js',
    props: {
      orders: [
        { id: 'ORD-1001', amount: 299.00 },
        { id: 'ORD-1002', amount: 588.00 },
        { id: 'ORD-1003', amount: 2199.00 },
        { id: 'ORD-1004', amount: 1299.00 }
      ]
    }
  },
  {
    name: 'bi-payment-panel',
    vueVersion: '3',
    js: '/widgets/bi-payment-panel.js',
    css: '/widgets/bi-payment-panel.css',
    props: {
      amount: 4385.00,
      methods: ['alipay', 'wechat', 'card']
    }
  },
  {
    name: 'bi-recommend-panel',
    vueVersion: 'none',
    js: '/widgets/bi-recommend-panel.js',
    props: {
      items: [
        { id: 'REC-01', price: 159 },
        { id: 'REC-02', price: 399 },
        { id: 'REC-03', price: 49 }
      ]
    }
  },
  // 错误边界演示：指向不存在的 JS 文件，应触发加载失败降级占位
  {
    name: 'bi-load-fail-test',
    vueVersion: '2',
    js: '/widgets/bi-not-exist.js'
  }
];

// 创建注册表实例：
// 统一从 /widgets/registry.json 拉取注册表，失败时回退到 FALLBACK_WIDGETS。
const registry = createRegistry({
  url: '/widgets/registry.json',
  fallback: FALLBACK_WIDGETS,
  cacheKey: 'widget-registry-vue3-host',
  timeout: 8000
});

/**
 * 加载物料清单（远程优先，失败回退本地）
 * 远程数据与本地 FALLBACK_WIDGETS 做字段级合并：
 * - 远程提供结构性字段（js、css、vueVersion）
 * - 本地提供展示字段（props、title），远程未覆盖时保留本地 i18n 数据
 * - 远程条目中缺失的 name 回退到本地同名条目
 * @param {boolean} [force=false] 强制刷新缓存
 * @returns {Promise<Array>}
 */
export async function loadWidgets(force = false) {
  const remote = await registry.fetch(force);
  // 构建本地索引，用于字段级合并
  const localMap = new Map(FALLBACK_WIDGETS.map(w => [w.name, w]));
  return remote.map(remoteItem => {
    const localItem = localMap.get(remoteItem.name);
    if (!localItem) return remoteItem;
    // 字段级合并：远程覆盖结构字段（js/css/vueVersion），
    // 远程未提供的字段（如 props）保留本地定义
    return { ...localItem, ...remoteItem };
  });
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

/**
 * 语言切换时刷新物料定义
 * 清除注册表内存缓存，重新拉取物料清单（force=true 绕过缓存），
 * 使 getWidgetDefs() 能根据新 locale 生成新的 props。
 * @returns {Promise<Array>} 刷新后的物料清单
 */
export async function refreshWidgetsForLocale() {
  registry.clearCache();
  return loadWidgets(true);
}
