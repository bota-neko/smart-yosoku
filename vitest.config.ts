import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
});
