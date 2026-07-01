<template>
  <div class="v2host">
    <header class="v2host__header">
      <h1>Vue2 Host <small class="v2host__tag">纯 ESM + importmap</small></h1>
      <p class="v2host__subtitle">
        基座是 Vue2。同栈物料（Vue2）走 ESM 直引，跨栈物料（Vue3/H5）走 loader 动态 import()；
        依赖隔离与共享全部交给 importmap，无 window 全局变量。
      </p>
    </header>

    <main class="v2host__grid">
      <section class="v2host__card" v-for="w in widgets" :key="w.key">
        <header class="v2host__card-head">
          <span class="badge" :class="`badge--${w.key}`">{{ w.tag }}</span>
          <h2>{{ w.title }}</h2>
        </header>
        <div :ref="`${w.key}Mount`" class="v2host__mount"></div>
      </section>
    </main>

    <aside class="v2host__log">
      <header class="v2host__log-head">
        <h3>事件日志</h3>
        <button @click="events = []">清空</button>
      </header>
      <ul v-if="events.length" class="v2host__log-list">
        <li v-for="(e, i) in events" :key="i">
          <span class="time">{{ e.time }}</span>
          <strong>{{ e.widget }}</strong>
          <span class="event">{{ e.event }}</span>
          <code v-if="e.payload">{{ JSON.stringify(e.payload) }}</code>
        </li>
      </ul>
      <p v-else class="v2host__log-empty">点击物料内的按钮，事件会出现在这里</p>
    </aside>
  </div>
</template>

<script>
import Vue from 'vue';
import { mountWidget, unmountWidget } from '@wc/core/loader';

// ─── 同栈物料：ESM 直引 ───
// 同栈 Vue2 物料无需中转，直接 import SFC，由 Vite 编译挂载，与基座共享同一份 Vue2。
import SalesPanel from '../../vue2-widgets/src/widgets/sales-panel/SalesPanel.vue';

// ─── 注册表 ───
// stack 字段决定挂载路径：
//   'esm-vue2' → new Vue({ render: h => h(Component, { props }) })，element-ui 由基座 Vue.use 注册
//   'loader'   → mountWidget，url 前缀（vue3/h5）决定 importmap scope
const WIDGETS = [
  { key: 'vue2', tag: 'Vue2 · ESM',    title: '销售面板', stack: 'esm-vue2', component: SalesPanel },
  { key: 'vue3', tag: 'Vue3 · loader', title: '财务面板', stack: 'loader', name: 'finance-panel', url: '/widgets/vue3/finance-panel.js', css: '/widgets/vue3/finance-panel.css' },
  { key: 'h5',   tag: 'H5 · loader',   title: '时钟组件', stack: 'loader', name: 'clock-widget',  url: '/widgets/h5/clock-widget.js' }
];

// 同栈 Vue2 物料的轻量挂载：不走 createVue2Widget 模板，直接 new Vue
function mountVue2ESM(container, Component, props) {
  const app = new Vue({ render: (h) => h(Component, { props }) });
  app.$mount(container);
  return { unmount: () => { app.$destroy(); if (container) container.innerHTML = ''; } };
}

export default {
  name: 'Vue2Host',
  data() {
    return {
      widgets: WIDGETS,
      events: [],
      apis: {}
    };
  },
  mounted() {
    this.mountAll();
  },
  beforeDestroy() {
    Object.values(this.apis).forEach(unmountWidget);
  },
  methods: {
    emitFactory(widgetName) {
      return (event, payload) => {
        this.events.unshift({
          widget: widgetName,
          event,
          payload,
          time: new Date().toLocaleTimeString()
        });
        if (this.events.length > 20) this.events.pop();
      };
    },
    async mountAll() {
      for (const w of this.widgets) {
        const container = this.$refs[`${w.key}Mount`];
        if (!container) continue;
        const props = { emit: this.emitFactory(w.name || w.key), title: w.title };
        if (w.stack === 'esm-vue2') {
          this.apis[w.key] = mountVue2ESM(container, w.component, props);
        } else {
          this.apis[w.key] = await mountWidget(container, {
            name: w.name,
            url: w.url,
            css: w.css,
            props
          });
        }
      }
    }
  }
};
</script>

<style scoped>
.v2host { padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #303133; }
.v2host__header { margin-bottom: 24px; }
.v2host__header h1 { margin: 0 0 4px; font-size: 24px; }
.v2host__tag { font-size: 12px; color: #3b82f6; font-weight: 400; margin-left: 8px; }
.v2host__subtitle { margin: 0; color: #909399; font-size: 13px; line-height: 1.6; max-width: 720px; }
.v2host__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.v2host__card { padding: 16px; border: 1px solid #e4e7ed; border-radius: 8px; background: #fff; }
.v2host__card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.v2host__card-head h2 { margin: 0; font-size: 15px; font-weight: 500; }
.v2host__mount { min-height: 120px; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #fff; }
.badge--vue2 { background: #42b983; }
.badge--vue3 { background: #35495e; }
.badge--h5 { background: #f56c2c; }
.v2host__log { margin-top: 24px; padding: 16px; border: 1px solid #e4e7ed; border-radius: 8px; background: #fafafa; }
.v2host__log-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.v2host__log-head h3 { margin: 0; font-size: 14px; }
.v2host__log-head button { padding: 4px 12px; border: 1px solid #dcdfe6; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
.v2host__log-list { list-style: none; padding: 0; margin: 0; }
.v2host__log-list li { padding: 6px 0; border-bottom: 1px dashed #ebeef5; font-size: 13px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.v2host__log-list .time { color: #909399; font-family: monospace; font-size: 12px; }
.v2host__log-list .event { color: #409eff; }
.v2host__log-list code { background: #f4f4f5; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
.v2host__log-empty { margin: 0; color: #909399; font-size: 13px; }
</style>
