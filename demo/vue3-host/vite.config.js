import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import fs from 'fs';

// 物料服务地址
const WIDGET_SERVICE_URL = 'http://localhost:8082';

// 自定义插件：当物料服务不可用时，直接从 public/widgets 加载
function widgetServiceFallback() {
  return {
    name: 'widget-service-fallback',
    configureServer(server) {
      // 在 middleware 模式下添加 fallback 中间件
      server.middlewares.use((req, res, next) => {
        // 只处理 /widgets 请求
        if (!req.url || !req.url.startsWith('/widgets/')) {
          return next();
        }

        // 先尝试代理到物料服务
        const proxyReq = `${WIDGET_SERVICE_URL}${req.url}`;
        fetch(proxyReq, { signal: AbortSignal.timeout(3000) })
          .then(response => {
            if (response.ok) {
              // 物料服务可用，继续代理
              return next();
            }
            throw new Error(`HTTP ${response.status}`);
          })
          .catch(() => {
            // 物料服务不可用，从 public/widgets 加载
            console.warn(`[widget-fallback] 物料服务不可用，回退到 public/widgets: ${req.url}`);
            const filePath = path.join(__dirname, 'public', req.url);
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath);
              const ext = path.extname(filePath);
              const mimeTypes = {
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json'
              };
              res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(content);
            } else {
              next();
            }
          });
      });
    }
  };
}

export default defineConfig({
  plugins: [vue(), widgetServiceFallback()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5000,
    watch: {
      // 监听 public/widgets 目录变化，触发 full reload
      usePolling: true,
      interval: 500
    },
    // 代理物料服务（开发环境）
    proxy: {
      '/widgets': {
        target: WIDGET_SERVICE_URL,
        changeOrigin: true
      }
    }
  }
});
