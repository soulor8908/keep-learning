#!/usr/bin/env node
/**
 * JS 风险扫描器
 *
 * 扫描 .vue 组件中的 JavaScript 代码，识别可能破坏基座隔离性的危险 API：
 * - 全局变量污染
 * - document.body 挂载弹窗
 * - 全局组件注册
 * - 全局状态管理（Vuex/Pinia）
 * - 全局事件总线
 *
 * 用法：
 *   node wc/js-risk-scanner/index.js <vue-file-or-dir>
 *
 * 示例：
 *   node wc/js-risk-scanner/index.js demo/vue2-widget-lib/src/components/SalesPanel.vue
 *   node wc/js-risk-scanner/index.js demo/vue2-widget-lib/src/components
 */

const fs = require('fs');
const path = require('path');

const RISK_PATTERNS = [
  // 高危：全局挂载 / 全局注册
  {
    level: 'high',
    name: 'document.body 挂载节点',
    patterns: [
      /document\.body\.appendChild\s*\(/,
      /document\.body\.insertBefore\s*\(/,
      /document\.body\.removeChild\s*\(/,
      /document\.body\.innerHTML\s*=/,
      /document\.querySelector\s*\(\s*['"]body['"]\s*\)/
    ]
  },
  {
    level: 'high',
    name: 'window 全局变量赋值',
    patterns: [
      /window\.[a-zA-Z_$][\w$]*\s*=/
    ]
  },
  {
    level: 'high',
    name: 'Vue 全局组件/插件/原型注册',
    patterns: [
      /Vue\.component\s*\(/,
      /Vue\.use\s*\(/,
      /Vue\.prototype\./,
      /app\.config\.globalProperties\./
    ]
  },
  {
    level: 'high',
    name: '全局状态管理',
    patterns: [
      /new Vuex\.Store\s*\(/,
      /createPinia\s*\(/,
      /from\s+['"]vuex['"]/,
      /from\s+['"]pinia['"]/
    ]
  },
  {
    level: 'high',
    name: '全局事件总线',
    patterns: [
      /new\s+Vue\s*\(\s*\{[^}]*\}\s*\)(?!\s*\.$mount)/,
      /new\s+Mitt\s*\(/,
      /EventBus/,
      /from\s+['"]mitt['"]/
    ]
  },

  // 中危：全局 DOM 查询
  {
    level: 'medium',
    name: '全局 DOM 查询',
    patterns: [
      /document\.getElementById\s*\(/,
      /document\.querySelector\s*\(/,
      /document\.querySelectorAll\s*\(/,
      /document\.getElementsBy(ClassName|TagName|Name)\s*\(/
    ]
  },
  {
    level: 'medium',
    name: '直接操作 document.body / document.documentElement',
    patterns: [
      /document\.body\./,
      /document\.documentElement\./
    ]
  }
];

function extractScriptBlocks(source) {
  const blocks = [];
  const regex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const attrs = match[1];
    const content = match[2];
    const langMatch = attrs.match(/lang=["']([^"']+)["']/i);
    const lang = langMatch ? langMatch[1] : 'js';
    blocks.push({ lang, content, start: match.index, end: regex.lastIndex });
  }
  return blocks;
}

function scanFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const scriptBlocks = extractScriptBlocks(source);
  const findings = [];

  scriptBlocks.forEach((block, blockIndex) => {
    if (block.lang !== 'js' && block.lang !== 'ts' && block.lang !== 'javascript') {
      return;
    }

    // 计算 script 块在文件中的起始行号
    const blockStartLine = source.substring(0, block.start).split('\n').length;

    const lines = block.content.split('\n');
    lines.forEach((line, lineIndex) => {
      const lineNumber = blockStartLine + lineIndex;
      RISK_PATTERNS.forEach(risk => {
        risk.patterns.forEach(pattern => {
          if (pattern.test(line)) {
            findings.push({
              file: filePath,
              line: lineNumber,
              column: line.search(pattern) + 1,
              level: risk.level,
              name: risk.name,
              code: line.trim()
            });
          }
        });
      });
    });
  });

  return findings;
}

function findVueFiles(dir) {
  const files = [];
  function walk(current) {
    const stat = fs.statSync(current);
    if (stat.isFile() && current.endsWith('.vue')) {
      files.push(current);
      return;
    }
    if (stat.isDirectory()) {
      fs.readdirSync(current).forEach(child => {
        walk(path.join(current, child));
      });
    }
  }
  walk(dir);
  return files;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.log('用法：node wc/js-risk-scanner/index.js <vue-file-or-dir>');
    process.exit(1);
  }

  const targetPath = path.resolve(target);
  if (!fs.existsSync(targetPath)) {
    console.error(`路径不存在: ${targetPath}`);
    process.exit(1);
  }

  const files = fs.statSync(targetPath).isDirectory() ? findVueFiles(targetPath) : [targetPath];
  if (files.length === 0) {
    console.log('未找到 .vue 文件');
    process.exit(0);
  }

  let totalHigh = 0;
  let totalMedium = 0;

  files.forEach(file => {
    const findings = scanFile(file);
    if (findings.length > 0) {
      console.log(`\n⚠️  ${path.relative(process.cwd(), file)}`);
      findings.forEach(f => {
        const icon = f.level === 'high' ? '🔴' : '🟡';
        console.log(`   ${icon} [${f.level.toUpperCase()}] ${f.name}`);
        console.log(`      行 ${f.line}: ${f.code}`);
      });
      totalHigh += findings.filter(f => f.level === 'high').length;
      totalMedium += findings.filter(f => f.level === 'medium').length;
    } else {
      console.log(`\n✅ ${path.relative(process.cwd(), file)}`);
    }
  });

  console.log(`\n总计: ${files.length} 个文件, ${totalHigh} 个高风险, ${totalMedium} 个中风险`);
  process.exit(totalHigh > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { scanFile, extractScriptBlocks, RISK_PATTERNS };
