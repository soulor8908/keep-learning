/**
 * ESM 物料分包构建脚本
 *
 * 复用 demo/{vue2,vue3,h5}-widgets/src/widgets 下的源码（SFC + 入口 index.js），
 * 仅切换两件事：
 *   1. 产物格式：UMD → ESM（formats: ['es']，不再需要 name/globals）
 *   2. 模板来源：@wc/core → @wc/esm-core（通过 resolve.alias 重定向到 esm/wc）
 *
 * 物料入口源码完全不改——其 `import { createVueXWidget } from '@wc/core/templates/vueX'`
 * 在 UMD 构建里走 wc/templates（读 window.Vue2/Vue3），在 ESM 构建里走 esm/wc/templates
 * （bare import 'vue'，由 importmap 解析）。同一份源码，两种产物。
 *
 * 产物按技术栈分目录输出，配合 importmap 的 scopes 做依赖分流：
 *   esm/dist/widgets/vue2/<name>.js   ← importmap scope /widgets/vue2/ → Vue2
 *   esm/dist/widgets/vue3/<name>.js   ← importmap scope /widgets/vue3/ → Vue3
 *   esm/dist/widgets/h5/<name>.js     ← 无依赖，无需 scope
 *
 * 多仓约束：每个物料仓库自带正确版本的 vue + 编译插件（vue2-widgets 自带 vue@2.7 +
 * @vitejs/plugin-vue2，vue3-widgets 自带 vue@3 + @vitejs/plugin-vue）。本脚本通过
 * createRequire 从各仓库自己的 node_modules 加载插件，避免宿主 vue 版本污染编译。
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const esmCore = resolve(__dirname, '../wc');

const LIBS = [
  { lib: 'vue2-widgets', stack: 'vue2', plugin: 'vue2', external: ['vue', 'element-ui'] },
  { lib: 'vue3-widgets', stack: 'vue3', plugin: 'vue3', external: ['vue', 'element-plus'] },
  { lib: 'h5-widgets',   stack: 'h5',   plugin: null,  external: [] }
];

const outRoot = resolve(__dirname, '../dist/widgets');

// 从指定仓库目录加载 vite 插件，确保用该仓库自带的 vue 版本编译 SFC
function loadPlugin(libRoot, pkgName) {
  const req = createRequire(resolve(libRoot, 'package.json'));
  const mod = req(pkgName);
  return (mod.default || mod)();
}

for (const lib of LIBS) {
  const libRoot = resolve(__dirname, `../../demo/${lib.lib}`);
  const widgetsDir = resolve(libRoot, 'src/widgets');
  if (!fs.existsSync(widgetsDir)) {
    console.log(`skip ${lib.stack}: ${widgetsDir} 不存在`);
    continue;
  }

  const widgets = fs
    .readdirSync(widgetsDir)
    .filter((f) => fs.statSync(resolve(widgetsDir, f)).isDirectory());

  console.log(`Building ${widgets.length} ${lib.stack} widgets as ESM...`);

  // 按需加载对应 Vue 插件（从物料仓库自己的 node_modules，避免宿主 vue 版本污染）
  const plugins = [];
  if (lib.plugin === 'vue2') {
    plugins.push(loadPlugin(libRoot, '@vitejs/plugin-vue2'));
  } else if (lib.plugin === 'vue3') {
    plugins.push(loadPlugin(libRoot, '@vitejs/plugin-vue'));
  }

  for (const name of widgets) {
    await build({
      configFile: false,
      root: libRoot,
      plugins,
      resolve: {
        // 关键：把 @wc/core 重定向到 ESM 核心，使入口里的模板走 bare import 版本
        alias: { '@wc/core': esmCore }
      },
      build: {
        lib: {
          entry: resolve(widgetsDir, name, 'index.js'),
          formats: ['es'],
          fileName: () => `${name}.js`
        },
        rollupOptions: {
          // vue / element-ui / element-plus 全部 external，保留为 bare import，交给 importmap 解析
          external: (id) => (id.endsWith('.css') ? false : lib.external.includes(id)),
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

  // 各栈 manifest（与 UMD 版一致，便于基座注册表读取）
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
