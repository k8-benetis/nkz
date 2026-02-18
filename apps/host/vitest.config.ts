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
      include: ['src/utils/**', 'src/hooks/**', 'src/components/**'],
      exclude: ['src/__tests__/**', 'node_modules/**'],
      thresholds: {
        // Raised 2026-02: urlNormalizer + nkzRuntime tests. Next target M1: 5% lines.
        statements: 2,
        branches: 50,
        functions: 15,
        lines: 2,
      },
    },
  },
})
