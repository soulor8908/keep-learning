/**
 * 把原生 H5 物料的 mount 函数包装成 { mount } 对象，
 * 由 loader 在运行时进一步转为 Vue3 组件。
 *
 * @param {(container: HTMLElement, props: object) => void} mountFn
 * @returns {{ mount: Function }}
 */
export function createH5Widget(mountFn) {
  return {
    mount(container, props) {
      mountFn(container, props);
    }
  };
}
