import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { loadUiGroups, generateImportmap } from '../wc/importmap-gen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIDGETS_ROOT = process.env.VITE_WIDGETS_DIR
  ? process.env.VITE_WIDGETS_DIR
  : path.resolve(__dirname, '../dist/widgets');

// 离线/内网：用 UI_CDN_BASE 环境变量指向自托管 ESM 产物前缀
const UI_CDN_BASE = process.env.UI_CDN_BASE || 'https://esm.sh';

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

// importmap 注入插件：读 ui-groups.json 生成 importmap，替换 index.html 里的占位标记。
// 这样改分组只改 ui-groups.json，dev 重启即生效，无需手改 index.html。
function importmapInjectPlugin() {
  return {
    name: 'importmap-inject',
    transformIndexHtml(html) {
      const groups = loadUiGroups();
      const { imports, scopes } = generateImportmap(groups, { cdnBase: UI_CDN_BASE });
      const importmap = JSON.stringify({ imports, scopes });
      return html.replace(
        /<!--IMPORTMAP_INJECT-->[\s\S]*?<!--\/IMPORTMAP_INJECT-->/,
        `<script type="importmap">${importmap}</script>`
      );
    }
  };
}

export default defineConfig({
  plugins: [vue(), localServePlugin(), importmapInjectPlugin()],
  resolve: {
    alias: {
      '@wc/esm-core': path.resolve(__dirname, '../wc'),
      '@': path.resolve(__dirname, 'src')
    }
  },
  // 基座自身的 vue 也走 importmap（与 Vue3 物料共享同一份 ESM）。
  // 组 specifier（element-plus/common 等）同样交给 importmap，从预打包与构建产物中排除。
  optimizeDeps: { exclude: ['vue', 'element-plus', 'element-ui', /^element-plus\//, /^element-ui\//] },
  build: {
    rollupOptions: {
      external: ['vue', 'element-plus', 'element-ui', /^element-plus\//, /^element-ui\//]
    }
  },
  server: {
    port: 5010,
    fs: { allow: ['..', '.'] }
  }
});
