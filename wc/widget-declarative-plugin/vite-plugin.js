/**
 * 声明式物料使用插件 —— Vite 包装器
 *
 * 把 babel-plugin-widget-declarative 接入 Vite 的 transform 阶段：
 * - 对 .jsx / .tsx 文件应用 Babel 转换（含 JSX 宏与 $widget 宏）
 * - 对 .js / .ts 文件应用 Babel 转换（仅 $widget 宏，不做 JSX 以避免误伤）
 * - 对 .vue 文件的 <script> 块做轻量转换（仅 $widget 宏）
 *
 * 依赖：@babel/core（可选）。若未安装，则降级为"运行时宏"模式——
 * 不做构建期转换，但会注入 import，让 $widget 指向运行时 helper 的别名。
 *
 * Vite 用法（vite.config.js）：
 *   import widgetDeclarative from 'wc/widget-declarative-plugin/vite-plugin';
 *   export default {
 *     plugins: [
 *       widgetDeclarative({
 *         registry: { 'bi-sales-panel': { js: 'https://.../x.js', css: '.../x.css', vueVersion: '2' } }
 *       })
 *     ]
 *   };
 *
 * 之后业务代码可直接写：
 *   const el = await $widget('bi-sales-panel', { title: '销售面板' });
 * 或在 JSX 中：
 *   <Widget name="bi-sales-panel" config={{ title: '销售面板' }} />
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const DEFAULT_BABEL_OPTS = {
  registry: {},
  helperModule: 'wc/widget-declarative-plugin/runtime',
  helperName: 'widgetMount',
  macroName: '$widget',
  jsxTag: 'Widget'
};

let babelCore = null;
function loadBabelCore() {
  if (babelCore === null) {
    try { babelCore = require('@babel/core'); }
    catch (e) { babelCore = false; }
  }
  return babelCore;
}

const babelPlugin = require('./babel-plugin.js');

/**
 * 提取 .vue 文件 <script> 块内容与位置
 * 返回 { content, start, end } 或 null
 */
function extractVueScript(source) {
  const regex = /<script([^>]*)>([\s\S]*?)<\/script>/i;
  const m = source.match(regex);
  if (!m) return null;
  const start = m.index + m[0].indexOf(m[2]);
  return { content: m[2], start, end: start + m[2].length, attrs: m[1] };
}

export default function widgetDeclarativeVitePlugin(options = {}) {
  const opts = { ...DEFAULT_BABEL_OPTS, ...options };
  const babelOpts = {
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    plugins: [[babelPlugin, opts]]
  };

  return {
    name: 'widget-declarative-plugin',
    enforce: 'pre',

    async transform(code, id) {
      // 仅处理业务源码，跳过 node_modules 与已转换产物
      if (id.includes('node_modules')) return null;
      if (id.includes('\0')) return null; // 虚拟模块

      const isJsx = /\.jsx$/i.test(id) || /\.tsx$/i.test(id);
      const isJs = /\.(m?js|ts)$/i.test(id);
      const isVue = /\.vue$/i.test(id);

      if (!isJsx && !isJs && !isVue) return null;

      // 快速跳过：源码不含声明式语法则不做任何处理，避免无谓的 babel 调用
      const hasMacro = code.includes(opts.macroName + '(') || code.includes(opts.macroName + ' ');
      const hasJsx = isJsx && code.includes(opts.jsxTag);
      if (!hasMacro && !hasJsx) {
        // .vue 文件还需检查 script 内是否有宏
        if (!isVue) return null;
        if (!code.includes(opts.macroName)) return null;
      }

      const core = loadBabelCore();
      if (!core) {
        // 降级：不转换，仅注入 import 让 $widget 指向运行时 helper（运行时宏模式）
        // 仅当确实使用了宏时注入
        if (hasMacro && !code.includes(opts.helperModule)) {
          const injection = `import { ${opts.helperName} as ${opts.macroName} } from '${opts.helperModule}';\n`;
          return { code: injection + code, map: null };
        }
        return null;
      }

      try {
        if (isVue) {
          // 只转换 <script> 块，避免触碰 <template>（Vue 模板由 vue 插件处理）
          const scriptBlock = extractVueScript(code);
          if (!scriptBlock) return null;
          if (!scriptBlock.content.includes(opts.macroName)) return null;
          const transformed = await core.transformAsync(scriptBlock.content, {
            ...babelOpts,
            filename: id + '.script.js'
          });
          if (!transformed || transformed.code === scriptBlock.content) return null;
          const newCode = code.slice(0, scriptBlock.start) + transformed.code + code.slice(scriptBlock.end);
          return { code: newCode, map: transformed.map || null };
        }

        // .js/.ts/.jsx/.tsx：整文件转换
        const transformed = await core.transformAsync(code, {
          ...babelOpts,
          filename: id,
          parserOpts: isJsx ? { plugins: ['jsx'] } : undefined
        });
        if (!transformed) return null;
        return { code: transformed.code, map: transformed.map || null };
      } catch (e) {
        // 转换失败不阻断构建，告警并返回原码
        console.warn(`[widget-declarative-plugin] 转换 ${id} 失败:`, e.message);
        return null;
      }
    }
  };
}
