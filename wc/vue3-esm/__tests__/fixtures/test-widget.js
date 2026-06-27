import { h } from 'vue';

export default {
  props: {
    title: { type: String, default: 'Test Widget' }
  },
  setup(props) {
    return () => h('div', { class: 'test-widget' }, props.title);
  }
};
