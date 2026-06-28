import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST_NM = path.resolve(__dirname, 'node_modules');
const ROOT_NM = path.resolve(__dirname, '../../node_modules');

// ─── 运行时依赖映射 ───
// 注意：基座自身使用 Vue2，但物料还需要 Vue3 / ElementPlus，因此两者都要本地化。
// 命名上「vue」就是 Vue2（2.7），「vue3」是 npm 别名指向 Vue3。
const LOCAL_MAP = {
  '/runtime/vue2.js': path.resolve(HOST_NM, 'vue/dist/vue.js'),
  '/runtime/vue3.js': path.resolve(HOST_NM, 'vue3/dist/vue.global.js'),
  '/runtime/element-ui.js': path.resolve(HOST_NM, 'element-ui/lib/index.js'),
  '/runtime/element-ui.css': path.resolve(HOST_NM, 'element-ui/lib/theme-chalk/index.css'),
  '/runtime/element-plus.js': path.resolve(HOST_NM, 'element-plus/dist/index.full.js'),
  '/runtime/element-plus.css': path.resolve(HOST_NM, 'element-plus/dist/index.css')
};

// ─── 物料产物映射 ───
// 直接读取 ../{lib}/dist，与 demo/host 行为一致，保证三套 host 共享同一份产物。
const WIDGET_LIBS = {
  'vue2-widgets': { vueVersion: '2' },
  'vue3-widgets': { vueVersion: '3' },
  'h5-widgets': { vueVersion: 'none' }
};

const WIDGET_MAP = {};
for (const [lib] of Object.entries(WIDGET_LIBS)) {
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
      // 监听物料产物变化，触发 HMR
      const watcher = server.watcher;
      for (const lib of Object.keys(WIDGET_LIBS)) {
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
  plugins: [vue2(), localServePlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  optimizeDeps: {
    exclude: ['element-ui']
  },
  server: {
    port: 5001,
    fs: { allow: ['..', '.'] }
  }
});
