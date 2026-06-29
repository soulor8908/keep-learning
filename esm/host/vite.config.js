import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 物料 ESM 产物根目录（按技术栈分子目录，配合 importmap scopes）
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

      // 静态托管物料 ESM 产物：/widgets/* → esm/dist/widgets/*
      // 这些文件不经 Vite 编译，原样下发，浏览器用 index.html 里的 importmap 解析其 bare import。
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
  plugins: [vue(), localServePlugin()],
  resolve: {
    alias: {
      '@wc/esm-core': path.resolve(__dirname, '../wc'),
      '@': path.resolve(__dirname, 'src')
    }
  },
  // 基座自身的 vue / element-plus 也走 importmap（与 Vue3 物料共享同一份 ESM），
  // 因此从预打包与构建产物中排除，留给浏览器原生解析。
  // 对照 UMD 版：UMD 基座把 element-plus 打进 chunk，与物料的 window.ElementPlus 是两份。
  optimizeDeps: { exclude: ['vue', 'element-plus', 'element-ui'] },
  build: {
    rollupOptions: { external: ['vue', 'element-plus', 'element-ui'] }
  },
  server: {
    port: 5010,
    fs: { allow: ['..', '.'] }
  }
});
