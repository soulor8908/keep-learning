import { createVue2Widget } from '@wc/core/templates/vue2';

import SalesPanel from './widgets/sales-panel/SalesPanel.vue';
import OrderPanel from './widgets/order-panel/OrderPanel.vue';

const plugins = window.ELEMENT ? [window.ELEMENT] : [];
const deps = ['element-ui'];

export default {
  biSalesPanel: createVue2Widget(SalesPanel, { plugins, deps }),
  biOrderPanel: createVue2Widget(OrderPanel, { plugins, deps })
};
