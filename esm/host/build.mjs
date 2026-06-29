/**
 * ESM 物料分包构建脚本（支持 UI 分组按需：auto / manual 双模式）
 *
 * 复用 demo/{vue2,vue3,h5}-widgets/src/widgets 下的源码，输出 ESM 产物。
 *
 * UI 分组按需由环境变量 UI_GROUP_MODE 切换：
 *   - auto（默认）  ：物料 SFC 不写 import，unplugin-vue-components + 组 resolver 自动注入
 *                     import { ElTable } from 'element-plus/table'
 *   - manual        ：物料 SFC 手动写 import { ElTable } from 'element-plus/table'，
 *                     本脚本只做校验（禁止裸 import 'element-plus'、校验组 specifier 合法）
 *
 * 两种模式产物一致（都是组 specifier 的 bare import），区别只在物料源码是否要写 import。
 * 分组策略在 esm/wc/ui-groups.json，改分组只改那一个文件。
 *
 * 用法：
 *   UI_GROUP_MODE=auto   node build.mjs   # 默认
 *   UI_GROUP_MODE=manual node build.mjs
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import {
  loadUiGroups,
  createGroupResolver,
  createManualCheckPlugin
} from '../wc/importmap-gen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const esmCore = resolve(__dirname, '../wc');

// UI 分组模式：auto（resolver 自动注入）| manual（物料手写 + 校验）
const UI_GROUP_MODE = process.env.UI_GROUP_MODE === 'manual' ? 'manual' : 'auto';
const uiGroups = loadUiGroups();
console.log(`[ui-groups] 模式: ${UI_GROUP_MODE}`);

const LIBS = [
  { lib: 'vue2-widgets', stack: 'vue2', plugin: 'vue2', external: ['vue', 'element-ui'] },
  { lib: 'vue3-widgets', stack: 'vue3', plugin: 'vue3', external: ['vue', 'element-plus'] },
  { lib: 'h5-widgets',   stack: 'h5',   plugin: null,  external: [] }
];

// 物料构建 external 要把所有组 specifier 也排除（它们是 bare import，交给 importmap 解析）
function buildExternal(lib) {
  const base = [...lib.external];
  if (lib.stack === 'vue3') {
    base.push(/^element-plus\//);
  } else if (lib.stack === 'vue2') {
    base.push(/^element-ui\//);
  }
  return (id) => {
    if (id.endsWith('.css')) return false;
    return base.some((pat) => (pat instanceof RegExp ? pat.test(id) : id === pat));
  };
}

const outRoot = resolve(__dirname, '../dist/widgets');

// 源码根：auto 模式默认用 demo/ 共享源码（UMD/ESM 双产物兼容）；
// manual 模式用 esm/manual-widgets/ 手动写法示例（源码写了组 specifier，会破坏 UMD，故单独放）
// 用户可通过 WIDGETS_SRC 环境变量覆盖，指向自己的多仓源码根
const SRC_ROOT = process.env.WIDGETS_SRC
  ? resolve(process.env.WIDGETS_SRC)
  : resolve(__dirname, UI_GROUP_MODE === 'manual' ? '../manual-widgets' : '../../demo');

// 从指定仓库目录加载 vite 插件，确保用该仓库自带的 vue 版本编译 SFC
function loadPlugin(libRoot, pkgName) {
  const req = createRequire(resolve(libRoot, 'package.json'));
  const mod = req(pkgName);
  return (mod.default || mod)();
}

for (const lib of LIBS) {
  const libRoot = resolve(SRC_ROOT, lib.lib);
  const widgetsDir = resolve(libRoot, 'src/widgets');
  if (!fs.existsSync(widgetsDir)) {
    console.log(`skip ${lib.stack}: ${widgetsDir} 不存在`);
    continue;
  }

  const widgets = fs
    .readdirSync(widgetsDir)
    .filter((f) => fs.statSync(resolve(widgetsDir, f)).isDirectory());

  console.log(`Building ${widgets.length} ${lib.stack} widgets as ESM (mode=${UI_GROUP_MODE})...`);

  // Vue 编译插件（从物料仓库自己的 node_modules，避免宿主 vue 版本污染）
  const plugins = [];
  if (lib.plugin === 'vue2') {
    plugins.push(loadPlugin(libRoot, '@vitejs/plugin-vue2'));
  } else if (lib.plugin === 'vue3') {
    plugins.push(loadPlugin(libRoot, '@vitejs/plugin-vue'));
  }

  // UI 分组按需插件（仅 vue2/vue3 物料需要）
  if (lib.stack === 'vue2' || lib.stack === 'vue3') {
    if (UI_GROUP_MODE === 'auto') {
      // unplugin-vue-components：SFC 模板里的 <el-xxx> 自动注入组 specifier import
      // 从 host 仓加载（该插件不依赖 vue 版本，无需从物料仓加载）
      const Components = (await import('unplugin-vue-components/vite')).default;
      plugins.push(
        Components({
          // 不生成全局声明文件（物料是独立产物，不需要）
          dts: false,
          resolvers: [createGroupResolver(uiGroups, lib.stack)]
        })
      );
    } else {
      // manual 模式：只校验，不改写
      plugins.push(createManualCheckPlugin(uiGroups, lib.stack));
    }
  }

  for (const name of widgets) {
    await build({
      configFile: false,
      root: libRoot,
      plugins,
      resolve: {
        alias: { '@wc/core': esmCore }
      },
      build: {
        lib: {
          entry: resolve(widgetsDir, name, 'index.js'),
          formats: ['es'],
          fileName: () => `${name}.js`
        },
        rollupOptions: {
          // vue / element-plus / element-ui 及其组 specifier 全部 external，留给 importmap
          external: buildExternal(lib),
          output: {
            entryFileNames: `${name}.js`,
            assetFileNames: (assetInfo) =>
              assetInfo.name && assetInfo.name.endsWith('.css') ? `${name}.css` : `[name].[ext]`
          }
        },
        outDir: resolve(outRoot, lib.stack),
        emptyOutDir: false
      }
    });
    console.log(`  built: ${lib.stack}/${name}.js`);
  }

  // 各栈 manifest
  const manifestDir = resolve(outRoot, lib.stack);
  if (fs.existsSync(manifestDir)) {
    const files = fs.readdirSync(manifestDir);
    const widgetsMeta = widgets
      .filter((n) => files.includes(`${n}.js`))
      .map((n) => ({
        name: n,
        js: `${n}.js`,
        css: files.includes(`${n}.css`) ? `${n}.css` : undefined
      }));
    fs.writeFileSync(
      resolve(manifestDir, 'manifest.json'),
      JSON.stringify({ stack: lib.stack, widgets: widgetsMeta }, null, 2)
    );
    console.log(`  ${lib.stack}/manifest.json generated.`);
  }
}

console.log('Done.');
