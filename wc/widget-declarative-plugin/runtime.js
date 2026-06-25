/**
 * 声明式物料使用的运行时 helper
 *
 * 由 Babel 插件转换后的代码调用：
 *   widgetMount(meta, container, config)
 *
 * 职责：
 * 1. 解析物料元信息：若 meta 已含 js/css（构建期内联），直接用；否则只给 name，
 *    通过远程 registry 查找（懒加载 widget-registry）。
 * 2. 调用 widget-loader 的 loadWidget + mountWidget 完成加载与挂载。
 * 3. 将 config 写入物料的 config attribute（Custom Element 协议）。
 * 4. 返回挂载的物料元素，方便调用方做后续操作（卸载、状态读取等）。
 *
 * container 行为：
 *   - 传入 DOM 元素：直接挂载到该元素
 *   - 传入 undefined/null：自动创建一个 <div class="widget-host">，调用方需自行
 *     插入到文档（JSX 中作为表达式会渲染该 div）
 *
 * 返回值：Promise<HTMLElement> —— 挂载完成的物料元素（或容器，未就绪时）
 */

let loaderModulePromise = null;
let registryModulePromise = null;

/**
 * 懒加载 widget-loader（避免顶层 import 在非浏览器环境报错，也减小首屏体积）
 */
async function getLoader() {
  if (!loaderModulePromise) {
    loaderModulePromise = import('../widget-loader/index.js').then(m => m.defaultLoader || m);
  }
  return loaderModulePromise;
}

/**
 * 懒加载 widget-registry（仅当 meta 未内联 js 时才需要远程解析）
 */
async function getRegistry() {
  if (!registryModulePromise) {
    registryModulePromise = import('../widget-registry/index.js').then(m => m.defaultRegistry || (m.createRegistry ? m.createRegistry({ fallback: [] }) : null));
  }
  return registryModulePromise;
}

/**
 * 解析物料元信息
 * @param {object} meta 构建期内联的 { name, js?, css?, vueVersion? }
 * @returns {Promise<object>} 完整物料配置 { name, js, css, vueVersion? }
 */
async function resolveMeta(meta) {
  if (meta && meta.js) return meta; // 构建期已内联完整元信息
  if (!meta || !meta.name) {
    throw new Error('[widgetMount] meta.name is required');
  }
  // 仅给了 name：运行时远程解析
  const registry = await getRegistry();
  if (!registry || typeof registry.find !== 'function') {
    throw new Error(`[widgetMount] 物料 ${meta.name} 未在构建期 registry 内联，且运行时 registry 不可用`);
  }
  const found = await registry.find(meta.name);
  if (!found) {
    throw new Error(`[widgetMount] 远程 registry 中未找到物料 ${meta.name}`);
  }
  return found;
}

/**
 * 挂载物料
 * @param {object} meta { name, js?, css?, vueVersion? }
 * @param {HTMLElement} [container] 挂载容器；为空则自动创建
 * @param {object} [config] 物料 config
 * @returns {Promise<HTMLElement>} 挂载的物料元素（自动容器场景返回容器元素）
 */
export async function widgetMount(meta, container, config) {
  const fullMeta = await resolveMeta(meta);

  // 自动创建容器
  let host = container;
  let autoCreated = false;
  if (!host) {
    if (typeof document === 'undefined') {
      throw new Error('[widgetMount] container is required in non-DOM environment');
    }
    host = document.createElement('div');
    host.className = 'widget-host';
    autoCreated = true;
  }

  const loader = await getLoader();

  // 加载物料资源（JS/CSS），并注册 Custom Element
  await loader.loadWidget(fullMeta);

  // 挂载：mountWidget 内部会创建 Custom Element 实例并 append 到 container
  const element = await loader.mountWidget(host, fullMeta);

  // 写入 config（Custom Element 通过 config attribute 接收配置）
  if (config !== undefined && config !== null && element && 'setAttribute' in element) {
    try {
      element.setAttribute('config', typeof config === 'string' ? config : JSON.stringify(config));
    } catch (e) {
      // config 序列化失败（如循环引用），降级为空配置，不阻断挂载
      console.warn(`[widgetMount] 物料 ${fullMeta.name} config 序列化失败:`, e.message);
    }
  }

  // 自动容器场景：返回容器（含物料），调用方可插入文档
  return autoCreated ? host : element;
}

export default widgetMount;
