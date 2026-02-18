import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import cesium from 'vite-plugin-cesium'
// DISABLED: vite-plugin-federation causes top-level await that hangs in production.
// Remote modules should use dynamic imports or iframe-based microfrontends instead.
// import federation from '@originjs/vite-plugin-federation'

// https://vitejs.dev/config/
// Last updated: 2025-12-16 - Disabled Module Federation (causes production hangs)
export default defineConfig({
  plugins: [
    react(),
    cesium(),
    // Plugin para preservar scripts inline en index.html
    // IMPORTANTE: Este plugin debe ejecutarse ANTES de que Vite procese el HTML
    // para que Vite pueda inyectar el script del bundle correctamente
    {
      name: 'preserve-inline-scripts',
      transformIndexHtml: {
        enforce: 'pre', // Ejecutar ANTES de que Vite procese el HTML
        transform(html, _ctx) {
          // Vite procesará el HTML después y añadirá el script del bundle
          // Este plugin solo preserva los scripts inline que ya existen
          return html;
        }
      }
    },
    // DISABLED: Module Federation causes top-level await hangs in production
    // TODO: Investigate alternative approaches for remote modules:
    // - Dynamic imports with custom loader
    // - Iframe-based microfrontends  
    // - Web Components
    /*
    federation({
      name: 'nekazari-host',
      remotes: {
        // 'weather-module': 'http://modules.nekazari.robotika.cloud/weather/remoteEntry.js',
      },
      shared: {
        'react': { singleton: true, requiredVersion: '^18.3.1' },
        'react-dom': { singleton: true, requiredVersion: '^18.3.1' },
        'react-router-dom': { singleton: true, requiredVersion: '^6.26.0' },
        '@nekazari/sdk': { singleton: true },
        '@nekazari/ui-kit': { singleton: true },
      },
    }),
    */
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Evita problemas con symlinks de pnpm en el monorepo
    preserveSymlinks: true,
  },
  optimizeDeps: {
    include: [
      '@nekazari/sdk',
      '@nekazari/ui-kit',
      'js-sha256',
      '@kurkle/color',
      '@turf/helpers',
      '@turf/bbox',
      '@turf/intersect',
      '@turf/area',
      '@turf/boolean-contains',
      '@turf/boolean-disjoint',
      '@turf/boolean-point-in-polygon',
      '@turf/invariant',
    ]
  },
  ssr: {
    noExternal: ['@turf/*']
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ngsi-ld': {
        target: 'http://localhost:1026',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'esnext',
    minify: 'esbuild', // Re-enabled: esbuild minifier handles Cesium correctly (terser caused "T is not a function")
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Hash-based versioning for cache busting
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
        // Optimized chunking for faster initial load
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          i18n: ['react-i18next', 'i18next'],
          keycloak: ['keycloak-js', 'js-sha256'],
        },
      },
      external: [], // No externalizar nada - todo debe estar en el bundle
    },
  },
  define: {
    // Make environment variables available at build time
    __APP_ENV__: JSON.stringify(process.env.NODE_ENV),
  },
})
