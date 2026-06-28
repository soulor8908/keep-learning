import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetsDir = resolve(__dirname, 'src/widgets');

const widgets = fs.readdirSync(widgetsDir)
  .filter(f => fs.statSync(resolve(widgetsDir, f)).isDirectory());

console.log(`Building ${widgets.length} h5 widgets...`);

const outDir = resolve(__dirname, 'dist');

for (const name of widgets) {
  await build({
    configFile: false,
    root: __dirname,
    build: {
      lib: {
        entry: resolve(widgetsDir, name, 'index.js'),
        name,   // UMD 全局变量名 = 目录名，不再做 bi 前缀 + camelCase 转换
        formats: ['umd'],
        fileName: () => `${name}.js`,
      },
      outDir,
      emptyOutDir: false,
    },
  });
  console.log(`  built: ${name}.js`);
}

// 生成 manifest.json，消除运行时 name 猜测的脆弱性
fs.writeFileSync(
  resolve(outDir, 'manifest.json'),
  JSON.stringify({
    widgets: widgets.map(name => ({ name, js: `${name}.js` }))
  }, null, 2)
);
console.log('  manifest.json generated.');

console.log('Done.');
