/**
 * Vue3 物料 ESM 分包构建（支持 UI 分组按需：auto / manual 双模式）
 *
 * 纯 ESM 产物，依赖（vue / element-plus 及其组 specifier）全部 external，由基座 importmap 解析。
 * 不再输出 UMD，不再有 window 全局变量。
 *
 * UI 分组按需由环境变量 UI_GROUP_MODE 切换：
 *   - auto（默认）  ：物料 SFC 不写 import，unplugin-vue-components + 组 resolver 自动注入
 *                     import { ElTable } from 'element-plus/table'
 *   - manual        ：物料 SFC 手动写 import { ElTable } from 'element-plus/table'，
 *                     本脚本只做校验（禁止裸 import 'element-plus'、校验组 specifier 合法）
 *
 * 用法：
 *   UI_GROUP_MODE=auto   node build.mjs   # 默认
 *   UI_GROUP_MODE=manual node build.mjs
 */
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  loadUiGroups,
  createGroupResolver,
  createManualCheckPlugin
} from '@wc/core/importmap-gen';

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetsDir = resolve(__dirname, 'src/widgets');
const outDir = resolve(__dirname, 'dist');

const UI_GROUP_MODE = process.env.UI_GROUP_MODE === 'manual' ? 'manual' : 'auto';
const uiGroups = loadUiGroups();
console.log(`[ui-groups] 模式: ${UI_GROUP_MODE}`);

// external：vue / element-plus 及其组 specifier（bare import，交给 importmap）
const EXTERNAL_PATTERNS = ['vue', 'element-plus', /^element-plus\//];
function isExternal(id) {
  if (id.endsWith('.css')) return false;
  return EXTERNAL_PATTERNS.some((pat) => (pat instanceof RegExp ? pat.test(id) : id === pat));
}

const widgets = fs
  .readdirSync(widgetsDir)
  .filter((f) => fs.statSync(resolve(widgetsDir, f)).isDirectory());

console.log(`Building ${widgets.length} vue3 widgets as ESM (mode=${UI_GROUP_MODE})...`);

// UI 分组插件
const groupPlugins = [];
if (UI_GROUP_MODE === 'auto') {
  const Components = (await import('unplugin-vue-components/vite')).default;
  groupPlugins.push(
    Components({
      dts: false,
      resolvers: [createGroupResolver(uiGroups, 'vue3')]
    })
  );
} else {
  groupPlugins.push(createManualCheckPlugin(uiGroups, 'vue3'));
}

for (const name of widgets) {
  await build({
    configFile: false,
    root: __dirname,
    plugins: [vue(), ...groupPlugins],
    build: {
      lib: {
        entry: resolve(widgetsDir, name, 'index.js'),
        formats: ['es'],
        fileName: () => `${name}.js`
      },
      rollupOptions: {
        external: isExternal,
        output: {
          entryFileNames: `${name}.js`,
          assetFileNames: (assetInfo) =>
            assetInfo.name && assetInfo.name.endsWith('.css') ? `${name}.css` : `[name].[ext]`
        }
      },
      outDir,
      emptyOutDir: false
    }
  });
  console.log(`  built: ${name}.js`);
}

// manifest.json：纯 ESM，记录产物清单（基座注册表只需 url/css，无需 UMD 全局名）
const files = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
const widgetsMeta = widgets
  .filter((n) => files.includes(`${n}.js`))
  .map((n) => ({
    name: n,
    js: `${n}.js`,
    css: files.includes(`${n}.css`) ? `${n}.css` : undefined
  }));
fs.writeFileSync(
  resolve(outDir, 'manifest.json'),
  JSON.stringify({ stack: 'vue3', format: 'esm', widgets: widgetsMeta }, null, 2)
);
console.log('  manifest.json generated.');
console.log('Done.');
