# 物料服务开发模式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现从本地物料服务获取物料，支持热更新和独立开发

**Architecture:** 物料服务（vue3-widget-lib）提供独立的 dev server 和静态文件服务，Host（vue3-host）通过远程 URL 从物料服务获取物料清单和物料文件

**Tech Stack:** Vite, Node.js, concurrently, serve

## Global Constraints

- Node.js 项目统一使用 pnpm 管理依赖
- 预览端口固定为 5000
- Web Components 物料需支持离线/内网环境
- 只适配原生 H5、Vue2、Vue3，不做过度设计
- 2C 页面：首屏性能、体积、鲁棒性优先

---

## File Structure

```
demo/
├── vue3-widget-lib/
│   ├── package.json                          # 添加新的脚本
│   ├── scripts/
│   │   └── dev-server.js                     # 物料开发服务器脚本
│   └── vite.config.js                        # 修改：添加静态文件服务
├── vue3-host/
│   ├── src/
│   │   └── widgetRegistry.js                 # 修改：支持远程 URL
│   └── vite.config.js                        # 修改：添加代理配置
└── package.json                              # 修改：添加新的 dev 脚本
```

---

## Task 1: 物料服务开发服务器脚本

**Covers:** 物料服务独立运行、热更新

**Files:**
- Create: `demo/vue3-widget-lib/scripts/dev-server.js`
- Modify: `demo/vue3-widget-lib/package.json:8-17`

**Interfaces:**
- Consumes: 物料源代码（src/components/*.vue）
- Produces: 静态文件服务（端口 8082）+ 构建产物目录（dist）

- [ ] **Step 1: 创建 dev-server.js 脚本**

```javascript
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
import { execSync, spawn } from 'child_process';
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
```

- [ ] **Step 2: 验证脚本语法**

```bash
node --check demo/vue3-widget-lib/scripts/dev-server.js
```

Expected: 无输出（语法正确）

- [ ] **Step 3: 更新 package.json 添加脚本**

在 `demo/vue3-widget-lib/package.json` 的 `scripts` 字段中添加：

```json
{
  "scripts": {
    "serve:dev-server": "node scripts/dev-server.js"
  }
}
```

- [ ] **Step 4: 测试脚本启动**

```bash
cd demo/vue3-widget-lib && pnpm serve:dev-server
```

Expected: 看到启动日志，静态文件服务在 8082 端口运行

- [ ] **Step 5: Commit**

```bash
git add demo/vue3-widget-lib/scripts/dev-server.js demo/vue3-widget-lib/package.json
git commit -m "feat(widget-lib): 添加物料开发服务器脚本"
```

---

## Task 2: Host 配置远程物料服务

**Covers:** Host 从物料服务获取物料

**Files:**
- Modify: `demo/vue3-host/src/widgetRegistry.js:116-123`
- Modify: `demo/vue3-host/vite.config.js:12-18`

**Interfaces:**
- Consumes: 物料服务 URL（http://localhost:8082）
- Produces: 物料清单（远程优先，本地 fallback）

- [ ] **Step 1: 修改 widgetRegistry.js 支持远程 URL**

```javascript
// 修改 createRegistry 配置
const registry = createRegistry({
  // 优先从物料服务获取，失败时回退到本地
  url: (env) => {
    // 开发环境：从物料服务获取
    if (env.mode === 'development') {
      return 'http://localhost:8082/widgets/registry.json';
    }
    // 生产环境：从 public 目录获取
    return '/widgets/registry.json';
  },
  fallback: FALLBACK_WIDGETS,
  cacheKey: 'widget-registry-vue3-host',
  timeout: 8000,
  env: { mode: import.meta.env.MODE }
});
```

- [ ] **Step 2: 修改 vite.config.js 添加代理配置**

```javascript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    watch: {
      // 监听 public/widgets 目录变化，触发 full reload
      usePolling: true,
      interval: 500
    },
    // 代理物料服务（开发环境）
    proxy: {
      '/widgets': {
        target: 'http://localhost:8082',
        changeOrigin: true
      }
    }
  }
});
```

- [ ] **Step 3: 验证配置语法**

```bash
node --check demo/vue3-host/src/widgetRegistry.js
node --check demo/vue3-host/vite.config.js
```

Expected: 无输出（语法正确）

- [ ] **Step 4: 测试配置生效**

```bash
# 启动物料服务
cd demo/vue3-widget-lib && pnpm serve:dev-server &

# 启动 host
cd demo/vue3-host && pnpm serve
```

Expected: Host 从物料服务获取物料清单

- [ ] **Step 5: Commit**

```bash
git add demo/vue3-host/src/widgetRegistry.js demo/vue3-host/vite.config.js
git commit -m "feat(host): 配置从本地物料服务获取物料"
```

---

## Task 3: 添加根目录 dev 脚本

**Covers:** 一键启动物料服务和 Host

**Files:**
- Modify: `package.json:26-29`

**Interfaces:**
- Consumes: 物料服务脚本、Host 服务
- Produces: 一键启动命令

- [ ] **Step 1: 修改根目录 package.json 添加脚本**

```json
{
  "scripts": {
    "dev:vue3-with-service": "concurrently \"pnpm --filter vue3-widget-lib serve:dev-server\" \"pnpm --filter vue3-host serve\""
  }
}
```

- [ ] **Step 2: 验证脚本语法**

```bash
node --check package.json
```

Expected: 无输出（语法正确）

- [ ] **Step 3: 测试一键启动**

```bash
pnpm dev:vue3-with-service
```

Expected: 物料服务和 Host 同时启动，Host 从物料服务获取物料

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: 添加一键启动物料服务和 Host 的脚本"
```

---

## Task 4: 更新文档

**Covers:** 文档更新

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: 新的脚本和配置
- Produces: 更新后的文档

- [ ] **Step 1: 更新 AGENTS.md 中的运行与预览部分**

在 `## 运行与预览` 部分添加：

```markdown
# 一键启动物料服务 + Host（物料从服务获取，支持热更新）
pnpm dev:vue3-with-service

# 单独启动物料服务
pnpm --filter vue3-widget-lib serve:dev-server
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: 更新运行与预览文档"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** 所有需求都已覆盖
- [x] **Placeholder scan:** 无占位符
- [x] **Type consistency:** 所有接口类型一致

## Execution Handoff

基于任务数量（4个）和耦合度（中等），建议使用 **Inline** 执行方式。
