import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST_NM = path.resolve(__dirname, 'node_modules');

// ─── 运行时依赖映射 ───
// h5-host 自身没有框架依赖，但物料需要：因此把 Vue2/Vue3/ElementUI/ElementPlus
// 都映射到本地 node_modules，断网也能跑。
const LOCAL_MAP = {
  '/runtime/vue2.js': path.resolve(HOST_NM, 'vue/dist/vue.js'),
  '/runtime/vue3.js': path.resolve(HOST_NM, 'vue3/dist/vue.global.js'),
  '/runtime/element-ui.js': path.resolve(HOST_NM, 'element-ui/lib/index.js'),
  '/runtime/element-ui.css': path.resolve(HOST_NM, 'element-ui/lib/theme-chalk/index.css'),
  '/runtime/element-plus.js': path.resolve(HOST_NM, 'element-plus/dist/index.full.js'),
  '/runtime/element-plus.css': path.resolve(HOST_NM, 'element-plus/dist/index.css')
};

// ─── 物料产物映射（与 vue2-host / host 共享同一份 dist） ───
const WIDGET_LIBS = ['vue2-widgets', 'vue3-widgets', 'h5-widgets'];
const WIDGET_MAP = {};
for (const lib of WIDGET_LIBS) {
  const distDir = path.resolve(__dirname, `../${lib}/dist`);
  if (!fs.existsSync(distDir)) continue;
  for (const file of fs.readdirSync(distDir)) {
    if (file.endsWith('.js') || file.endsWith('.css')) {
      WIDGET_MAP[`/widgets/${file}`] = path.resolve(distDir, file);
    }
  }
}

function localServePlugin() {
  return {
    name: 'local-serve',
    configureServer(server) {
      const watcher = server.watcher;
      for (const lib of WIDGET_LIBS) {
        const distDir = path.resolve(__dirname, `../${lib}/dist`);
        if (fs.existsSync(distDir)) watcher.add(distDir);
      }
      watcher.on('change', (file) => {
        if (file.includes('/dist/') && (file.endsWith('.js') || file.endsWith('.css'))) {
          server.ws.send({ type: 'full-reload' });
        }
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0];
        const target = WIDGET_MAP[url] || LOCAL_MAP[url];
        if (!target) return next();
        if (!fs.existsSync(target)) {
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

export default defineConfig({
  plugins: [localServePlugin()],
  server: {
    port: 5002,
    fs: { allow: ['..', '.'] }
  }
});
