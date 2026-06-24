/**
 * AI 辅助工具 CLI
 *
 * 用法：
 *   node ai-assistant/cli.js migrate <widget-name> <component-path>
 *   node ai-assistant/cli.js schema <widget-name> <component-path>
 *   node ai-assistant/cli.js readme <widget-name> <component-path>
 *
 * 说明：
 * - 本 CLI 读取提示词模板和组件源码，构建 AI Prompt。
 * - 默认通过环境变量接入大模型（OpenAI 兼容接口）：
 *     AI_API_KEY  - API 密钥（必填，未设置时回退到仅打印 Prompt 的占位模式）
 *     AI_API_URL  - 接口地址（默认 https://api.openai.com/v1/chat/completions）
 *     AI_MODEL    - 模型名（默认 gpt-4o-mini）
 * - 未配置 AI_API_KEY 时仅打印 Prompt，便于人工复制到任意模型对话框。
 * - 接入 AI 后，结果会自动写回对应文件。
 */
const fs = require('fs');
const path = require('path');

const PROMPT_DIR = path.join(__dirname, 'prompts');

// 物料名只允许小写字母、数字、连字符，防止路径遍历攻击（如 ../../../etc/passwd）
const WIDGET_NAME_RE = /^[a-z0-9-]+$/;

// AI 接口请求超时（毫秒），避免大模型接口卡死时 CLI 挂起
const AI_REQUEST_TIMEOUT = 60000;

function loadPrompt(name) {
  return fs.readFileSync(path.join(PROMPT_DIR, `${name}.txt`), 'utf-8');
}

function loadComponent(componentPath) {
  return fs.readFileSync(path.resolve(componentPath), 'utf-8');
}

/**
 * 调用大模型。优先用环境变量配置的 OpenAI 兼容接口；
 * 未配置 AI_API_KEY 时回退到仅打印 Prompt 的占位模式。
 * @param {string} prompt
 * @returns {Promise<string>} 模型返回的文本
 */
async function callAI(prompt) {
  const apiKey = process.env.AI_API_KEY;
  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  // 未配置密钥：仅打印 Prompt，便于人工使用
  if (!apiKey) {
    console.log('\n========== AI Prompt（未配置 AI_API_KEY，仅打印） ==========\n');
    console.log(prompt);
    console.log('\n============================================================\n');
    console.log('提示：设置环境变量 AI_API_KEY / AI_API_URL / AI_MODEL 后可自动调用大模型。');
    return '';
  }

  // 调用 OpenAI 兼容接口
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT);
  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个资深前端工程师，擅长 Vue 组件迁移与文档生成。请严格按用户要求输出，不要多余解释。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      }),
      signal: controller.signal
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`AI 接口请求失败 (${resp.status}): ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI 接口返回为空，请检查 AI_API_URL / AI_MODEL 配置');
    }
    return content;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`AI 接口请求超时（${AI_REQUEST_TIMEOUT / 1000}s），请检查网络或增大 AI_REQUEST_TIMEOUT`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPrompt(task, widgetName, componentPath) {
  const systemPrompt = loadPrompt(
    task === 'migrate' ? 'migrate-component' :
    task === 'schema' ? 'generate-schema' :
    'generate-readme'
  );

  const componentCode = loadComponent(componentPath);

  return `${systemPrompt}\n\n组件名：${widgetName}\n\n组件代码：\n\`\`\`vue\n${componentCode}\n\`\`\``;
}

async function main() {
  const [task, widgetName, componentPath] = process.argv.slice(2);

  if (!task || !widgetName || !componentPath) {
    console.log('Usage:');
    console.log('  node ai-assistant/cli.js migrate <widget-name> <component-path>');
    console.log('  node ai-assistant/cli.js schema  <widget-name> <component-path>');
    console.log('  node ai-assistant/cli.js readme  <widget-name> <component-path>');
    console.log('\n环境变量（可选，配置后自动调用大模型）：');
    console.log('  AI_API_KEY  - API 密钥');
    console.log('  AI_API_URL  - 接口地址（默认 OpenAI）');
    console.log('  AI_MODEL    - 模型名（默认 gpt-4o-mini）');
    process.exit(1);
  }

  if (!['migrate', 'schema', 'readme'].includes(task)) {
    console.error(`未知任务: ${task}`);
    process.exit(1);
  }

  // 校验 widgetName：只允许小写字母、数字、连字符，防止路径遍历攻击
  if (!WIDGET_NAME_RE.test(widgetName)) {
    console.error(`非法物料名: "${widgetName}"，只允许小写字母、数字、连字符（[a-z0-9-]）`);
    process.exit(1);
  }

  const prompt = buildPrompt(task, widgetName, componentPath);
  const result = await callAI(prompt);

  // 有真实返回时写回文件；占位模式（空串）跳过
  if (result) {
    const ext = task === 'migrate' ? 'vue' : task === 'schema' ? 'schema.json' : 'md';
    const outputFile = `${widgetName}.${ext}`;
    fs.writeFileSync(outputFile, result);
    console.log(`已生成: ${outputFile}`);
  }
}

main().catch(console.error);
