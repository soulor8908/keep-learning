import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetsDir = resolve(__dirname, 'src/widgets');

const widgets = fs.readdirSync(widgetsDir)
  .filter(f => fs.statSync(resolve(widgetsDir, f)).isDirectory());

console.log(`Building ${widgets.length} h5 widgets...`);

for (const name of widgets) {
  await build({
    configFile: false,
    root: __dirname,
    build: {
      lib: {
        entry: resolve(widgetsDir, name, 'index.js'),
        name: `bi${name.charAt(0).toUpperCase() + name.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`,
        formats: ['umd'],
        fileName: () => `${name}.js`,
      },
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: false,
    },
  });
  console.log(`  built: ${name}.js`);
}

console.log('Done.');
