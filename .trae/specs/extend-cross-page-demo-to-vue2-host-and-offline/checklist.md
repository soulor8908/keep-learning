# 验收清单：vue2-host 交叉页面演示 + 离线 Vendor

> change-id: `extend-cross-page-demo-to-vue2-host-and-offline`

## vue2-host 交叉页面
- [ ] public/widgets 含 orders/payment/recommend 三个产物
- [ ] widgetRegistry.js 注册三物料（vueVersion 2/3/none）
- [ ] App.vue 含交叉页面 section + tech-tag
- [ ] mountCrossPage 挂载三物料
- [ ] 日志区监听 order:click/payment:success/recommend:expose

## Vue 运行时本地化
- [ ] vue2-host/public/vendor/vue@3.js 存在
- [ ] vue3-host/public/vendor/vue@2.js 存在
- [ ] vue2-host index.html 指向本地 vendor（无 unpkg）
- [ ] vue3-host index.html 指向本地 vendor（无 unpkg）
- [ ] 两个 host package.json 含 setup:vendors 脚本

## 运行验收
- [ ] vue2-host 启动后交叉页面三物料渲染成功
- [ ] 点击触发事件，日志区显示
- [ ] 离线（无 unpkg）两个 host 仍可加载对方 Vue 运行时
- [ ] `npm run setup:vendors` 可复现 vendor
- [ ] `npm run test:run` 全绿
