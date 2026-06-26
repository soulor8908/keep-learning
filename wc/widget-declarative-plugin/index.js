/**
 * 声明式物料使用插件（统一入口）
 *
 * 导出：
 * - babelPlugin        Babel 插件（用于 babel.config.js / Vue CLI）
 * - vitePlugin         Vite 插件（用于 vite.config.js）
 * - runtime            运行时 helper（widgetMount），可直接 import 使用
 * - widgetMount        运行时 helper 别名
 *
 * 让物料使用像普通组件/函数调用：
 *
 *   // 1) 宏形式（任意 JS/TS/JSX）
 *   import { $widget } from 'wc/widget-declarative-plugin';
 *   const el = await $widget('bi-sales-panel', { title: '销售面板' });
 *
 *   // 2) JSX 形式（.jsx/.tsx，需配 Babel/Vite 插件）
 *   <Widget name="bi-sales-panel" props={{ title: '销售面板' }} />
 *
 *   // 3) 直接运行时调用（无需构建期转换）
 *   import { widgetMount } from 'wc/widget-declarative-plugin/runtime';
 *   await widgetMount({ name: 'bi-sales-panel' }, container, props);
 */

export { default as babelPlugin } from './babel-plugin.js';
export { default as vitePlugin, default as defaultVitePlugin } from './vite-plugin.js';
export { default as widgetMount, default } from './runtime.js';
