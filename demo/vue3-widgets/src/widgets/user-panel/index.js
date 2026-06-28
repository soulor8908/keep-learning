import UserPanel from './UserPanel.vue';
import { createVue3Widget } from '@wc/core/templates/vue3';

export default createVue3Widget(UserPanel, {
  plugins: window.ElementPlus ? [window.ElementPlus] : [],
  deps: ['element-plus']
});
