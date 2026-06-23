/**
 * AI 辅助工具 CLI
 *
 * 用法：
 *   node ai-assistant/cli.js migrate <widget-name> <component-path>
 *   node ai-assistant/cli.js schema <widget-name> <component-path>
 *   node ai-assistant/cli.js readme <widget-name> <component-path>
 *
 * 说明：
 * - 本 CLI 只负责读取提示词模板和组件源码，输出建议的 AI Prompt。
 * - 实际调用大模型（OpenAI / 豆包 / 文心等）需要接入对应 API，这里预留了 callAI 接口。
 * - 接入 AI 后，可直接把输出写回文件，实现自动化迁移/文档生成。
 */
const fs = require('fs');
const path = require('path');

const PROMPT_DIR = path.join(__dirname, 'prompts');

function loadPrompt(name) {
  return fs.readFileSync(path.join(PROMPT_DIR, `${name}.txt`), 'utf-8');
}

function loadComponent(componentPath) {
  return fs.readFileSync(path.resolve(componentPath), 'utf-8');
}

// 预留：接入大模型 API
async function callAI(prompt) {
  // TODO: 接入实际 AI 服务
  // 例如：return await openai.chat.completions.create({...})
  console.log('\n========== AI Prompt ==========\n');
  console.log(prompt);
  console.log('\n================================\n');
  return '[AI 返回结果占位，接入 API 后可替换为真实返回值]';
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
    process.exit(1);
  }

  if (!['migrate', 'schema', 'readme'].includes(task)) {
    console.error(`未知任务: ${task}`);
    process.exit(1);
  }

  const prompt = buildPrompt(task, widgetName, componentPath);
  const result = await callAI(prompt);

  // 示例：把 AI 结果写入文件（接入 API 后打开注释）
  // const outputFile = `${widgetName}.${task === 'migrate' ? 'vue' : task === 'schema' ? 'schema.json' : 'md'}`;
  // fs.writeFileSync(outputFile, result);
  // console.log(`已生成: ${outputFile}`);
}

main().catch(console.error);
