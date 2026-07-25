/**
 * H5 物料入口模板（ESM 版）
 * 纯 JS，不依赖 Vue。
 *
 * @example
 *   import { render } from './render.js';
 *   import { createH5Widget } from '@wc/core/templates/h5';
 *   export default createH5Widget(render);
 */

/**
 * @param {(container: HTMLElement, props: object) => (() => void) | { cleanup?: () => void, update?: (props: object) => void } | void} renderFn
 *   返回清理函数（旧约定），或 { cleanup, update } 对象以支持 props 热更新
 * @returns {{ mount: Function }}
 */
export function createH5Widget(renderFn) {
  return {
    mount(container, props = {}) {
      const result = renderFn(container, props);
      const cleanup = typeof result === 'function' ? result : result?.cleanup;
      const update = typeof result?.update === 'function' ? result.update : undefined;
      return {
        unmount: () => {
          if (typeof cleanup === 'function') cleanup();
          if (container) container.innerHTML = '';
        },
        update
      };
    }
  };
}
