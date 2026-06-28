import FinancePanel from './FinancePanel.vue';
import { createVue3Widget } from '@wc/core/templates/vue3';

export default createVue3Widget(FinancePanel, {
  plugins: window.ElementPlus ? [window.ElementPlus] : []
});
