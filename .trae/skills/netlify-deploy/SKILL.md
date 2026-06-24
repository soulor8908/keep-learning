---
name: netlify-deploy
description: >
  将 demo/vue2-host 和 demo/vue3-host 的构建产物部署到 Netlify。
  当用户提到 "部署到 Netlify"、"netlify 部署"、"重新部署"、"发布到线上"、
  "deploy to netlify" 或类似意图时触发。
---

# Netlify 部署 Skill

本 Skill 指导 AI 把 `demo/vue2-host/dist` 和 `demo/vue3-host/dist` 一键部署到 Netlify，
避免反复试错。

## 一、前置条件

执行部署前必须确认以下信息，**缺任一都先询问用户**：

1. **Netlify Personal Access Token**
   - 格式：`nfp_` 开头
   - 获取路径：https://app.netlify.com/user/applications/personal
   - 部署需要写入权限（`deploy` scope）
2. **站点信息**
   - Vue2 host 站点 ID：默认读取 `demo/vue2-host/.netlify/state.json` 中的 `siteId`
   - Vue3 host 站点 ID：默认读取 `demo/vue3-host/.netlify/state.json` 中的 `siteId`
   - 如果站点 ID 文件不存在或站点已过期，按下文「站点失效处理」流程重建

## 二、标准部署流程

### 步骤 1：构建产物

先确保两个 host 已构建：

```bash
cd /workspace/demo/vue2-host && npm run build
cd /workspace/demo/vue3-host && npm run build
```

如果构建失败，先修复代码问题，不要直接进入部署。

### 步骤 2：部署函数

使用统一的 Node.js 部署脚本（推荐保存到 `scripts/deploy-netlify.js`），核心逻辑：

```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN = process.env.NETLIFY_AUTH_TOKEN;
if (!TOKEN) throw new Error('请设置环境变量 NETLIFY_AUTH_TOKEN');

async function req(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) }
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${r.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function deploySite(siteId, dir) {
  const files = {};
  const contentBySha = {};

  function walk(rel) {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else {
        const buf = fs.readFileSync(path.join(dir, p));
        const sha = crypto.createHash('sha1').update(buf).digest('hex');
        files[p] = sha;
        contentBySha[sha] = buf;
      }
    }
  }
  walk('');

  // 1. 创建 deploy，传入文件 digest
  const deploy = await req(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files })
  });

  // 2. 上传缺失文件（Netlify 用 sha 作为路径去重存储）
  for (const sha of deploy.required || []) {
    await req(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files/${sha}`, {
      method: 'PUT',
      body: contentBySha[sha]
    });
  }

  // 3. 轮询到 ready
  for (let i = 0; i < 15; i++) {
    const d = await req(`https://api.netlify.com/api/v1/deploys/${deploy.id}`);
    if (d.state === 'ready' || d.state === 'current') return d;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('deploy 未在 30 秒内变为 ready');
}
```

调用方式：

```js
const v2 = await deploySite(siteIdV2, './demo/vue2-host/dist');
const v3 = await deploySite(siteIdV3, './demo/vue3-host/dist');
```

### 步骤 3：保存 deploy 元信息

将返回的 JSON 写入对应目录的 `deploy-response.json`，方便后续查看部署链接：

```js
fs.writeFileSync('./demo/vue2-host/deploy-response.json', JSON.stringify(v2, null, 2));
fs.writeFileSync('./demo/vue3-host/deploy-response.json', JSON.stringify(v3, null, 2));
```

## 三、站点失效处理

如果创建 deploy 时返回 `401 Access Denied`，按以下顺序排查：

1. **Token 是否有效**
   - 用 `GET /api/v1/sites` 测试，如果也 401，让用户重新生成 token
2. **站点是否被禁用/过期**
   - 用 `GET /api/v1/sites/{site_id}` 查看 `disabled` 和 `disabled_reason`
   - 常见原因：`Unclaimed site expired after an hour`
3. **站点不属于当前 token 账户**
   - 用 `GET /api/v1/sites` 列出全部站点，确认目标 site_id 在列表中

### 重建过期站点

如果站点已过期且无法删除（删除也 401），直接创建新站点并更新 `.netlify/state.json`：

```js
const newSite = await req('https://api.netlify.com/api/v1/sites', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'bi-demo-vue3-host-v2' }) // 换个唯一名
});

fs.writeFileSync('./demo/vue3-host/.netlify/state.json', JSON.stringify({ siteId: newSite.id }, null, '\t'));
```

命名规则：如果原 `bi-demo-vue3-host` 被占用，依次尝试 `bi-demo-vue3-host-v2`、
`bi-demo-vue3-host-v3` 等，直到创建成功。

## 四、禁止事项

1. **不要反复调用 Netlify CLI `--site-id=xxx` / `--site=xxx`**：
   - 当前环境 npx 安装/netlify 连接不稳定，容易 hang 住
   - 统一用上述 REST API 脚本部署
2. **不要直接用 base64 上传整个文件列表**：
   - 大站点会超时或 401，应使用 digest + 按需上传 sha 模式
3. **不要在上传失败后立即停止**：
   - 单个文件上传失败应记录并继续，最后检查 deploy 状态
4. **不要提交 deploy-response.json 到仓库**（可选）：
   - 该文件是本地部署产物，非源码，提交前询问用户

## 五、输出规范

部署完成后向用户报告：

1. 两个 host 的线上链接（http + https）
2. 是否新建了站点（如果是，报告新站点名和 `.netlify/state.json` 已更新）
3. 构建和部署耗时、文件数量
4. 遇到的异常及处理方式
