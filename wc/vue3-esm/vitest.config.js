import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      vue: path.resolve(__dirname, '../../node_modules/.pnpm/vue@3.5.35/node_modules/vue/dist/vue.runtime.esm-browser.js')
    }
  },
  test: {
    environment: 'happy-dom',
    include: ['wc/vue3-esm/__tests__/*.test.js'],
    globals: true
  }
});
