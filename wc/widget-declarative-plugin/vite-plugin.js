/**
 * 声明式物料使用插件 —— Vite 包装器
 *
 * 把 babel-plugin-widget-declarative 接入 Vite 的 transform 阶段：
 * - 对 .jsx / .tsx 文件应用 Babel 转换（含 JSX 宏与 $widget 宏）
 * - 对 .js / .ts 文件应用 Babel 转换（仅 $widget 宏，不做 JSX 以避免误伤）
 * - 对 .vue 文件的 <script> 块做轻量转换（仅 $widget 宏）
 *
 * 依赖：@babel/core（可选）。若未安装，则降级为"运行时宏"模式——
 * 不做构建期转换，但会注入 import，让 $widget 指向运行时 helper 的别名。
 *
 * Vite 用法（vite.config.js）：
 *   import widgetDeclarative from 'wc/widget-declarative-plugin/vite-plugin';
 *   export default {
 *     plugins: [
 *       widgetDeclarative({
 *         registry: { 'bi-sales-panel': { js: 'https://.../x.js', css: '.../x.css', vueVersion: '2' } }
 *       })
 *     ]
 *   };
 *
 * 远程 registry 联动（推荐）：
 *   widgetDeclarative({
 *     registryUrl: 'https://cdn.example.com/widgets/registry.json',
 *     registryCacheFile: './.widget-registry-cache.json', // 可选：离线兜底缓存
 *     registry: { /* 静态覆盖/兜底 *\/ }
 *   })
 *   构建时自动从 registryUrl 拉取 JSON（数组格式，见 wc/widget-registry），
 *   转换为 { name: { js, css, vueVersion } } 映射，与静态 registry 合并后
 *   注入 babel-plugin。远程失败时回退到 registryCacheFile，再回退到静态 registry。
 *
 * 之后业务代码可直接写：
 *   const el = await $widget('bi-sales-panel', { title: '销售面板' });
 * 或在 JSX 中：
 *   <Widget name="bi-sales-panel" config={{ title: '销售面板' }} />
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

const DEFAULT_BABEL_OPTS = {
  registry: {},
  helperModule: 'wc/widget-declarative-plugin/runtime',
  helperName: 'widgetMount',
  macroName: '$widget',
  jsxTag: 'Widget'
};

let babelCore = null;
function loadBabelCore() {
  if (babelCore === null) {
    try { babelCore = require('@babel/core'); }
    catch (e) { babelCore = false; }
  }
  return babelCore;
}

const babelPlugin = require('./babel-plugin.js');

/**
 * 远程拉取 registry JSON 并转换为 babel-plugin 所需的 { name: meta } 映射
 *
 * 远程 JSON 格式（与 wc/widget-registry 一致）：
 *   [{ "name": "bi-sales-panel", "js": "...", "css": "...", "vueVersion": "2" }, ...]
 * 转换后：
 *   { "bi-sales-panel": { "js": "...", "css": "...", "vueVersion": "2" } }
 *
 * 失败处理链：远程 → 缓存文件 → null（调用方回退到静态 registry）
 *
 * @param {string} url 远程 registry JSON URL
 * @param {string} [cacheFile] 本地缓存文件路径（成功时写入，失败时读取兜底）
 * @param {number} [timeout=8000] 请求超时毫秒
 * @returns {Promise<object|null>} registry 映射，失败返回 null
 */
async function fetchRemoteRegistry(url, cacheFile, timeout = 8000) {
  try {
    // Node 18+ 内置 fetch；低版本回退到 https 模块
    let jsonData;
    if (typeof globalThis.fetch === 'function') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await globalThis.fetch(url, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timer);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        jsonData = await response.json();
      } catch (e) {
        clearTimeout(timer);
        throw e;
      }
    } else {
      // 回退：用 node 内置 https/http 模块
      jsonData = await new Promise((resolve, reject) => {
        const mod = url.startsWith('https:') ? require('https') : require('http');
        const req = mod.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
          });
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => {
          req.destroy(new Error('Timeout'));
        });
      });
    }

    const registry = normalizeRegistryArray(jsonData);

    // 写入本地缓存（离线兜底）
    if (cacheFile) {
      try {
        const cacheDir = path.dirname(cacheFile);
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(jsonData, null, 2), 'utf8');
      } catch (cacheErr) {
        console.warn(`[widget-declarative-plugin] 写入 registry 缓存失败:`, cacheErr.message);
      }
    }

    return registry;
  } catch (err) {
    // 远程失败：尝试从缓存文件读取
    if (cacheFile) {
      try {
        if (fs.existsSync(cacheFile)) {
          const raw = fs.readFileSync(cacheFile, 'utf8');
          const cached = JSON.parse(raw);
          console.warn(`[widget-declarative-plugin] 远程 registry 加载失败(${err.message})，使用本地缓存 ${cacheFile}`);
          return normalizeRegistryArray(cached);
        }
      } catch (cacheErr) {
        console.warn(`[widget-declarative-plugin] 读取 registry 缓存失败:`, cacheErr.message);
      }
    }
    console.warn(`[widget-declarative-plugin] 远程 registry 加载失败(${err.message})，回退到静态 registry`);
    return null;
  }
}

/**
 * 将 registry JSON 数组格式归一化为 { name: meta } 映射
 * 已是对象格式则原样返回；数组格式按 name 字段索引
 * @param {Array|object} data
 * @returns {object}
 */
function normalizeRegistryArray(data) {
  if (!data) return {};
  if (Array.isArray(data)) {
    const map = {};
    for (const item of data) {
      if (item && item.name) {
        const meta = {};
        if (item.js) meta.js = item.js;
        if (item.css) meta.css = item.css;
        if (item.vueVersion) meta.vueVersion = String(item.vueVersion);
        map[item.name] = meta;
      }
    }
    return map;
  }
  // 已是 { name: meta } 格式
  return data;
}

/**
 * 提取 .vue 文件 <script> 块内容与位置
 * 返回 { content, start, end } 或 null
 */
function extractVueScript(source) {
  const regex = /<script([^>]*)>([\s\S]*?)<\/script>/i;
  const m = source.match(regex);
  if (!m) return null;
  const start = m.index + m[0].indexOf(m[2]);
  return { content: m[2], start, end: start + m[2].length, attrs: m[1] };
}

export default function widgetDeclarativeVitePlugin(options = {}) {
  const opts = { ...DEFAULT_BABEL_OPTS, ...options };
  const { registryUrl, registryCacheFile, registryTimeout = 8000 } = options;

  // 可变的 opts.registry：buildStart 拉取远程后会合并更新
  // babelOpts 持有 opts 引用，更新 opts.registry 即同步生效
  const babelOpts = {
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    plugins: [[babelPlugin, opts]]
  };

  // 远程 registry 拉取 promise（buildStart 触发，transform 等待）
  let registryFetchPromise = null;

  return {
    name: 'widget-declarative-plugin',
    enforce: 'pre',

    async buildStart() {
      if (!registryUrl) return;
      registryFetchPromise = fetchRemoteRegistry(registryUrl, registryCacheFile, registryTimeout);
      const remoteRegistry = await registryFetchPromise;
      if (remoteRegistry) {
        // 合并：静态 registry 优先（允许本地覆盖远程），远程补充缺失项
        opts.registry = { ...remoteRegistry, ...opts.registry };
        const count = Object.keys(opts.registry).length;
        console.log(`[widget-declarative-plugin] registry 就绪：${count} 个物料（远程 ${Object.keys(remoteRegistry).length} + 静态 ${Object.keys(options.registry || {}).length}）`);
      }
    },

    async transform(code, id) {
      // 若配置了远程 registry，等待拉取完成再做转换，确保 meta 内联正确
      if (registryFetchPromise) {
        await registryFetchPromise;
      }
      // 仅处理业务源码，跳过 node_modules 与已转换产物
      if (id.includes('node_modules')) return null;
      if (id.includes('\0')) return null; // 虚拟模块

      const isJsx = /\.jsx$/i.test(id) || /\.tsx$/i.test(id);
      const isJs = /\.(m?js|ts)$/i.test(id);
      const isVue = /\.vue$/i.test(id);

      if (!isJsx && !isJs && !isVue) return null;

      // 快速跳过：源码不含声明式语法则不做任何处理，避免无谓的 babel 调用
      const hasMacro = code.includes(opts.macroName + '(') || code.includes(opts.macroName + ' ');
      const hasJsx = isJsx && code.includes(opts.jsxTag);
      if (!hasMacro && !hasJsx) {
        // .vue 文件还需检查 script 内是否有宏
        if (!isVue) return null;
        if (!code.includes(opts.macroName)) return null;
      }

      const core = loadBabelCore();
      if (!core) {
        // 降级：不转换，仅注入 import 让 $widget 指向运行时 helper（运行时宏模式）
        // 仅当确实使用了宏时注入
        if (hasMacro && !code.includes(opts.helperModule)) {
          const injection = `import { ${opts.helperName} as ${opts.macroName} } from '${opts.helperModule}';\n`;
          return { code: injection + code, map: null };
        }
        return null;
      }

      try {
        if (isVue) {
          // 只转换 <script> 块，避免触碰 <template>（Vue 模板由 vue 插件处理）
          const scriptBlock = extractVueScript(code);
          if (!scriptBlock) return null;
          if (!scriptBlock.content.includes(opts.macroName)) return null;
          const transformed = await core.transformAsync(scriptBlock.content, {
            ...babelOpts,
            filename: id + '.script.js'
          });
          if (!transformed || transformed.code === scriptBlock.content) return null;
          const newCode = code.slice(0, scriptBlock.start) + transformed.code + code.slice(scriptBlock.end);
          return { code: newCode, map: transformed.map || null };
        }

        // .js/.ts/.jsx/.tsx：整文件转换
        const transformed = await core.transformAsync(code, {
          ...babelOpts,
          filename: id,
          parserOpts: isJsx ? { plugins: ['jsx'] } : undefined
        });
        if (!transformed) return null;
        return { code: transformed.code, map: transformed.map || null };
      } catch (e) {
        // 转换失败不阻断构建，告警并返回原码
        console.warn(`[widget-declarative-plugin] 转换 ${id} 失败:`, e.message);
        return null;
      }
    }
  };
}
