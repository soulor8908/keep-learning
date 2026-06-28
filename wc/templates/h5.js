/**
 * H5 物料入口模板
 * 纯 JS，不依赖 Vue
 *
 * @example
 *   import { createH5Widget } from '@wc/templates/h5.js';
 *   import { render } from './render.js';
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
