#!/usr/bin/env node

/**
 * 物料开发服务器
 * - 启动 Vite 构建监听（watch 模式）
 * - 启动静态文件服务（带 CORS 头）
 * - 监听物料变化，自动重编译
 */

import { createServer } from 'http';
import { readFileSync, existsSync, watch } from 'fs';
import { join, extname } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DIST_DIR = join(ROOT_DIR, 'dist');
const PORT = process.env.PORT || 8082;

// MIME 类型映射
const MIME_TYPES = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// 物料列表（与 vite.config.js WIDGET_MAP 一致）
const WIDGETS = [
  'bi-finance-panel',
  'bi-data-source',
  'bi-metric-cards',
  'bi-crash-tester',
  'bi-payment-panel'
];

// 首次构建全部物料（顺序执行，每个物料独立 build）
async function buildAllWidgets() {
  console.log('[dev-server] 首次构建全部物料...');
  for (const name of WIDGETS) {
    console.log(`[dev-server] 构建 ${name}...`);
    await new Promise((resolve, reject) => {
      const proc = spawn('npx', ['vite', 'build'], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, WIDGET_NAME: name }
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`构建 ${name} 失败 (exit ${code})`));
      });
      proc.on('error', reject);
    });
  }
  console.log('[dev-server] 全部物料构建完成');
}

// 启动源码监听，文件变化时重建对应物料
function startBuildWatch() {
  console.log('[dev-server] 启动源码监听...');
  const srcDir = join(ROOT_DIR, 'src');
  let debounceTimer = null;
  let building = false;

  const rebuild = (filePath) => {
    if (building) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      building = true;
      // 根据文件路径判断影响了哪个物料，全部重建以简化逻辑
      console.log(`[dev-server] 检测到变化: ${filePath}，重新构建全部物料...`);
      try {
        await buildAllWidgets();
      } catch (err) {
        console.error('[dev-server] 重建失败:', err.message);
      }
      building = false;
    }, 300);
  };

  // 使用 fs.watch 递归监听 src 目录
  try {
    watch(srcDir, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.vue') || filename.endsWith('.js') || filename.endsWith('.ts'))) {
        rebuild(join(srcDir, filename));
      }
    });
    console.log('[dev-server] 源码监听已启动');
  } catch (err) {
    console.warn('[dev-server] 源码监听启动失败，自动重编译不可用:', err.message);
  }

  return { kill: () => clearTimeout(debounceTimer) };
}

// 静态文件服务（带 CORS）
function createStaticServer() {
  const server = createServer((req, res) => {
    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');

    // 处理 OPTIONS 请求
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // registry.json：读取 host 的 public/widgets/registry.json（含 Vue2 物料）
    if (req.url && req.url.replace(/^\/widgets/, '') === '/registry.json') {
      const hostRegistry = join(ROOT_DIR, '..', 'vue3-host', 'public', 'widgets', 'registry.json');
      if (existsSync(hostRegistry)) {
        const content = readFileSync(hostRegistry);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(content);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
      return;
    }

    // 解析请求路径（去掉 /widgets 前缀，与 dist/ 产物路径对齐）
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = filePath.replace(/^\/widgets/, '') || '/';
    filePath = join(DIST_DIR, filePath);

    // 安全检查：防止路径遍历
    if (!filePath.startsWith(DIST_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // 检查文件是否存在
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // 读取并返回文件
    try {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (err) {
      console.error('[dev-server] 读取文件失败:', err);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

  return server;
}

// 主函数
async function main() {
  console.log(`[dev-server] 物料开发服务器启动中...`);
  console.log(`[dev-server] 静态文件服务: http://localhost:${PORT}`);
  console.log(`[dev-server] 物料目录: ${DIST_DIR}`);

  // 首次构建全部物料，确保 dist/ 有内容
  await buildAllWidgets();

  // 启动构建监听
  const viteProcess = startBuildWatch();

  // 启动静态文件服务
  const server = createStaticServer();
  server.listen(PORT, () => {
    console.log(`[dev-server] 静态文件服务已启动: http://localhost:${PORT}`);
    console.log(`[dev-server] CORS 已启用，允许跨域访问`);
  });

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n[dev-server] 正在关闭...');
    viteProcess.kill('SIGINT');
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    viteProcess.kill('SIGTERM');
    server.close(() => {
      process.exit(0);
    });
  });
}

main();
