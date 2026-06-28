import OrderPanel from './OrderPanel.vue';
import { createVue2Widget } from '@wc/core/templates/vue2';

export default createVue2Widget(OrderPanel, {
  plugins: window.ELEMENT ? [window.ELEMENT] : [],
  deps: ['element-ui']
});
