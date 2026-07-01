/**
 * H5 物料 ESM 分包构建
 *
 * H5 物料是纯 JS，无框架依赖、无 UI 库，因此无 external、无 UI 分组。
 * ESM 与 UMD 对 H5 物料的差别仅在产物格式：ESM 用 import/export，UMD 用 window 全局。
 *
 * 纯 ESM 方案下，H5 物料既可被同栈基座 ESM 直引（import { render } from '...'），
 * 也可被跨栈基座通过 loader 动态 import() 加载。
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetsDir = resolve(__dirname, 'src/widgets');
const outDir = resolve(__dirname, 'dist');

const widgets = fs
  .readdirSync(widgetsDir)
  .filter((f) => fs.statSync(resolve(widgetsDir, f)).isDirectory());

console.log(`Building ${widgets.length} h5 widgets as ESM...`);

for (const name of widgets) {
  await build({
    configFile: false,
    root: __dirname,
    build: {
      lib: {
        entry: resolve(widgetsDir, name, 'index.js'),
        formats: ['es'],
        fileName: () => `${name}.js`
      },
      outDir,
      emptyOutDir: false
    }
  });
  console.log(`  built: ${name}.js`);
}

// manifest.json：纯 ESM，H5 物料无 CSS（样式内联在 JS 里）
const files = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
const widgetsMeta = widgets
  .filter((n) => files.includes(`${n}.js`))
  .map((n) => ({ name: n, js: `${n}.js` }));
fs.writeFileSync(
  resolve(outDir, 'manifest.json'),
  JSON.stringify({ stack: 'h5', format: 'esm', widgets: widgetsMeta }, null, 2)
);
console.log('  manifest.json generated.');
console.log('Done.');
