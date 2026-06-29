// manual 模式示例入口：不再传 deps（模板已不全量加载 UI 库），组件注册由 SFC 自己负责
import FinancePanel from './FinancePanel.vue';
import { createVue3Widget } from '@wc/core/templates/vue3';

export default createVue3Widget(FinancePanel);
