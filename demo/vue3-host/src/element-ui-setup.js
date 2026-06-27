/**
 * ElementUI 全局注册（供 Vue2 物料使用）
 *
 * vue3-host 通过 <script> 标签加载 ElementUI UMD（/vendor/element-ui.js），
 * UMD 将组件集合挂到 window.ELEMENT，但不会自动调用 Vue2.use() 注册组件。
 * 本模块从 window 全局变量取出 Vue2 构造函数与 ELEMENT 组件库，
 * 调用 Vue2.use(ELEMENT) 将所有 el-* 组件注册为全局组件，
 * 使 Vue2 物料在模板中使用的 <el-card>、<el-table> 等标签能正确渲染。
 *
 * 必须在 index.html 的 <script src="/vendor/vue@2.js"> 和
 * <script src="/vendor/element-ui.js"> 之后执行（由 ESM module 加载顺序保证）。
 */

const Vue2 = window.Vue2;
const ELEMENT = window.ELEMENT;

if (Vue2 && ELEMENT) {
  Vue2.use(ELEMENT);
} else {
  console.warn(
    '[vue3-host] ElementUI 注册失败：',
    !Vue2 ? 'window.Vue2 未就绪' : '',
    !ELEMENT ? 'window.ELEMENT 未就绪' : ''
  );
}
