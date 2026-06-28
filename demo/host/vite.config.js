import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST_NM = path.resolve(__dirname, 'node_modules');
const ROOT_NM = path.resolve(__dirname, '../../node_modules');

// ─── 运行时依赖映射 ───
const LOCAL_MAP = {
  '/runtime/vue2.js': path.resolve(HOST_NM, 'vue2/dist/vue.js'),
  '/runtime/vue3.js': path.resolve(HOST_NM, 'vue/dist/vue.global.js'),
  '/runtime/element-ui.js': path.resolve(HOST_NM, 'element-ui/lib/index.js'),
  '/runtime/element-ui.css': path.resolve(HOST_NM, 'element-ui/lib/theme-chalk/index.css'),
  '/runtime/element-plus.js': path.resolve(HOST_NM, 'element-plus/dist/index.full.js'),
  '/runtime/element-plus.css': path.resolve(HOST_NM, 'element-plus/dist/index.css'),
  '/runtime/lodash.min.js': path.resolve(ROOT_NM, 'lodash/lodash.min.js')
};

// ─── 物料库映射 ───
const WIDGET_LIBS = {
  'vue2-widgets': { vueVersion: '2' },
  'vue3-widgets': { vueVersion: '3' },
  'h5-widgets': { vueVersion: 'none' }
};

// 自动生成物料产物映射
const WIDGET_MAP = {};
for (const [lib, config] of Object.entries(WIDGET_LIBS)) {
  const distDir = path.resolve(__dirname, `../${lib}/dist`);
  if (!fs.existsSync(distDir)) continue;
  for (const file of fs.readdirSync(distDir)) {
    if (file.endsWith('.js') || file.endsWith('.css')) {
      WIDGET_MAP[`/widgets/${file}`] = path.resolve(distDir, file);
    }
  }
}

const TEST_MODULE_MAP = {
  '/loader.js': path.resolve(__dirname, '../../wc/loader.js')
};

function localServePlugin() {
  return {
    name: 'local-serve',
    configureServer(server) {
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
        const target = WIDGET_MAP[url] || LOCAL_MAP[url] || TEST_MODULE_MAP[url];
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
  plugins: [vue(), localServePlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  optimizeDeps: {
    exclude: ['element-ui']
  },
  server: {
    port: 5000,
    fs: { allow: ['..', '.'] }
  }
});
