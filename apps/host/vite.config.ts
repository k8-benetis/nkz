import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
// import cesium from 'vite-plugin-cesium' // REMOVED: Custom handling below

// Custom plugin to copy Cesium assets
const copyCesiumAssets = () => {
  return {
    name: 'copy-cesium-assets',
    buildStart: () => {
      const cesiumSource = path.join(__dirname, 'node_modules/cesium/Build/Cesium');
      const cesiumDest = path.join(__dirname, 'dist/cesium');

      console.log('[Cesium] Copying assets from', cesiumSource, 'to', cesiumDest);

      // Ensure destination exists
      if (!fs.existsSync(cesiumDest)) {
        fs.mkdirSync(cesiumDest, { recursive: true });
      }

      const assets = ['Workers', 'ThirdParty', 'Assets', 'Widgets'];

      assets.forEach(asset => {
        const src = path.join(cesiumSource, asset);
        const dest = path.join(cesiumDest, asset);

        if (fs.existsSync(src)) {
          // Recursive copy
          fs.cpSync(src, dest, { recursive: true });
        } else {
          console.warn(`[Cesium] Asset source not found: ${src}`);
        }
      });
      console.log('[Cesium] Assets copied successfully.');
    }
  }
}

// https://vitejs.dev/config/
// Last updated: 2025-12-16 - Disabled Module Federation (causes production hangs)
export default defineConfig({
  plugins: [
    react(),
    copyCesiumAssets(), // Manual asset copying
    // Plugin para preservar scripts inline en index.html
    // IMPORTANTE: Este plugin debe ejecutarse ANTES de que Vite procese el HTML
    // para que Vite pueda inyectar el script del bundle correctamente
    {
      name: 'preserve-inline-scripts',
      transformIndexHtml: {
        order: 'pre', // Use 'order' instead of deprecated 'enforce'
        handler(html, ctx) { // Use 'handler' instead of deprecated 'transform'
          return html;
        }
      }
    },
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
      'cesium', // Ensure Cesium is pre-bundled
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
    minify: false, // Keep disabled for now to minimize vars
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
          cesium: ['cesium'], // Split Cesium into its own chunk
        },
      },
      external: [], // No externalizar nada - todo debe estar en el bundle
    },
  },
  define: {
    // Make environment variables available at build time
    __APP_ENV__: JSON.stringify(process.env.NODE_ENV),
    // CRITICAL FIX: Explicitly set Cesium base URL
    // Nginx proxies /cesium/ to MinIO
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
})
