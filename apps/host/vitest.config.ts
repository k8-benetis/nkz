/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/utils/**', 'src/hooks/**'],
      exclude: ['src/__tests__/**', 'node_modules/**'],
      thresholds: {
        // Progressive targets — increase as coverage grows
        statements: 10,
        branches: 10,
        functions: 10,
        lines: 10,
      },
    },
  },
})
