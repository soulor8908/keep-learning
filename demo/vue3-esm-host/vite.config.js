import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import fs from 'fs';

/**
 * 物料中间件插件
 * - 拦截 /widgets/*.js 请求，从项目 widgets/ 目录读取文件
 * - 将 bare specifier（如 from "vue"）替换为实际 ESM 路径
 *   因为浏览器动态 import() 不走 importmap
 * - 监听 widgets/ 目录变化，触发 HMR
 */
function widgetServePlugin() {
  return {
    name: 'widget-serve',
    configureServer(server) {
      const widgetsDir = path.resolve(__dirname, 'widgets');
      const vueEsmPath = '/node_modules/vue/dist/vue.esm-browser.js';

      // 监听 widgets 目录变化，触发 full reload
      server.watcher.add(widgetsDir);
      server.watcher.on('change', (filePath) => {
        if (filePath.startsWith(widgetsDir) && filePath.endsWith('.js')) {
          const fileName = path.basename(filePath);
          // 通知客户端刷新对应的模块
          server.ws.send({
            type: 'custom',
            event: 'widget-update',
            data: { file: fileName }
          });
        }
      });

      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/widgets/') || !req.url.endsWith('.js')) {
          return next();
        }

        const fileName = path.basename(req.url);
        const filePath = path.join(widgetsDir, fileName);

        if (!fs.existsSync(filePath)) {
          return next();
        }

        let code = fs.readFileSync(filePath, 'utf-8');
        // 将 bare specifier "vue" 替换为实际 ESM 路径
        code = code.replace(/from\s+["']vue["']/g, `from "${vueEsmPath}"`);

        res.setHeader('Content-Type', 'application/javascript');
        res.end(code);
      });
    }
  };
}

export default defineConfig({
  plugins: [vue(), widgetServePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'wc': path.resolve(__dirname, '../../wc')
    }
  },
  server: {
    port: 5001,
    watch: {
      // 监听物料构建产物和 wc/ 目录变化
      ignored: ['!**/widgets/**', '!**/node_modules/@wc/**', '!**/wc/**']
    }
  }
});
