#!/usr/bin/env node
/**
 * 一键部署 demo/vue2-host 和 demo/vue3-host 到 Netlify
 *
 * 用法：
 *   NETLIFY_AUTH_TOKEN=nfp_xxx node scripts/deploy-netlify.js
 *
 * 说明：
 * - 自动读取 demo/{host}/.netlify/state.json 中的 siteId
 * - 使用 Netlify REST API 的 digest deploy 模式，只上传缺失文件
 * - 站点过期/禁用时自动创建新站点并更新 state.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const TOKEN = process.env.NETLIFY_AUTH_TOKEN;

if (!TOKEN) {
  console.error('错误：请设置环境变量 NETLIFY_AUTH_TOKEN');
  console.error('获取地址：https://app.netlify.com/user/applications/personal');
  process.exit(1);
}

async function netlifyReq(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(opts.headers || {})
    }
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) {
    throw new Error(`${r.status} ${r.statusText}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function readSiteId(hostDir) {
  const stateFile = path.join(ROOT, hostDir, '.netlify', 'state.json');
  if (!fs.existsSync(stateFile)) return null;
  return JSON.parse(fs.readFileSync(stateFile, 'utf-8')).siteId;
}

function saveSiteId(hostDir, siteId) {
  const stateDir = path.join(ROOT, hostDir, '.netlify');
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({ siteId }, null, '\t'));
}

function collectFiles(dir) {
  const files = {};
  const contentBySha = {};

  function walk(rel) {
    const entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    for (const e of entries) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(p);
      } else {
        const buf = fs.readFileSync(path.join(dir, p));
        const sha = crypto.createHash('sha1').update(buf).digest('hex');
        files[p] = sha;
        contentBySha[sha] = buf;
      }
    }
  }
  walk('');

  return { files, contentBySha };
}

async function waitDeployReady(deployId) {
  for (let i = 0; i < 15; i++) {
    const d = await netlifyReq(`https://api.netlify.com/api/v1/deploys/${deployId}`);
    if (d.state === 'ready' || d.state === 'current') return d;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('deploy 未在 30 秒内变为 ready');
}

async function createSiteWithFallback(baseName) {
  for (let i = 2; i <= 10; i++) {
    const name = i === 2 ? `${baseName}-v2` : `${baseName}-v${i}`;
    try {
      return await netlifyReq('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
    } catch (e) {
      if (!e.message.includes('subdomain') && !e.message.includes('must be unique')) throw e;
    }
  }
  throw new Error(`无法为 ${baseName} 创建可用站点，子域名均已被占用`);
}

async function deployHost(hostDir, distDir, defaultName) {
  const fullDist = path.join(ROOT, distDir);
  if (!fs.existsSync(fullDist)) {
    throw new Error(`构建目录不存在: ${distDir}，请先 npm run build`);
  }

  let siteId = readSiteId(hostDir);

  // 校验站点是否有效
  if (siteId) {
    try {
      const site = await netlifyReq(`https://api.netlify.com/api/v1/sites/${siteId}`);
      if (site.disabled) {
        console.warn(`  [${hostDir}] 站点已禁用: ${site.disabled_reason}，准备重建...`);
        siteId = null;
      }
    } catch (e) {
      if (e.message.includes('401') || e.message.includes('404')) {
        console.warn(`  [${hostDir}] 站点不可访问: ${e.message}，准备重建...`);
        siteId = null;
      } else {
        throw e;
      }
    }
  }

  // 重建过期/缺失站点
  if (!siteId) {
    const newSite = await createSiteWithFallback(defaultName);
    siteId = newSite.id;
    saveSiteId(hostDir, siteId);
    console.log(`  [${hostDir}] 新建站点: ${newSite.name} -> ${newSite.url}`);
  }

  // 收集文件并创建 deploy
  const { files, contentBySha } = collectFiles(fullDist);
  const deploy = await netlifyReq(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files })
  });

  console.log(`  [${hostDir}] deploy ${deploy.id}, required=${deploy.required?.length || 0}`);

  // 上传缺失文件
  for (const sha of deploy.required || []) {
    const buf = contentBySha[sha];
    if (!buf) throw new Error(`缺少 required sha 对应的内容: ${sha}`);
    await netlifyReq(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files/${sha}`, {
      method: 'PUT',
      body: buf
    });
  }

  // 等待 ready
  const ready = await waitDeployReady(deploy.id);
  return ready;
}

async function main() {
  const start = Date.now();

  const v2 = await deployHost('demo/vue2-host', 'demo/vue2-host/dist', 'bi-demo-vue2-host');
  fs.writeFileSync(path.join(ROOT, 'demo/vue2-host/deploy-response.json'), JSON.stringify(v2, null, 2));

  const v3 = await deployHost('demo/vue3-host', 'demo/vue3-host/dist', 'bi-demo-vue3-host');
  fs.writeFileSync(path.join(ROOT, 'demo/vue3-host/deploy-response.json'), JSON.stringify(v3, null, 2));

  console.log('\n========== 部署完成 ==========');
  console.log(`Vue2 host: ${v2.ssl_url || v2.url}`);
  console.log(`Vue3 host: ${v3.ssl_url || v3.url}`);
  console.log(`总耗时: ${(Date.now() - start) / 1000}s`);
}

main().catch(e => {
  console.error('\n部署失败:', e.message);
  process.exit(1);
});
