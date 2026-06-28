import { createVue3Widget } from '@wc/core/templates/vue3';

import FinancePanel from './widgets/finance-panel/FinancePanel.vue';
import UserPanel from './widgets/user-panel/UserPanel.vue';

const plugins = window.ElementPlus ? [window.ElementPlus] : [];
const deps = ['element-plus'];

export default {
  biFinancePanel: createVue3Widget(FinancePanel, { plugins, deps }),
  biUserPanel: createVue3Widget(UserPanel, { plugins, deps })
};
