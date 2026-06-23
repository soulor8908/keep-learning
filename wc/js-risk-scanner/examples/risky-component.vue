<template>
  <div class="test-risk">
    {{ msg }}
  </div>
</template>

<script>
import { createStore } from 'vuex';
import mitt from 'mitt';

// 全局变量污染
window.sharedData = { count: 0 };

// 全局组件注册
Vue.component('global-comp', {});
Vue.use(SomePlugin);
Vue.prototype.$api = {};

// 全局状态
const store = new Vuex.Store({});

// 事件总线
const bus = new Vue({});
const emitter = new mitt();

export default {
  data() {
    return { msg: 'risk' };
  },
  mounted() {
    // body 挂载弹窗
    document.body.appendChild(this.$refs.dialog);
    document.body.innerHTML = '<div></div>';

    // 全局 DOM 查询
    const el = document.getElementById('global-element');
    document.querySelector('.global-class');
  }
};
</script>
