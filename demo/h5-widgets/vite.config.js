import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.js',
      name: 'h5Widgets',
      formats: ['umd'],
      fileName: () => 'h5-widgets.js'
    }
  }
});
