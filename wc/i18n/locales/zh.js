// 中文语言包（aui / widget-loader / 物料业务文案共用）
export default {
  loader: {
    version_mismatch: '版本校验失败，已拒绝加载物料 "{name}"：',
    dep_missing: '物料 "{name}" 依赖 {dep}（{range}），但基座未提供 {globalVar} 运行时',
    dep_version: '物料 "{name}" 要求 {dep} {range}，但基座提供 {actual}',
    dep_aui_missing: '物料 "{name}" 依赖 aui（{range}），但基座未提供 aui 运行时',
    dep_aui_version: '物料 "{name}" 要求 aui {range}，但基座提供 {actual}',
    mount_failed: '物料 "{name}" 挂载失败，已降级：',
    load_failed: '物料 "{name}" 加载失败，已降级：',
    runtime_crash: '物料 "{name}" 运行时崩溃，已降级隔离：',
    retry: '点击重试'
  },
  sales: {
    title: '销售看板',
    amount_label: '销售额',
    order_label: '订单数',
    period_day: '今日',
    period_week: '本周',
    period_month: '本月',
    period_year: '本年',
    period_label: '周期'
  },
  finance: {
    title: '财务看板',
    income_label: '总收入',
    expense_label: '总支出',
    labor: '人力成本',
    marketing: '市场推广',
    infrastructure: '基础设施',
    currency_label: '币种',
    cny: '人民币',
    usd: '美元'
  }
};
