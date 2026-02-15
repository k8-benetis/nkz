import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import path from 'path';

// https://vitejs.dev/config/
// Remote module configuration - uses globals from host for React
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'ornito_module',
      filename: 'remoteEntry.js',
      exposes: {
        './OrnitoApp': './src/App.tsx',
      },
      // Use shared modules from the host via globals
      shared: {
        'react': {
          singleton: true,
          requiredVersion: '^18.3.1',
          // Import from global - host will provide this
          import: false,
          // Use what the host provides
          shareScope: 'default',
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.3.1',
          import: false,
          shareScope: 'default',
        },
        'react-router-dom': {
          singleton: true,
          requiredVersion: '^6.26.0',
          import: false,
          shareScope: 'default',
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    preserveSymlinks: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5003,
    cors: true,
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    rollupOptions: {
      // Externalize React - will be provided by the host
      external: ['react', 'react-dom', 'react-router-dom'],
      output: {
        // Map externals to globals that the host exposes
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          'react-router-dom': 'ReactRouterDOM',
        },
      },
    },
  },
});
