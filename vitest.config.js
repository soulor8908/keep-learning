import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // 将裸模块 'vue' 统一解析到测试 stub，避免 vue2/vue3 widget-template 测试
  // 因未安装真实 vue 而失败（vi.mock 无法拦截 Vite 对裸模块的预解析）。
  resolve: {
    alias: {
      vue: path.resolve(__dirname, 'wc/__stubs__/vue.js')
    }
  },
  test: {
    environment: 'node',
    include: ['wc/**/__tests__/*.test.js'],
    globals: false
  }
});
