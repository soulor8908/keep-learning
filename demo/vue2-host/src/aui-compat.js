/**
 * aui 兼容层（ElementUI 迁移后）
 *
 * 背景：widget-loader 的 checkDependencies 会校验 window.aui 版本契约。
 * 项目已从 aui 迁移到 ElementUI（element-ui / element-plus），
 * aui-* 自定义元素不再使用，但版本契约机制仍需要 window.aui 存在。
 *
 * 本文件只设置 window.aui 版本号，不注册任何 aui-* 组件，
 * 让版本契约校验通过，同时避免 aui 与 ElementUI 组件冲突。
 */
window.aui = { version: '1.8.2' };
