import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['wc/**/__tests__/*.test.js'],
    globals: false
  }
});
