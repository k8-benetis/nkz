// =============================================================================
// @nekazari/module-builder — Vite Preset for NKZ Module IIFE Bundles
// =============================================================================
// Usage in a module's vite.config.ts:
//
//   import { defineConfig } from 'vite';
//   import { nkzModulePreset } from '@nekazari/module-builder';
//
//   export default defineConfig(nkzModulePreset({
//     moduleId: 'catastro-spain',
//     entry: 'src/moduleEntry.ts',
//   }));
//
// This produces a single IIFE bundle at dist/nkz-module.js that:
// - Externalizes React, ReactDOM, @nekazari/sdk, @nekazari/ui-kit
// - Maps them to window globals (window.React, window.__NKZ_SDK__, etc.)
// - Wraps everything in an IIFE that calls window.__NKZ__.register()
// =============================================================================

import type { UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

// =============================================================================
// External Dependencies — mapped to window globals provided by the host
// =============================================================================

const NKZ_EXTERNALS: Record<string, string> = {
    'react': 'React',
    'react-dom': 'ReactDOM',
    'react-dom/client': 'ReactDOM',
    'react-router-dom': 'ReactRouterDOM',
    '@nekazari/sdk': '__NKZ_SDK__',
    '@nekazari/ui-kit': '__NKZ_UI__',
};

// =============================================================================
// Preset Options
// =============================================================================

export interface NKZModulePresetOptions {
    /** Module identifier (must match DB entry in marketplace_modules) */
    moduleId: string;
    /** Entry point file (default: 'src/moduleEntry.ts') */
    entry?: string;
    /** Output filename (default: 'nkz-module.js') */
    outputFile?: string;
    /** Additional Vite config to merge */
    viteConfig?: Partial<UserConfig>;
    /** Additional externals beyond the defaults */
    additionalExternals?: Record<string, string>;
}

// =============================================================================
// Preset Function
// =============================================================================

/**
 * Creates a Vite config for building a Nekazari module as an IIFE bundle.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { nkzModulePreset } from '@nekazari/module-builder';
 *
 * export default defineConfig(nkzModulePreset({
 *   moduleId: 'catastro-spain',
 * }));
 * ```
 */
export function nkzModulePreset(options: NKZModulePresetOptions): UserConfig {
    const {
        moduleId,
        entry = 'src/moduleEntry.ts',
        outputFile = 'nkz-module.js',
        viteConfig = {},
        additionalExternals = {},
    } = options;

    if (!moduleId) {
        throw new Error('[module-builder] moduleId is required');
    }

    // Merge default externals with any additional ones
    const allExternals = { ...NKZ_EXTERNALS, ...additionalExternals };
    const externalKeys = Object.keys(allExternals);
    const globals = { ...allExternals };

    const config: UserConfig = {
        plugins: [
            // Use 'classic' runtime to emit React.createElement() calls.
            // The 'automatic' runtime emits _jsx() which doesn't exist on
            // window.React (UMD global). Classic runtime is required for IIFE modules.
            react({ jsxRuntime: 'classic' }),
            // Banner plugin to add module metadata comment
            {
                name: 'nkz-module-banner',
                generateBundle(_options, bundle) {
                    for (const chunk of Object.values(bundle)) {
                        if (chunk.type === 'chunk' && chunk.isEntry) {
                            chunk.code = `/* NKZ Module: ${moduleId} | Built: ${new Date().toISOString()} */\n${chunk.code}`;
                        }
                    }
                },
            },
        ],

        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
            '__NKZ_MODULE_ID__': JSON.stringify(moduleId),
        },

        build: {
            lib: {
                entry,
                name: `NKZModule_${moduleId.replace(/[^a-zA-Z0-9_]/g, '_')}`,
                formats: ['iife'],
                fileName: () => outputFile,
            },
            rollupOptions: {
                external: externalKeys,
                output: {
                    globals,
                    // Single file output
                    inlineDynamicImports: true,
                },
            },
            // Output to dist/
            outDir: 'dist',
            // Clean dist on build
            emptyOutDir: true,
            // Generate sourcemaps for debugging
            sourcemap: true,
            // Minify for production
            minify: 'esbuild',
            // Don't copy public directory
            copyPublicDir: false,
        },

        // Resolve aliases for development
        resolve: {
            alias: {
                '@': '/src',
            },
        },
    };

    // Deep merge with user's additional config
    if (viteConfig.plugins) {
        config.plugins = [...(config.plugins || []), ...viteConfig.plugins];
    }
    if (viteConfig.define) {
        config.define = { ...config.define, ...viteConfig.define };
    }
    if (viteConfig.resolve?.alias) {
        const existingAlias = config.resolve?.alias as Record<string, string> || {};
        const newAlias = viteConfig.resolve.alias as Record<string, string>;
        config.resolve = { ...config.resolve, alias: { ...existingAlias, ...newAlias } };
    }

    return config;
}

// Re-export for convenience
export { NKZ_EXTERNALS };
export default nkzModulePreset;
