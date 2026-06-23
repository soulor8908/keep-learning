// English language pack (shared by aui / widget-loader / widget business copy)
export default {
  loader: {
    version_mismatch: 'Version check failed, widget "{name}" rejected:',
    dep_missing: 'Widget "{name}" depends on {dep} ({range}), but host does not provide {globalVar} runtime',
    dep_version: 'Widget "{name}" requires {dep} {range}, but host provides {actual}',
    dep_aui_missing: 'Widget "{name}" depends on aui ({range}), but host does not provide aui runtime',
    dep_aui_version: 'Widget "{name}" requires aui {range}, but host provides {actual}',
    mount_failed: 'Widget "{name}" mount failed, degraded:',
    load_failed: 'Widget "{name}" load failed, degraded:',
    runtime_crash: 'Widget "{name}" crashed at runtime, isolated:',
    retry: 'Retry'
  },
  sales: {
    title: 'Sales Dashboard',
    amount_label: 'Revenue',
    order_label: 'Orders',
    period_day: 'Today',
    period_week: 'This Week',
    period_month: 'This Month',
    period_year: 'This Year',
    period_label: 'Period'
  },
  finance: {
    title: 'Finance Dashboard',
    income_label: 'Total Income',
    expense_label: 'Total Expense',
    labor: 'Labor Cost',
    marketing: 'Marketing',
    infrastructure: 'Infrastructure',
    currency_label: 'Currency',
    cny: 'CNY',
    usd: 'USD'
  }
};
