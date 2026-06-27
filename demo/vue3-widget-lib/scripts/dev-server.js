#!/usr/bin/env node

/**
 * 物料开发服务器
 * - 启动 Vite 构建监听（watch 模式）
 * - 启动静态文件服务（带 CORS 头）
 * - 监听物料变化，自动重编译
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
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

// 启动 Vite 构建监听
function startBuildWatch() {
  console.log('[dev-server] 启动 Vite 构建监听...');
  const viteProcess = spawn('npx', ['vite', 'build', '--watch'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: true
  });

  viteProcess.on('error', (err) => {
    console.error('[dev-server] Vite 启动失败:', err);
  });

  return viteProcess;
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

    // 解析请求路径
    let filePath = req.url === '/' ? '/index.html' : req.url;
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
function main() {
  console.log(`[dev-server] 物料开发服务器启动中...`);
  console.log(`[dev-server] 静态文件服务: http://localhost:${PORT}`);
  console.log(`[dev-server] 物料目录: ${DIST_DIR}`);

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
