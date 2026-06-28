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

for (const name of widgets) {
  await build({
    configFile: false,
    root: __dirname,
    plugins: [vue2()],
    build: {
      lib: {
        entry: resolve(widgetsDir, name, 'index.js'),
        name: `bi${name.charAt(0).toUpperCase() + name.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`,
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
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: false,
    },
  });
  console.log(`  built: ${name}.js + ${name}.css`);
}

console.log('Done.');
