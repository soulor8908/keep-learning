import { defineConfig } from 'vite';

// H5 物料 UMD 构建配置
export default defineConfig({
  build: {
    lib: {
      entry: './src/index.js',
      name: 'biClockWidget',
      formats: ['umd'],
      fileName: () => 'widget.js'
    },
    outDir: 'dist'
  }
});
