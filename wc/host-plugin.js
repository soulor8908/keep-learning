/**
 * 基座侧 Vite 插件（纯 ESM + importmap 方案）
 *
 * 两个插件，供 demo/host、demo/vue2-host、demo/h5-host 复用，也可被业务基座直接使用：
 *   - importmapInjectPlugin：构建/启动期把 ui-groups.json 生成的 importmap 注入 index.html
 *   - localServeWidgetsPlugin：dev 期把 /widgets/{vue2|vue3|h5}/* 映射到各物料仓库的 dist
 *
 * importmap 是依赖解析的单一来源；这两个插件只做"注入"与"本地静态托管"，不含任何运行时逻辑。
 */
import fs from 'fs';
import path from 'path';
import { loadUiGroups, generateImportmap } from './importmap-gen.js';
import { DEFAULT_SHIM_URL } from './compat.js';

// 各物料仓库 dist 的默认相对位置（相对基座 cwd）。多仓场景可传入绝对路径覆盖。
const DEFAULT_WIDGET_DIRS = {
  vue2: '../vue2-widgets/dist',
  vue3: '../vue3-widgets/dist',
  h5: '../h5-widgets/dist'
};

/**
 * dev 期静态托管物料 ESM 产物：
 *   /widgets/vue2/foo.js  →  {dirs.vue2}/foo.js
 *   /widgets/vue3/foo.js  →  {dirs.vue3}/foo.js
 *   /widgets/h5/foo.js    →  {dirs.h5}/foo.js
 * URL 前缀（vue2/vue3/h5）决定 importmap scope，从而决定 bare 'vue' 解析到哪个版本。
 *
 * @param {Record<'vue2'|'vue3'|'h5', string>} [dirs]  各栈 dist 目录（相对 cwd 或绝对路径）
 */
export function localServeWidgetsPlugin(dirs = DEFAULT_WIDGET_DIRS) {
  return {
    name: 'local-serve-widgets',
    configureServer(server) {
      const resolved = {};
      for (const [stack, d] of Object.entries(dirs)) {
        resolved[stack] = path.isAbsolute(d) ? d : path.resolve(process.cwd(), d);
        if (fs.existsSync(resolved[stack])) server.watcher.add(resolved[stack]);
      }
      server.watcher.on('change', (file) => {
        if (file.includes('/dist/') && (file.endsWith('.js') || file.endsWith('.css'))) {
          server.ws.send({ type: 'full-reload' });
        }
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0];
        const m = url.match(/^\/widgets\/(vue2|vue3|h5)\/(.+)$/);
        if (!m) return next();
        const root = resolved[m[1]];
        let target;
        try {
          target = path.resolve(root, decodeURIComponent(m[2]));
        } catch {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        // 防路径穿越：解码后的目标必须落在对应物料 dist 目录内
        if (target !== root && !target.startsWith(root + path.sep)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
          res.statusCode = 404;
          res.end(`not found: ${target}`);
          return;
        }
        const ext = path.extname(target);
        res.setHeader('Content-Type', ext === '.css' ? 'text/css' : 'application/javascript');
        fs.createReadStream(target).pipe(res);
      });
    }
  };
}

/**
 * 把 ui-groups.json 生成的 importmap 注入 index.html 的 <!--IMPORTMAP_INJECT--> 占位标记处。
 * 改分组只改 ui-groups.json，dev 重启即生效，无需手改 index.html。
 *
 * @param {object} [opts]
 * @param {'vue3'|'vue2'|'none'} [opts.hostStack='vue3']  基座技术栈，决定顶层 vue 解析
 * @param {string} [opts.cdnBase]  离线/内网自托管 ESM 前缀（默认 esm.sh）
 * @param {boolean} [opts.compat=false]  可选项：注入 es-module-shims 嗅探脚本，兼容不支持 importmap 的旧浏览器
 * @param {string} [opts.shimUrl]  自定义 shim URL（默认 DEFAULT_SHIM_URL，可用 window.__WIDGET_SHIM_URL__ 覆盖）
 */
export function importmapInjectPlugin(opts = {}) {
  const {
    hostStack = 'vue3',
    cdnBase,
    compat = false,
    shimUrl = DEFAULT_SHIM_URL
  } = opts;

  return {
    name: 'importmap-inject',
    transformIndexHtml(html) {
      const groups = loadUiGroups();
      const { imports, scopes } = generateImportmap(groups, { cdnBase, hostStack });
      const importmap = JSON.stringify({ imports, scopes });

      // 可选兼容：在 importmap 之前注入 es-module-shims 嗅探脚本。
      // 现代浏览器 HTMLScriptElement.supports('importmap') 为 true → 不加载 shim，零成本；
      // 旧浏览器不支持 → 动态加载 es-module-shims polyfill，物料与基座代码无需改动。
      const sniff = compat
        ? `<script>if(!(HTMLScriptElement.supports&&HTMLScriptElement.supports('importmap'))){var s=document.createElement('script');s.src=${JSON.stringify(shimUrl)};s.async=true;document.head.appendChild(s);}</script>`
        : '';

      return html.replace(
        /<!--IMPORTMAP_INJECT-->[\s\S]*?<!--\/IMPORTMAP_INJECT-->/,
        `${sniff}<script type="importmap">${importmap}</script>`
      );
    }
  };
}

/**
 * 生成基座 dev 期 resolve.alias 映射，让 Vite 把基座自身的裸 import（vue / element-plus / element-ui）
 * 直接重定向到与 importmap 顶层 imports 一致的 CDN URL。
 *
 * 为什么需要：Vite dev server 会拦截所有 bare import 并从 node_modules 解析，浏览器原生 importmap
 * 不会生效。仅 optimizeDeps.exclude 不够——Vite 仍会用自身解析器把 'element-plus' 改写成
 * /node_modules/.pnpm/element-plus@x/...，触发 dayjs 等 CJS 依赖的 named export 互操作问题。
 * 用 resolve.alias 把 bare import 直接指向外部 https URL，Vite 不再预打包/改写，交给浏览器原生 ESM
 * + importmap 解析，与物料共享同一份 CDN 实例。
 *
 * 生产构建（vite build）下 alias 不影响——rollupOptions.external 已把这些 bare import 标记为外部，
 * 不进产物，运行时同样由浏览器 importmap 解析。
 *
 * @param {object} [opts]
 * @param {'vue3'|'vue2'|'none'} [opts.hostStack='vue3']  必须与 importmapInjectPlugin 一致
 * @param {string} [opts.cdnBase]  离线/内网自托管 ESM 前缀（默认 esm.sh），与 importmapInjectPlugin 一致
 * @returns {Record<string, string>}  形如 { vue: 'https://esm.sh/vue@3.4.21', 'element-plus': '...' }
 */
export function hostResolveAlias(opts = {}) {
  const { hostStack = 'vue3', cdnBase } = opts;
  // hostStack='none'（H5 基座无框架）→ 基座不 import 'vue'，但跨栈物料仍可能 import element-*，
  // 仍需声明 element-plus/element-ui alias 以防基座偶然引用。
  const { imports } = generateImportmap(loadUiGroups(), { cdnBase, hostStack });
  const alias = {};
  // 只把基座会 import 的顶层 bare 入口加进 alias：vue（按 hostStack）、element-plus、element-ui。
  // 组 specifier（element-plus/common 等）只出现在物料产物里，物料走 localServeWidgetsPlugin 静态托管，
  // 不经 Vite 解析，无需 alias。
  if (imports.vue) alias.vue = imports.vue;
  if (imports['element-plus']) alias['element-plus'] = imports['element-plus'];
  if (imports['element-ui']) alias['element-ui'] = imports['element-ui'];
  return alias;
}
