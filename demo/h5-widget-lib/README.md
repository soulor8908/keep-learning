# h5-widget-lib —— 原生 H5 物料库 Demo

无框架依赖的轻量物料示例，使用 `h5-vite-plugin` 自动包装为 UMD Custom Element。

## 与 Vue 物料的区别

| 特性 | Vue2/Vue3 物料 | H5 物料 |
|------|---------------|---------|
| 框架依赖 | Vue2 / Vue3 | 无 |
| 入口 | `.vue` 组件 | `.js` 导出 render 函数或配置对象 |
| 响应式 | Vue 响应式系统 | 手动重渲染（props 变化时调 render） |
| 构建插件 | `widget-wrapper-plugin/vite-plugin` | `widget-wrapper-plugin/h5-vite-plugin` |
| 产物体积 | 较大（含 Vue 运行时 external） | 极小 |

## 入口约定

入口文件 `default` 导出两种形式：

**方式 A：纯函数（最简，适合纯展示物料）**

```js
export default function render(props, scope) {
  return `<div class="bi-xxx">...</div>`;
}
```

**方式 B：配置对象（需要生命周期回调）**

```js
export default {
  render(props, scope) { return `<div>...</div>`; },
  onMount(element, props, scope) {
    // 绑定事件、启动定时器
    return () => { /* 清理函数，卸载时自动调用 */ };
  },
  onUnmount(element, scope) { /* 额外清理 */ },
  onPropsChange(element, newProps, oldProps, scope) { /* props 变化 */ }
};
```

## 构建

```bash
npm install
npm run build:clock    # 构建 bi-clock-card
npm run build:notice   # 构建 bi-notice-board
npm run build:all      # 构建全部
```

产物：`dist/bi-xxx.js`（UMD）+ `dist/bi-xxx.css`

## 基座加载

基座通过 `widget-loader` 加载，声明 `vueVersion: 'none'` 跳过 Vue 校验：

```js
widgetLoader.mountWidget(container, {
  name: 'bi-clock-card',
  js: 'https://cdn.example.com/h5-widgets/bi-clock-card.js',
  css: 'https://cdn.example.com/h5-widgets/bi-clock-card.css',
  vueVersion: 'none',
  props: { label: '北京时间', timezone: 'Asia/Shanghai' }
});
```

## scope 注入

`h5-vite-plugin` 生成的 wrapper 会为每个实例创建 `widgetScope`（优先用基座提供的 `window.__wcWidgetScope__`，不可用时回退到内建最小 scope）。物料通过回调参数接收：

- `scope.context.get(key)` — 读取基座上下文
- `scope.bus.emit(type, payload)` — 跨物料事件
- `scope.log.info/warn/error(msg)` — 带物料名前缀的日志
- `scope.t(key)` — 国际化翻译
- `scope.request(url, options)` — 受控 fetch
- `scope.loader.loadWidget(child)` — 嵌套加载子物料（带循环检测）
