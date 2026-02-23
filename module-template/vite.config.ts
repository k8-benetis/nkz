import { defineConfig } from 'vite';
import { nkzModulePreset } from '@nekazari/module-builder';
import path from 'path';

const MODULE_ID = 'MODULE_NAME';

export default defineConfig(nkzModulePreset({
  moduleId: MODULE_ID,
  entry: 'src/moduleEntry.ts',
  viteConfig: {
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 5003,
      proxy: {
        // Set VITE_PROXY_TARGET to your API domain for local dev.
        // No default to avoid hardcoded URLs.
        '/api': {
          target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          secure: process.env.VITE_PROXY_TARGET?.startsWith('https') ?? false,
        },
      },
    },
  },
}));
