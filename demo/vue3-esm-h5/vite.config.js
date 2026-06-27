import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'wc': path.resolve(__dirname, '../../wc')
    }
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, './src/index.js'),
      formats: ['es'],
      fileName: () => 'widget.js'
    }
  }
});
