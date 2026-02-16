# @nekazari/module-builder

Vite preset for building Nekazari platform modules as IIFE bundles.

## Quick Start

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { nkzModulePreset } from '@nekazari/module-builder';

export default defineConfig(nkzModulePreset({
  moduleId: 'my-module',
  entry: 'src/moduleEntry.ts',     // default
  outputFile: 'nkz-module.js',     // default
}));
```

## Module Entry Point

Create `src/moduleEntry.ts`:

```ts
import type { ModuleViewerSlots } from '@nekazari/sdk';

// Import your slot components
import { MyMapLayer } from './slots/MyMapLayer';
import { MyContextPanel } from './slots/MyContextPanel';

const viewerSlots: ModuleViewerSlots = {
  'map-layer': [
    {
      id: 'my-module-map-layer',
      moduleId: 'my-module',
      component: 'MyMapLayer',
      localComponent: MyMapLayer,
      priority: 100,
    },
  ],
  'context-panel': [
    {
      id: 'my-module-context',
      moduleId: 'my-module',
      component: 'MyContextPanel',
      localComponent: MyContextPanel,
      priority: 100,
    },
  ],
};

// Self-register with the host runtime
window.__NKZ__.register({
  id: 'my-module',
  viewerSlots,
  version: '1.0.0',
});
```

## Build

```bash
npm run build:module
# → dist/nkz-module.js (IIFE bundle)
```

Add to `package.json`:
```json
{
  "scripts": {
    "build:module": "vite build"
  }
}
```

## Deploy

```bash
# Upload to MinIO
mc cp dist/nkz-module.js minio/nekazari-frontend/modules/{module-id}/nkz-module.js
```

## Externals

These dependencies are provided by the host via `window` globals. **Do not bundle them**:

| Package | Window Global |
|---------|--------------|
| `react` | `window.React` |
| `react-dom` | `window.ReactDOM` |
| `@nekazari/sdk` | `window.__NKZ_SDK__` |
| `@nekazari/ui-kit` | `window.__NKZ_UI__` |

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `moduleId` | `string` | required | Module identifier (must match DB) |
| `entry` | `string` | `'src/moduleEntry.ts'` | Entry point file |
| `outputFile` | `string` | `'nkz-module.js'` | Output filename |
| `additionalExternals` | `Record<string, string>` | `{}` | Extra externals |
| `viteConfig` | `Partial<UserConfig>` | `{}` | Additional Vite config |
