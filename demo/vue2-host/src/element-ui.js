import Vue from 'vue';
import { Card, Row, Progress, Button, Col, Tag, Select, Option } from 'element-ui';
import 'element-ui/lib/theme-chalk/base.css';
import 'element-ui/lib/theme-chalk/card.css';
import 'element-ui/lib/theme-chalk/row.css';
import 'element-ui/lib/theme-chalk/progress.css';
import 'element-ui/lib/theme-chalk/button.css';
import 'element-ui/lib/theme-chalk/col.css';
import 'element-ui/lib/theme-chalk/tag.css';
import 'element-ui/lib/theme-chalk/select.css';
import 'element-ui/lib/theme-chalk/option.css';

Vue.use(Card);
Vue.use(Row);
Vue.use(Progress);
Vue.use(Button);
Vue.use(Col);
Vue.use(Tag);
Vue.use(Select);
Vue.use(Option);

// element-ui 没有 Statistic 组件，注册一个全局自定义统计组件
Vue.component('el-statistic', {
  props: { label: String, value: [String, Number], prefix: String, suffix: String },
  template: '<div style="flex:1;padding:12px;background:#f3f4f6;border-radius:6px"><div style="font-size:12px;color:#6b7280;margin-bottom:4px">{{ label }}</div><div style="font-size:20px;font-weight:600;color:#111827">{{ prefix }}{{ value }}<span style="font-size:14px;color:#6b7280;margin-left:2px">{{ suffix }}</span></div></div>'
});

// element-ui 没有专门的 list-item，用 div 实现
Vue.component('el-list-item', {
  props: { label: String, value: String },
  template: '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px"><span style="color:#6b7280">{{ label }}</span><span style="color:#111827;font-weight:500">{{ value }}</span></div>'
});

// footer 用简单 div
Vue.component('el-footer-text', {
  template: '<div style="font-size:12px;color:#6b7280"><slot/></div>'
});
