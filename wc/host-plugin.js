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
        const target = path.resolve(resolved[m[1]], m[2]);
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
