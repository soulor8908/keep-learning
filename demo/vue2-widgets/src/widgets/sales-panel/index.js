import SalesPanel from './SalesPanel.vue';
import { createVue2Widget } from '@wc/core/templates/vue2';

export default createVue2Widget(SalesPanel, {
  deps: ['element-ui']
});
