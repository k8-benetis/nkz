# NKZ Platform - External Developer Guide

**Platform Name:** Nekazari (NKZ)  
**Version:** 2.0.0  
**Last Updated:** December 2025  
**Status:** Production Ready

> **Note:** "Nekazari" is the official platform name. "NKZ" is used as the technical brand/acronym in code, package names, and technical documentation.

---

## 📋 Table of Contents

1. [Introduction](#introduction)
2. [Quick Start: Hello World Module](#quick-start-hello-world-module)
3. [Module Structure](#module-structure)
4. [Manifest Configuration](#manifest-configuration)
5. [SDK Reference](#sdk-reference)
6. [UI Components](#ui-components)
7. [Build Configuration](#build-configuration)
8. [Upload & Validation Process](#upload--validation-process)
9. [Best Practices](#best-practices)
10. [Examples & Reference](#examples--reference)

---

## Introduction

### What is NKZ Platform?

**NKZ Platform** (officially **Nekazari**) is not only an agricultural platform but also a tool for software and hardware developers. Built on **FIWARE**, it enables farmers and other users to manage their operations through a modular ecosystem. The platform supports **external addon modules** that extend functionality.

> **Branding Note:** The SDK packages are published under the `@nekazari` organization on NPM (`@nekazari/sdk`, `@nekazari/ui-kit`). "Nekazari" is the official platform name.

### Module Architecture

NKZ Platform uses **dynamic ES module imports** to load external modules:

- **Host Application**: The main NKZ frontend that loads your module
- **Remote Module**: Your addon, served as a separate bundle (built with Module Federation plugin)
- **Shared Dependencies**: React, ReactDOM, and React Router are shared from the host

**Technical Note**: Modules are built using `@originjs/vite-plugin-federation` which generates a compatible format. The host loads these modules via dynamic `import()` statements rather than Module Federation's runtime. This is transparent to developers - your modules will work correctly when built with the template.

### What You Can Build

Modules can provide:
- **Analytics Dashboards**: Data visualization and insights
- **IoT Integrations**: Connect external sensors or devices
- **Weather Services**: Custom weather data providers
- **Biodiversity Tools**: Species identification, monitoring
- **Robotics Control**: Manage agricultural robots
- **Custom Workflows**: Any agricultural-related functionality

---

## Quick Start: Hello World Module

Let's create a simple "Hello World" module to get started.

### 🚀 Fast Track: Use Template Repository (Recommended)

**Get started in 5 minutes:**

```bash
# Clone the template repository
git clone https://github.com/k8-benetis/nkz-module-template.git my-module
cd my-module

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The template includes:
- ✅ All dependencies pre-configured
- ✅ SDK packages included
- ✅ Complete "Hello World" example
- ✅ Vite proxy configured for API calls
- ✅ TypeScript setup
- ✅ Tailwind CSS configured

**Skip to Step 13** to customize and package your module.

---

### Manual Setup (Alternative)

If you prefer to set up from scratch:

### Step 1: Create Project Structure

```bash
mkdir hello-world-module
cd hello-world-module
npm init -y
```

### Step 2: Install Dependencies

**✅ SDK Packages Available on NPM**

The `@nekazari/sdk` and `@nekazari/ui-kit` packages are **publicly available** on NPM and can be installed directly:

```bash
# Install SDK and UI-Kit from NPM
npm install @nekazari/sdk @nekazari/ui-kit
```

> **Note:** The packages are published under the `@nekazari` organization on NPM. Both packages are licensed under Apache-2.0, allowing you to build proprietary/commercial modules.

#### Option A: Use Template Repository (Recommended)

We provide a template repository with all dependencies pre-configured:

```bash
git clone https://github.com/k8-benetis/nkz-module-template.git my-module
cd my-module
npm install
```

The template includes the SDK packages from NPM, so you can start developing immediately.

#### Option B: Manual Setup with SDK Packages

If you're setting up manually, install the SDK packages from NPM:

```bash
# Install SDK packages from NPM
npm install @nekazari/sdk @nekazari/ui-kit

# Install React and build tools
npm install react@^18.3.1 react-dom@^18.3.1 react-router-dom@^6.26.0
npm install lucide-react

# Install dev dependencies
npm install --save-dev vite@^5.3.1 @vitejs/plugin-react@^4.3.1 typescript@^5.2.2
npm install --save-dev @originjs/vite-plugin-federation@^1.3.0
npm install --save-dev @types/react@^18.3.3 @types/react-dom@^18.3.0
npm install --save-dev tailwindcss@^3.4.4 postcss@^8.4.39 autoprefixer@^10.4.19
```

The SDK packages include TypeScript definitions, so you'll get full type support out of the box.

### Step 3: Create `package.json`

```json
{
  "name": "hello-world-module",
  "version": "1.0.0",
  "description": "A simple Hello World module for NKZ Platform",
  "type": "module",
  "main": "./src/App.tsx",
  "scripts": {
    "dev": "vite --port 5003",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nekazari/sdk": "^1.0.0",
    "@nekazari/ui-kit": "^1.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "lucide-react": "^0.424.0"
  },
  "devDependencies": {
    "@originjs/vite-plugin-federation": "^1.3.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.2.2",
    "vite": "^5.3.1"
  }
}
```

### Step 4: Create `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'hello_world_module',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
      },
      shared: {
        'react': {
          singleton: true,
          requiredVersion: '^18.3.1',
          import: false,  // Use global from host
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
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    rollupOptions: {
      external: ['react', 'react-dom', 'react-router-dom'],
      output: {
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          'react-router-dom': 'ReactRouterDOM',
        },
      },
    },
  },
});
```

### Step 5: Create `tailwind.config.js`

**⚠️ CRITICAL: CSS Isolation Requirements**

External modules **MUST** configure Tailwind to prevent CSS bleeding into the host application. This is a **mandatory requirement** to avoid breaking the host's layout.

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // CRITICAL: Prefix all Tailwind classes to avoid collisions with host
  prefix: 'your-prefix-',  // Replace 'your-prefix-' with your module's prefix (e.g., 'vp-' for vegetation-prime)
  corePlugins: {
    // CRITICAL: Disable preflight to prevent resetting host styles
    // Tailwind's preflight resets margins, paddings, and base styles
    // that break the host's grids and layouts
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Why this is required:**
- **Preflight**: Tailwind's preflight is a CSS reset that normalizes browser defaults. When enabled, it resets margins, paddings, and base styles globally, which breaks the host application's grid layouts and spacing.
- **Prefix**: Adding a prefix ensures your module's Tailwind classes don't collide with the host's classes. For example, if your module uses `bg-blue-500`, it becomes `your-prefix-bg-blue-500`, preventing conflicts.

**Example with module-specific prefix:**
```javascript
// For a "vegetation-prime" module
prefix: 'vp-',  // All classes become: vp-bg-blue-500, vp-text-lg, etc.
```

**If you use plain CSS instead of Tailwind:**
- All CSS must be scoped under a unique root class (e.g., `.your-module-root`)
- Use CSS Modules or styled-components
- Never use global selectors without a prefix

### Step 6: Create `postcss.config.js`

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### Step 7: Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Step 8: Create `src/App.tsx`

```tsx
import React from 'react';
import { useTranslation } from '@nekazari/sdk';
import { Card, Button } from '@nekazari/ui-kit';
import { Sparkles, CheckCircle } from 'lucide-react';

const HelloWorldApp: React.FC = () => {
  const { t } = useTranslation('common');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Sparkles className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">
              Hello World Module
            </h1>
          </div>
          <p className="text-gray-600 text-lg">
            Your first NKZ module is working! 🎉
          </p>
        </div>

        {/* Content Card */}
        <Card padding="lg" className="mb-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Module Successfully Loaded
                </h2>
                <p className="text-gray-600">
                  This module demonstrates the basic structure of an NKZ addon.
                  You can now extend this with your own functionality.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Next Steps:</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Add your custom functionality</li>
                <li>Use the NKZ SDK for API calls</li>
                <li>Use UI-Kit components for consistent styling</li>
                <li>Test your module locally</li>
                <li>Build and package for upload</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Action Button */}
        <div className="text-center">
          <Button variant="primary" size="lg">
            Get Started
          </Button>
        </div>
      </div>
    </div>
  );
};

// CRITICAL: Export as default - required for Module Federation
export default HelloWorldApp;
```

### Step 9: Create `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 10: Create Module Assets

Create an `assets/` folder for your module's images and icons:

```bash
mkdir -p assets
```

**Recommended assets:**
- `icon.png` or `icon.svg` - Module logo/icon (48x48px minimum, 128x128px recommended)
- `screenshot1.png` - Screenshot of your module (1200x675px recommended)
- `screenshot2.png` - Additional screenshots (optional)

**Icon Requirements:**
- **Format**: PNG (with transparency) or SVG
- **Size**: 128x128px (will be displayed at 48x48px in marketplace)
- **Style**: Square, centered, with padding
- **Background**: Transparent or solid color
- **File size**: Under 100KB

**Screenshot Requirements:**
- **Format**: PNG or JPG
- **Size**: 1200x675px (16:9 aspect ratio)
- **Content**: Show your module's main interface
- **File size**: Under 500KB per screenshot

### Step 11: Create `manifest.json`

```json
{
  "id": "hello-world",
  "name": "hello-world",
  "display_name": "Hello World Module",
  "version": "1.0.0",
  "description": "A simple Hello World module demonstrating NKZ Platform module development",
  "short_description": "Your first NKZ module",
  "author": {
    "name": "Your Name",
    "email": "your.email@example.com",
    "organization": "Your Organization (optional)"
  },
  "category": "custom",
  "module_type": "ADDON_FREE",
  "required_plan_type": "basic",
  "pricing_tier": "FREE",
  "route_path": "/hello-world",
  "label": "Hello World",
  "icon": "sparkles",
  "icon_url": "assets/icon.png",
  "required_roles": ["Farmer", "TenantAdmin", "PlatformAdmin"],
  "dependencies": {
    "sdk_version": "^1.0.0",
    "react_version": "^18.3.1",
    "platform_version": "^1.0.0"
  },
  "permissions": {
    "api_access": [],
    "storage_access": false,
    "external_requests": []
  },
  "build_config": {
    "type": "remote",
    "remote_entry_url": "/modules/hello-world/assets/remoteEntry.js",
    "scope": "hello_world_module",
    "exposed_module": "./App"
  },
  "metadata": {
    "icon": "✨",
    "color": "#3B82F6",
    "features": ["Hello World", "Basic Module Structure"],
    "screenshots": ["assets/screenshot1.png"]
  }
}
```

**Important fields for images:**
- `icon_url`: Path to your module icon (relative to ZIP root)
- `metadata.screenshots`: Array of screenshot paths (optional but recommended)

### Step 12: Build Your Module

```bash
npm run build
```

This creates a `dist/` folder with your compiled module.

### Step 13: Package for Upload

```bash
# Create ZIP with required files
zip -r hello-world-v1.0.0.zip \
  manifest.json \
  package.json \
  vite.config.ts \
  tsconfig.json \
  tailwind.config.js \
  postcss.config.js \
  src/ \
  assets/ \
  dist/
```

**Required files in ZIP:**
- ✅ `manifest.json` (required)
- ✅ `src/App.tsx` (required)
- ✅ `package.json` (required)
- ✅ `vite.config.ts` (required)
- ✅ `dist/` folder (after build)
- ✅ `assets/icon.png` (highly recommended - shown in marketplace)

**Optional but recommended:**
- 📸 `assets/screenshot1.png` - Module preview
- 📸 `assets/screenshot2.png` - Additional screenshots

---

## Module Structure

### Required Files

```
your-module/
├── manifest.json          # Module metadata (REQUIRED)
├── package.json           # Dependencies (REQUIRED)
├── vite.config.ts         # Build configuration (REQUIRED)
├── src/
│   ├── App.tsx           # Main component (REQUIRED)
│   └── index.css         # Styles (optional)
├── assets/               # Module assets (HIGHLY RECOMMENDED)
│   ├── icon.png         # Module icon/logo (128x128px)
│   └── screenshot1.png  # Module screenshot (1200x675px)
├── dist/                 # Build output (generated)
└── README.md             # Documentation (recommended)
```

### Optional Files

- `tsconfig.json` - TypeScript configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS configuration
- `src/components/` - Additional components
- `src/utils/` - Utility functions
- `src/types/` - TypeScript type definitions
- `assets/screenshot2.png` - Additional screenshots

---

## Manifest Configuration

The `manifest.json` file is **critical** - it defines your module's metadata and configuration.

### Complete Schema

```json
{
  "id": "your-module-id",
  "name": "your-module-name",
  "display_name": "Your Module Display Name",
  "version": "1.0.0",
  "description": "Detailed description of what your module does",
  "short_description": "Brief one-liner description",
  "author": {
    "name": "Developer Name",
    "email": "developer@example.com",
    "organization": "Company Name (optional)"
  },
  "category": "analytics|weather|iot|robotics|biodiversity|custom",
  "module_type": "ADDON_FREE|ADDON_PAID|ENTERPRISE",
  "required_plan_type": "basic|premium|enterprise",
  "pricing_tier": "FREE|PAID|ENTERPRISE_ONLY",
  "route_path": "/your-module",
  "label": "Your Module",
  "icon": "puzzle|bird|cloud|alert|chart|line-chart|brain|gauge|bot|satellite|sparkles",
  "required_roles": ["Farmer", "TenantAdmin", "PlatformAdmin"],
  "dependencies": {
    "sdk_version": "^1.0.0",
    "react_version": "^18.3.1",
    "platform_version": "^1.0.0"
  },
  "permissions": {
    "api_access": ["/api/entities", "/api/parcels"],
    "storage_access": false,
    "external_requests": ["https://api.example.com"]
  },
  "build_config": {
    "type": "remote",
    "remote_entry_url": "/modules/your-module-id/assets/remoteEntry.js",
    "scope": "your_module_scope",
    "exposed_module": "./App"
  },
  "metadata": {
    "icon": "🐦",
    "color": "#10B981",
    "features": ["Feature 1", "Feature 2"],
    "screenshots": ["screenshot1.png"]
  }
}
```

### Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique module identifier (lowercase, hyphens only) |
| `name` | ✅ | Module name (same as id typically) |
| `display_name` | ✅ | Human-readable name shown in UI |
| `version` | ✅ | Semantic version (e.g., "1.0.0") |
| `description` | ✅ | Full description of module functionality |
| `author.email` | ✅ | Contact email for support |
| `module_type` | ✅ | `ADDON_FREE`, `ADDON_PAID`, or `ENTERPRISE` |
| `route_path` | ✅ | URL path where module is accessible (must start with `/`) |
| `build_config` | ✅ | Module Federation configuration |
| `build_config.scope` | ✅ | Must match `name` in `vite.config.ts` federation config |
| `build_config.exposed_module` | ✅ | Path to exposed component (usually `"./App"`) |
| `icon_url` | ⭐ | Path to module icon image (relative to ZIP root, e.g., `"assets/icon.png"`) |
| `metadata.screenshots` | ⭐ | Array of screenshot paths (e.g., `["assets/screenshot1.png"]`) |

### Module Types

- **`ADDON_FREE`**: Available to all users (basic plan)
- **`ADDON_PAID`**: Requires premium subscription
- **`ENTERPRISE`**: Enterprise-only features

### Icons & Images

#### Icon Field (`icon`)
Available icon names for fallback: `puzzle`, `bird`, `cloud`, `alert`, `chart`, `line-chart`, `brain`, `gauge`, `bot`, `satellite`, `sparkles`, `leaf`, `map`, `layers`

#### Icon URL (`icon_url`)
**Highly recommended** - Path to your custom module icon/logo:
- **Location**: Place in `assets/icon.png` or `assets/icon.svg`
- **Size**: 128x128px (displayed at 48x48px in marketplace)
- **Format**: PNG (with transparency) or SVG
- **Style**: Square, centered, professional design
- **Example**: `"icon_url": "assets/icon.png"`

#### Screenshots (`metadata.screenshots`)
**Recommended** - Array of screenshot paths:
- **Location**: Place in `assets/screenshot1.png`, etc.
- **Size**: 1200x675px (16:9 aspect ratio)
- **Format**: PNG or JPG
- **Content**: Show your module's main interface/features
- **Example**: `"screenshots": ["assets/screenshot1.png", "assets/screenshot2.png"]`

---

## SDK Reference

### Installation

Install the SDK packages from NPM:

```bash
npm install @nekazari/sdk @nekazari/ui-kit
```

Then import in your code:

```typescript
import { NKZClient, useAuth, useTranslation } from '@nekazari/sdk';
import { Button, Card } from '@nekazari/ui-kit';
```

> **Note:** The packages are published under the `@nekazari` organization on NPM and are licensed under Apache-2.0, allowing you to build proprietary/commercial modules.

### API Client

```typescript
import { NKZClient } from '@nekazari/sdk';
import { useAuth } from '@nekazari/sdk';

const MyComponent: React.FC = () => {
  const { getToken, tenantId } = useAuth();
  
  const client = new NKZClient({
    baseUrl: '/api',
    getToken: getToken,
    getTenantId: () => tenantId,
  });

  // GET request
  const entities = await client.get('/entities');

  // POST request
  const result = await client.post('/entities', {
    type: 'Sensor',
    name: 'Temperature Sensor',
  });

  // PUT, PATCH, DELETE also available
  await client.put('/entities/123', { name: 'Updated' });
  await client.patch('/entities/123', { status: 'active' });
  await client.delete('/entities/123');
};
```

**Note**: `NekazariClient` is also available as an alias for backward compatibility, but `NKZClient` is the recommended name. The alias will be deprecated in SDK v3.0.0.

### Available API Endpoints

Modules can access the following endpoints through the `NKZClient`:

**Entity Management** (FIWARE NGSI-LD):
- `GET /api/entities` - List all entities for the tenant
- `GET /api/entities/{id}` - Get specific entity
- `POST /api/entities` - Create new entity
- `PUT /api/entities/{id}` - Update entity
- `PATCH /api/entities/{id}/attrs` - Update entity attributes
- `DELETE /api/entities/{id}` - Delete entity

**Parcel Management**:
- `GET /api/parcels` - List all parcels for the tenant
- `GET /api/parcels/{id}` - Get specific parcel
- `POST /api/parcels` - Create new parcel
- `PUT /api/parcels/{id}` - Update parcel
- `DELETE /api/parcels/{id}` - Delete parcel

**Sensor Management**:
- `GET /api/sensors` - List registered sensors
- `POST /api/sensors/register` - Register new sensor
- `GET /api/sensors/{id}` - Get sensor details

**Module Management**:
- `GET /api/modules/me` - Get available modules for current tenant
- `GET /api/modules/{id}/can-install` - Check if module can be installed

**For complete API documentation**, including authentication, data models, and device-specific guides, see: [API Integration Guide](../api/README.md)

### Authentication

```typescript
import { useAuth } from '@nekazari/sdk';

const MyComponent: React.FC = () => {
  const {
    user,           // Current user object
    token,          // JWT token
    tenantId,       // Current tenant ID
    isAuthenticated, // Boolean
    hasRole,        // (role: string) => boolean
    hasAnyRole,     // (roles: string[]) => boolean
    getToken,       // () => string | undefined
  } = useAuth();

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  if (hasRole('PlatformAdmin')) {
    // Admin-only content
  }
};
```

### Internationalization

```typescript
import { useTranslation } from '@nekazari/sdk';

const MyComponent: React.FC = () => {
  const { t, i18n } = useTranslation('common');

  return (
    <div>
      <h1>{t('welcome')}</h1>
      <p>{t('description', { name: user.name })}</p>
      <p>Current language: {i18n.language}</p>
    </div>
  );
};
```

---

## UI Components

### Installation

UI components are available from `@nekazari/ui-kit`:

```typescript
import { Button, Card, Input, Select, Modal } from '@nekazari/ui-kit';
```

### Available Components

#### Button

```typescript
import { Button } from '@nekazari/ui-kit';

<Button variant="primary" size="md" onClick={handleClick}>
  Click Me
</Button>

// Variants: primary, secondary, ghost, danger
// Sizes: sm, md, lg
```

#### Card

```typescript
import { Card } from '@nekazari/ui-kit';

<Card padding="md" className="custom-class">
  <h2>Card Title</h2>
  <p>Card content</p>
</Card>

// Padding: sm, md, lg
```

#### Input

```typescript
import { Input } from '@nekazari/ui-kit';

<Input
  type="text"
  placeholder="Enter text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

### Icons (Lucide React)

```typescript
import { CheckCircle, AlertTriangle, Cloud, Bird } from 'lucide-react';

<CheckCircle className="w-5 h-5 text-green-500" />
```

---

## Build Configuration

### Vite Configuration Requirements

Your `vite.config.ts` **must**:

1. **Use Module Federation plugin**
2. **Externalize React** (use globals from host)
3. **Match scope name** with `manifest.json`

```typescript
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    federation({
      name: 'your_module_scope',  // Must match manifest.build_config.scope
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',  // Must match manifest.build_config.exposed_module
      },
      shared: {
        'react': {
          singleton: true,
          requiredVersion: '^18.3.1',
          import: false,  // CRITICAL: Use global from host
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
  build: {
    rollupOptions: {
      external: ['react', 'react-dom', 'react-router-dom'],
      output: {
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          'react-router-dom': 'ReactRouterDOM',
        },
      },
    },
  },
});
```

### Build Output

After `npm run build`, your `dist/` folder should contain:

```
dist/
├── assets/
│   ├── remoteEntry.js      # Module Federation entry (REQUIRED)
│   ├── index-*.js          # Your module code
│   └── index-*.css         # Styles (if any)
└── index.html              # (not used, can be ignored)
```

---

## Module Assets & Branding

### Icon/Logo Design Guidelines

Your module icon is the **first impression** users have of your module in the marketplace. Follow these guidelines:

#### Technical Requirements

- **Dimensions**: 128x128px (minimum), square format
- **Format**: PNG (with transparency) or SVG
- **File size**: Under 100KB
- **Background**: Transparent or solid color
- **Padding**: Leave 10-15px padding around edges

#### Design Best Practices

✅ **DO:**
- Use simple, recognizable symbols
- Ensure icon is readable at small sizes (48x48px)
- Use consistent color scheme with your module
- Match Nekazari's design language (agricultural, modern)
- Test icon on both light and dark backgrounds

❌ **DON'T:**
- Use text in the icon (it won't be readable)
- Use complex details (they'll be lost at small sizes)
- Use copyrighted images without permission
- Use low-resolution images

#### Example Icon Structure

```
assets/
└── icon.png  (128x128px, transparent background)
```

**Reference**: Look at existing modules in the marketplace for inspiration.

### Screenshot Guidelines

Screenshots help users understand what your module does before installing.

#### Technical Requirements

- **Dimensions**: 1200x675px (16:9 aspect ratio)
- **Format**: PNG (preferred) or JPG
- **File size**: Under 500KB per screenshot
- **Quantity**: 1-3 screenshots recommended

#### Content Best Practices

✅ **DO:**
- Show the main interface/features
- Use real data (or realistic mock data)
- Highlight key functionality
- Keep UI clean and uncluttered
- Show the module in context

❌ **DON'T:**
- Include sensitive or personal data
- Show error states (unless demonstrating error handling)
- Use placeholder text like "Lorem ipsum"
- Include browser chrome or OS elements

#### Example Screenshot Structure

```
assets/
├── screenshot1.png  (Main interface)
├── screenshot2.png  (Key feature)
└── screenshot3.png  (Additional feature)
```

### How Your Module Appears in the Marketplace

When your module is published, it will appear in the marketplace with:

#### Visual Layout

```
┌─────────────────────────────────────────────────────┐
│  ┌──────┐                                           │
│  │ Icon │  Module Display Name          [✓]        │
│  │48x48 │  v1.0.0  [FREE] badge                    │
│  └──────┘                                           │
│                                                     │
│  Description of your module functionality.         │
│  This text is truncated to 3 lines maximum...      │
│                                                     │
│  [Category Tag]                                     │
│                                                     │
│  ─────────────────────────────────────────────     │
│  Route: /your-module-path                          │
│  [Activate] button                                  │
└─────────────────────────────────────────────────────┘
```

#### Component Details

1. **Icon/Logo** (48x48px displayed, 128x128px source)
   - Your custom icon from `icon_url` field
   - Rounded corners with border
   - Falls back to Lucide icon (Package icon) if not provided
   - Shown in top-left of card

2. **Module Information**:
   - **Display Name**: From `display_name` field (bold, large)
   - **Version**: From `version` field (small badge)
   - **Type Badge**: Color-coded by `module_type`:
     - 🟢 **FREE** (green) - `ADDON_FREE`
     - 🟡 **PAID** (yellow) - `ADDON_PAID`
     - 🟣 **ENTERPRISE** (purple) - `ENTERPRISE`
   - **Status Indicator**: Green checkmark if installed and enabled

3. **Description**:
   - From `description` field
   - Truncated to 3 lines with ellipsis
   - Gray text color

4. **Category Tag**:
   - From `category` field
   - Small gray badge

5. **Footer**:
   - Route path (from `route_path`)
   - Action button (Activate/Deactivate)

#### Visual States

- **Available (Not Installed)**: 
  - Full color icon
  - "Activate" button enabled
  - Normal opacity

- **Installed & Enabled**:
  - Full color icon
  - Green checkmark indicator
  - "Deactivate" button enabled

- **Inactive (Admin View)**:
  - Grayscale icon (50% opacity)
  - Yellow "Inactive" badge
  - Disabled state

#### Grid Layout

Modules are displayed in a responsive grid:
- **Desktop**: 3 columns
- **Tablet**: 2 columns
- **Mobile**: 1 column

Each card has hover effects (shadow elevation) for better UX.

#### Sidebar Navigation

When your module is **activated**, it appears in the left sidebar under the "ADDONS" section:

```
┌─────────────────────┐
│ Dashboard           │
│ Parcels             │
│ Entities            │
│ Alerts              │
│                     │
│ ADDONS              │
│ ─────────────────   │
│ 🐦 Ornito Radar     │
│ ✨ Hello World      │ ← Your module
│ 🌤️ Weather          │
│                     │
│ Settings            │
│ Modules             │
└─────────────────────┘
```

**Sidebar Display:**
- **Icon**: Uses `metadata.icon` emoji (if provided) or Lucide icon from `icon` field
- **Label**: From `label` field (or `display_name` as fallback)
- **Active State**: Green highlight when module route is active
- **Section**: Grouped under "ADDONS" header

**Icon Priority:**
1. `metadata.icon` emoji (if 1-2 characters) → Displayed as emoji
2. Lucide icon from `icon` field → Displayed as icon component
3. Default "Puzzle" icon → Fallback

**Example manifest.json for sidebar:**
```json
{
  "icon": "sparkles",
  "label": "Hello World",
  "metadata": {
    "icon": "✨"
  }
}
```

### Asset Paths in manifest.json

When referencing assets in your `manifest.json`, use **relative paths** from the ZIP root:

```json
{
  "icon_url": "assets/icon.png",
  "metadata": {
    "screenshots": [
      "assets/screenshot1.png",
      "assets/screenshot2.png"
    ]
  }
}
```

**Important**: After upload, assets are served from the module's public URL:
- Icon: `/modules/{module-id}/assets/icon.png`
- Screenshots: `/modules/{module-id}/assets/screenshot1.png`

---

## Upload & Validation Process

### Step 1: Prepare Your Module

1. **Create assets**: Design your icon and take screenshots
2. **Build your module**: `npm run build`
3. **Test locally**: Verify it works in development
4. **Create ZIP**: Include all required files and assets

```bash
zip -r my-module-v1.0.0.zip \
  manifest.json \
  package.json \
  vite.config.ts \
  tsconfig.json \
  tailwind.config.js \
  postcss.config.js \
  src/ \
  assets/ \
  dist/
```

**Verify your ZIP contains:**
- ✅ `manifest.json` with `icon_url` pointing to your icon
- ✅ `assets/icon.png` (or `.svg`)
- ✅ `assets/screenshot1.png` (optional but recommended)
- ✅ `dist/assets/remoteEntry.js` (from build)

### Step 2: Upload to Nekazari

**Endpoint**: `POST /api/modules/upload`

**Authentication**: Requires `PlatformAdmin` or `ModuleReviewer` role

**Request**:
```bash
curl -X POST https://nkz.robotika.cloud/api/modules/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@my-module-v1.0.0.zip"
```

**Response**:
```json
{
  "upload_id": "uuid-upload-id",
  "status": "validating",
  "module_id": "my-module-id",
  "version": "1.0.0",
  "message": "Upload received, validation in progress"
}
```

### Step 3: Check Validation Status

**Endpoint**: `GET /api/modules/upload/{upload_id}/status`

**Response**:
```json
{
  "upload_id": "uuid-upload-id",
  "status": "validating|validated_waiting_review|rejected|published",
  "module_id": "my-module-id",
  "version": "1.0.0",
  "validation_results": {
    "schema": { "valid": true, "errors": [] },
    "build": { "valid": true, "errors": [] }
  },
  "build_log": "...",
  "rejection_reason": null
}
```

### Step 4: Validation Process

The system automatically:

1. ✅ **Schema Validation**: Validates `manifest.json` structure
2. ✅ **Build Test**: Runs `npm install` and `npm run build` in isolated environment
3. ✅ **Status Update**: Sets status to `validated_waiting_review` if successful

### Step 5: Manual Review & Publication

An NKZ administrator will:

1. Review your module
2. Test functionality
3. Approve or request changes

**If approved**, the module is published and available in the NKZ marketplace.

---

## Best Practices

### ✅ DO

- **Export default component**: Your `App.tsx` must export default
- **Use SDK for API calls**: Always use `NKZClient` from SDK
- **Use UI-Kit components**: Maintain visual consistency
- **Handle errors gracefully**: Show user-friendly error messages
- **Support i18n**: Use `useTranslation` for all user-facing text
- **Test locally first**: Verify your module works before uploading
- **Follow semantic versioning**: Use proper version numbers (1.0.0, 1.1.0, etc.)
- **Document your module**: Include README with usage instructions
- **Include professional icon**: Create a 128x128px icon for marketplace visibility
- **Add screenshots**: Help users understand your module before installing
- **Optimize images**: Compress PNGs/JPGs to reduce file size

### ❌ DON'T

- **Don't wrap with providers**: Host provides AuthProvider, I18nProvider, Layout
- **Don't bundle React**: React is shared from host (externalize it)
- **Don't create routing**: Your module is a single-page component
- **Don't use eval()**: Security risk - will be rejected
- **Don't access localStorage directly**: Use SDK methods if needed
- **Don't make unauthorized API calls**: Only use declared endpoints
- **Don't include sensitive data**: No API keys, secrets, or credentials
- **Don't use deprecated APIs**: Check SDK version compatibility

### Security Guidelines

- ✅ All user inputs must be sanitized
- ✅ No `eval()` or `Function()` constructors
- ✅ No direct DOM manipulation (use React)
- ✅ Declare all external API endpoints in `manifest.json`
- ✅ Use HTTPS for external requests
- ✅ No hardcoded credentials

### Performance Guidelines

- ✅ Keep bundle size under 5MB
- ✅ Use lazy loading for heavy components
- ✅ Optimize images (use WebP, compress)
- ✅ Minimize API calls (batch when possible)
- ✅ Use React.memo for expensive components
- ✅ Compress icon to under 100KB
- ✅ Compress screenshots to under 500KB each

### Branding Guidelines

- ✅ Use consistent colors across icon and module UI
- ✅ Match Nekazari's agricultural theme
- ✅ Ensure icon is recognizable at small sizes
- ✅ Test icon visibility on light/dark backgrounds
- ✅ Use professional, polished design

---

## Examples & Reference

### Example: API Integration

```typescript
import React, { useState, useEffect } from 'react';
import { NKZClient, useAuth } from '@nekazari/sdk';
import { Card, Button } from '@nekazari/ui-kit';

const MyModule: React.FC = () => {
  const { getToken, tenantId } = useAuth();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const client = new NKZClient({
        baseUrl: '/api',
        getToken: getToken,
        getTenantId: () => tenantId,
      });

      try {
        const data = await client.get('/entities');
        setEntities(data);
      } catch (error) {
        console.error('Failed to fetch entities:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [getToken, tenantId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-6">
      <h1>My Module</h1>
      <Card padding="md">
        {entities.map((entity) => (
          <div key={entity.id}>{entity.name}</div>
        ))}
      </Card>
    </div>
  );
};

export default MyModule;
```

### Example: Error Handling

```typescript
import React, { useState } from 'react';
import { NKZClient, useAuth } from '@nekazari/sdk';
import { Card, Button } from '@nekazari/ui-kit';
import { AlertTriangle } from 'lucide-react';

const MyModule: React.FC = () => {
  const { getToken, tenantId } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    setError(null);
    setLoading(true);

    try {
      const client = new NKZClient({
        baseUrl: '/api',
        getToken: getToken,
        getTenantId: () => tenantId,
      });

      await client.post('/my-endpoint', { data: 'value' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      <Button onClick={handleAction} disabled={loading}>
        {loading ? 'Processing...' : 'Submit'}
      </Button>
    </div>
  );
};

export default MyModule;
```

### Reference Implementation

See the **Ornito Radar** module for a complete reference:
- Location: `apps/ornito-radar/`
- Features: API integration, UI components, error handling
- Structure: Complete module with best practices

---

## Troubleshooting

### Build Fails

**Error**: `Module not found: Can't resolve '@nekazari/sdk'`

**Solution**: 
- Install the SDK packages from NPM: `npm install @nekazari/sdk @nekazari/ui-kit`
- If using the template repository, ensure `npm install` completed successfully
- The SDK packages are publicly available on NPM under the `@nekazari` organization
- Verify your `package.json` includes the dependencies:
  ```json
  {
    "dependencies": {
      "@nekazari/sdk": "^1.0.0",
      "@nekazari/ui-kit": "^1.0.0"
    }
  }
  ```

**Error**: `React is not defined`

**Solution**: Ensure React is externalized in `vite.config.ts` and the host provides it globally.

### Development Environment Issues

#### Problem: Module runs standalone but lacks host context

When developing your module in isolation (`npm run dev` on `localhost:5003`), you won't have:
- Authentication context (no user, no token)
- Theme/styling from host
- API access (CORS issues)

**Solutions**:

1. **Use API Token for Testing**:
   ```typescript
   // In your development code, manually set token for testing
   const client = new NKZClient({
     baseUrl: 'https://nkz.robotika.cloud/api',
     getToken: () => 'YOUR_STAGING_TOKEN_HERE', // Get from browser DevTools
     getTenantId: () => 'your-tenant-id',
   });
   ```
   
   **How to get token**:
   - Log in to staging environment
   - Open browser DevTools → Application → Local Storage
   - Find `keycloak-token` or check Network tab for Authorization header

2. **Configure Vite Proxy** (for API calls):
   
   Add to `vite.config.ts`:
   ```typescript
   export default defineConfig({
     // ... existing config
     server: {
       port: 5003,
       proxy: {
         '/api': {
           target: 'https://nkz.robotika.cloud',
           changeOrigin: true,
           secure: true,
           configure: (proxy, _options) => {
             proxy.on('proxyReq', (proxyReq, req, _res) => {
               // Add your token here for development
               proxyReq.setHeader('Authorization', 'Bearer YOUR_TOKEN');
               proxyReq.setHeader('X-Tenant-ID', 'your-tenant-id');
             });
           },
         },
       },
     },
   });
   ```

3. **Mock SDK for Development**:
   
   Create `src/mocks/sdk.ts`:
   ```typescript
   export const useAuth = () => ({
     user: { name: 'Test User', email: 'test@example.com' },
     token: 'mock-token',
     tenantId: 'test-tenant',
     isAuthenticated: true,
     hasRole: () => true,
     getToken: () => 'mock-token',
   });
   
   export const useTranslation = () => ({
     t: (key: string) => key,
     i18n: { language: 'es' },
   });
   
   export class NekazariClient {
     async get() { return []; }
     async post() { return {}; }
   }
   ```
   
   Then in your component, conditionally import:
   ```typescript
   // In development
   import { useAuth } from '../mocks/sdk';
   // In production (when loaded by host)
   // import { useAuth } from '@nekazari/sdk';
   ```

### CORS Issues

**Error**: `Access to fetch at 'https://nkz.robotika.cloud/api/...' from origin 'http://localhost:5003' has been blocked by CORS policy`

**Solution**: 

1. **Use Vite Proxy** (recommended for development):
   ```typescript
   // vite.config.ts
   server: {
     proxy: {
       '/api': {
         target: 'https://nkz.robotika.cloud',
         changeOrigin: true,
         secure: true,
       },
     },
   },
   ```
   
   Then use relative URLs in your code:
   ```typescript
   const client = new NekazariClient({
     baseUrl: '/api', // Relative - will use proxy
   });
   ```

2. **Contact NKZ Team**: Request CORS configuration for your development domain in staging environment.

3. **Use Browser Extension**: Temporarily disable CORS for development (not recommended for production testing).

### Module Doesn't Load

**Check**:
1. ✅ `manifest.json` is valid JSON
2. ✅ `build_config.scope` matches `vite.config.ts` federation name
3. ✅ `build_config.exposed_module` matches exposed path
4. ✅ `remoteEntry.js` exists in `dist/assets/`
5. ✅ Component exports default

### Validation Fails

**Common Issues**:
- Invalid `manifest.json` schema
- Missing required files (`src/App.tsx`, `package.json`)
- Build errors (check build logs)
- Security violations (eval, Function constructor)

---

## Support & Resources

### Template Repository

**🚀 Quick Start Template**: [nkz-module-template](https://github.com/k8-benetis/nkz-module-template)

Clone and start developing in minutes:
```bash
git clone https://github.com/k8-benetis/nkz-module-template.git my-module
cd my-module && npm install
```

### Documentation
- **SDK Documentation**: Check `packages/sdk/README.md`
- **UI-Kit Documentation**: Check `packages/ui-kit/README.md`
- **Platform Architecture**: See `docs/ARCHITECTURE.md`

### Contact
- **Developer Portal**: [Coming Soon]
- **Email**: developers@nekazari.com
- **Issues**: Report via GitHub (if applicable)

### Community
- Join our developer community for discussions and support

### Getting SDK Packages

The `@nekazari/sdk` and `@nekazari/ui-kit` packages are **publicly available** on NPM:

```bash
npm install @nekazari/sdk @nekazari/ui-kit
```

**Package Information:**
- **NPM Organization**: `@nekazari`
- **License**: Apache-2.0 (allows proprietary/commercial modules)
- **Version**: 1.0.0 (current)
- **NPM Links**:
  - SDK: https://www.npmjs.com/package/@nekazari/sdk
  - UI-Kit: https://www.npmjs.com/package/@nekazari/ui-kit

**Options:**
1. **Install from NPM** (recommended) - `npm install @nekazari/sdk @nekazari/ui-kit`
2. **Use Template Repository** - Includes SDK packages pre-configured
3. **Manual Setup** - See Step 2 in Quick Start guide

> **Note:** The packages are published under the `@nekazari` organization and are licensed under Apache-2.0, allowing you to build proprietary/commercial modules without open-sourcing your code.

---

## Changelog

### Version 2.0.0 (December 2025)
- ✅ Added ZIP upload system
- ✅ Added manifest.json validation
- ✅ Added automated build testing
- ✅ Updated SDK reference
- ✅ Added complete Hello World example

### Version 1.0.0 (Initial)
- Initial developer guide

---

**Happy Coding! 🚀**

*This guide is maintained by the NKZ Platform (Nekazari) team. For updates and corrections, please contact the development team.*

---

## Branding Reference

- **Official Platform Name**: Nekazari
- **NPM Organization**: `@nekazari`
- **Package Names**: `@nekazari/sdk`, `@nekazari/ui-kit`
- **License**: Apache-2.0 (SDK/UI-Kit), AGPL-3.0 (Core Platform)
- **API Domain**: `nkz.robotika.cloud`
- **User-Facing Domain**: `nekazari.robotika.cloud`
