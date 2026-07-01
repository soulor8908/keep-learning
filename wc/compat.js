/**
 * 浏览器兼容（可选项）
 *
 * 纯 ESM + importmap 方案要求浏览器原生支持 importmap：
 *   Chrome 89+ / Edge 89+ / Firefox 108+ / Safari 16.4+
 * 对不支持 importmap 但支持原生 ESM 的旧浏览器（如 Safari 16.3、旧版 Edge），
 * 引入 es-module-shims 作为 polyfill 即可，无需改动物料与基座代码。
 *
 * es-module-shims 在已支持 importmap 的浏览器里是 no-op，因此也可以无条件引入；
 * 这里做成「可选项」纯粹是为了不在现代浏览器多拉一个 ~6KB 的脚本。
 *
 * 两种接入方式：
 *   1. 静态 HTML / 非 Vite 基座：运行时调用 injectImportmapShim()，按需注入
 *   2. Vite 基座：importmapInjectPlugin({ compat: true }) 在构建/启动时注入 shim 标签
 *      （见各 host 的 vite.config.js，用 COMPAT=true 环境变量开启）
 */

// es-module-shims 官方 CDN（jspm.io 镜像）。内网/离线环境可用 window.__WIDGET_SHIM_URL__ 覆盖。
export const DEFAULT_SHIM_URL = 'https://ga.jspm.io/npm:es-module-shims@1.10.0/dist/es-module-shims.js';

/**
 * 当前浏览器是否原生支持 importmap。
 * 在非浏览器环境（SSR / 测试）直接返回 false，避免访问未定义 API。
 * @returns {boolean}
 */
export function supportsImportmap() {
  if (typeof window === 'undefined' || typeof HTMLScriptElement === 'undefined') return false;
  return typeof HTMLScriptElement.supports === 'function'
    && HTMLScriptElement.supports('importmap');
}

/**
 * 运行时按需注入 es-module-shims（仅在浏览器不支持原生 importmap 时）。
 *
 * 必须在页面已有的 <script type="importmap"> 之前调用——es-module-shims 需要在
 * importmap 与模块脚本执行前就绪。对 Vite 基座建议用 vite 插件注入（更早、更稳）；
 * 本函数面向静态 HTML 或无法走构建管的页面。
 *
 * @param {object} [options]
 * @param {string} [options.url]  自定义 es-module-shims URL（默认走 DEFAULT_SHIM_URL，可被 window.__WIDGET_SHIM_URL__ 覆盖）
 * @param {boolean} [options.force]  强制注入（即使浏览器已支持 importmap，用于调试）
 * @returns {boolean} 是否实际注入了 shim
 */
export function injectImportmapShim(options = {}) {
  if (typeof document === 'undefined') return false;
  if (!options.force && supportsImportmap()) return false;

  const url =
    options.url ||
    (typeof window !== 'undefined' && window.__WIDGET_SHIM_URL__) ||
    DEFAULT_SHIM_URL;

  // 已注入则跳过
  if (document.querySelector(`script[data-es-module-shims]`)) return false;

  const shim = document.createElement('script');
  shim.src = url;
  shim.async = true;
  shim.setAttribute('data-es-module-shims', '');
  // es-module-shims 默认会 polyfill，无需额外配置；如需更细控制可设 shim.setAttribute('data-shim-mode', ...) 等。

  // 注入到 head 最前面，尽量早于 importmap / 模块脚本
  const head = document.head || document.documentElement;
  head.insertBefore(shim, head.firstChild);
  return true;
}
