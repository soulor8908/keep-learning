/**
 * H5 物料入口模板（ESM 版）
 * 纯 JS，不依赖 Vue。与 UMD 版本完全一致——H5 物料本身没有共享依赖，
 * UMD 与 ESM 两种打包格式对它而言只是输出产物不同。
 *
 * @example
 *   import { render } from './render.js';
 *   import { createH5Widget } from '@wc/core/templates/h5';
 *   export default createH5Widget(render);
 */

/**
 * @param {(container: HTMLElement, props: object) => (() => void) | void} renderFn
 * @returns {{ mount: Function, unmount: Function }}
 */
export function createH5Widget(renderFn) {
  return {
    mount(container, props = {}) {
      const cleanup = renderFn(container, props);
      return {
        unmount: () => {
          if (typeof cleanup === 'function') {
            cleanup();
          }
          if (container) {
            container.innerHTML = '';
          }
        }
      };
    }
  };
}
