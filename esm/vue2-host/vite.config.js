import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 物料 ESM 产物根目录（与 esm/host 共享同一份 esm/dist/widgets）
const WIDGETS_ROOT = process.env.VITE_WIDGETS_DIR
  ? process.env.VITE_WIDGETS_DIR
  : path.resolve(__dirname, '../dist/widgets');

function localServePlugin() {
  return {
    name: 'local-serve-widgets',
    configureServer(server) {
      const watcher = server.watcher;
      if (fs.existsSync(WIDGETS_ROOT)) watcher.add(WIDGETS_ROOT);
      watcher.on('change', (file) => {
        if (file.includes('/widgets/') && (file.endsWith('.js') || file.endsWith('.css'))) {
          server.ws.send({ type: 'full-reload' });
        }
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0];
        if (!url.startsWith('/widgets/')) return next();
        const rel = url.slice('/widgets/'.length);
        const target = path.resolve(WIDGETS_ROOT, rel);
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

export default defineConfig({
  plugins: [vue2(), localServePlugin()],
  resolve: {
    alias: {
      '@wc/esm-core': path.resolve(__dirname, '../wc'),
      '@': path.resolve(__dirname, 'src')
    }
  },
  // 基座自身的 vue / element-ui 也走 importmap，与同栈物料共享
  optimizeDeps: { exclude: ['vue', 'element-ui'] },
  build: {
    rollupOptions: { external: ['vue', 'element-ui'] }
  },
  server: {
    port: 5011,
    fs: { allow: ['..', '.'] }
  }
});
