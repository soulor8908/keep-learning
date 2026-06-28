import { build } from 'vite';
import vue2 from '@vitejs/plugin-vue2';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetsDir = resolve(__dirname, 'src/widgets');

const widgets = fs.readdirSync(widgetsDir)
  .filter(f => fs.statSync(resolve(widgetsDir, f)).isDirectory());

console.log(`Building ${widgets.length} vue2 widgets...`);

const outDir = resolve(__dirname, 'dist');

for (const name of widgets) {
  await build({
    configFile: false,
    root: __dirname,
    plugins: [vue2()],
    build: {
      lib: {
        entry: resolve(widgetsDir, name, 'index.js'),
        name,   // UMD 全局变量名 = 目录名，不再做 bi 前缀 + camelCase 转换
        formats: ['umd'],
        fileName: () => `${name}`,
      },
      rollupOptions: {
        external: (id) => {
          if (id.endsWith('.css')) return false;
          return id === 'vue' || id === 'element-ui';
        },
        output: {
          globals: { vue: 'Vue2', 'element-ui': 'ELEMENT' },
          entryFileNames: `${name}.js`,
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return `${name}.css`;
            }
            return `[name].[ext]`;
          },
        },
      },
      outDir,
      emptyOutDir: false,
    },
  });
  console.log(`  built: ${name}.js + ${name}.css`);
}

// 生成 manifest.json，消除运行时 name 猜测的脆弱性
fs.writeFileSync(
  resolve(outDir, 'manifest.json'),
  JSON.stringify({
    widgets: widgets.map(name => ({ name, js: `${name}.js`, css: `${name}.css` }))
  }, null, 2)
);
console.log('  manifest.json generated.');

console.log('Done.');
