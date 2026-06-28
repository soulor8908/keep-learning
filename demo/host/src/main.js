import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import App from './App.vue';

const app = createApp(App);

// 基座自身使用 ElementPlus（与 window.ElementPlus 独立）
app.use(ElementPlus);

app.mount('#app');
