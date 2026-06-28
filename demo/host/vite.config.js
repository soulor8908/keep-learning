import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST_NM = path.resolve(__dirname, 'node_modules');
const ROOT_NM = path.resolve(__dirname, '../../node_modules');

const isProd = process.env.NODE_ENV === 'production';

// ─── 本地模式映射 ───
const LOCAL_MAP = {
  '/runtime/vue2.js': path.resolve(HOST_NM, 'vue2/dist/vue.js'),
  '/runtime/vue3.js': path.resolve(HOST_NM, 'vue/dist/vue.global.js'),
  '/runtime/element-ui.js': path.resolve(HOST_NM, 'element-ui/lib/index.js'),
  '/runtime/element-ui.css': path.resolve(HOST_NM, 'element-ui/lib/theme-chalk/index.css'),
  '/runtime/element-plus.js': path.resolve(HOST_NM, 'element-plus/dist/index.full.js'),
  '/runtime/element-plus.css': path.resolve(HOST_NM, 'element-plus/dist/index.css'),
  '/runtime/lodash.min.js': path.resolve(ROOT_NM, 'lodash/lodash.min.js')
};

// ─── 物料产物映射 ───
const WIDGET_MAP = {
  '/widgets/vue2-sales-panel.js': path.resolve(__dirname, '../vue2-widget/dist/widget.js'),
  '/widgets/vue2-sales-panel.css': path.resolve(__dirname, '../vue2-widget/dist/style.css'),
  '/widgets/vue3-finance-panel.js': path.resolve(__dirname, '../vue3-widget/dist/widget.js'),
  '/widgets/vue3-finance-panel.css': path.resolve(__dirname, '../vue3-widget/dist/style.css'),
  '/widgets/h5-clock-widget.js': path.resolve(__dirname, '../h5-widget/dist/widget.js')
};

const TEST_MODULE_MAP = {
  '/loader.js': path.resolve(__dirname, '../../wc/loader.js')
};

function localServePlugin() {
  return {
    name: 'local-serve',
    configureServer(server) {
      // 监听 widget 产物变化，触发 full-reload
      const watcher = server.watcher;
      const distDirs = [
        path.resolve(__dirname, '../vue2-widget/dist'),
        path.resolve(__dirname, '../vue3-widget/dist'),
        path.resolve(__dirname, '../h5-widget/dist')
      ];
      for (const dir of distDirs) {
        if (fs.existsSync(dir)) watcher.add(dir);
      }
      watcher.on('change', (file) => {
        if (file.includes('/dist/widget.js') || file.includes('/dist/style.css')) {
          server.ws.send({ type: 'full-reload' });
        }
      });

      server.middlewares.use((req, res, next) => {
        const target = WIDGET_MAP[req.url] || LOCAL_MAP[req.url] || TEST_MODULE_MAP[req.url];
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
