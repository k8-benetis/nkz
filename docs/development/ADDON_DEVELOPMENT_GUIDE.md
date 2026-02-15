# Nekazari Addon Development Guide

This guide explains how to create addon modules for the Nekazari platform.

## Overview

Nekazari uses a **Modular Monolith** architecture with a curated marketplace:

1. **Internal Addons** - Developed by Nekazari team, bundled with the host
2. **Third-Party Addons** - Developed externally, validated and deployed by Nekazari

### Marketplace Model

```
Developer creates addon → Submits to Nekazari → Nekazari validates → Nekazari deploys → Users can activate
```

**Important**: Third-party developers do NOT have direct access to deploy. All addons go through Nekazari's validation process before being published to the marketplace.

### Module Loading Architecture

**Note**: The host application uses **dynamic ES module imports** to load remote modules. While modules are built with Module Federation (`@originjs/vite-plugin-federation`), the host loads them via dynamic `import()` statements rather than Module Federation's runtime. This is transparent to module developers - your modules built with the template will work correctly.

## Quick Start: Creating a Local Addon

### 1. Create the Addon Structure

```bash
# Create addon directory
mkdir -p apps/my-addon/src

# Initialize package
cd apps/my-addon
```

Create `package.json`:

```json
{
  "name": "@nekazari/my-addon",
  "version": "1.0.0",
  "description": "My Addon Description",
  "type": "module",
  "private": true,
  "main": "./src/App.tsx",
  "exports": {
    ".": "./src/App.tsx"
  },
  "dependencies": {
    "@nekazari/sdk": "workspace:*",
    "@nekazari/ui-kit": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.424.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "typescript": "^5.2.2"
  }
}
```

### 2. Create the Main Component

Create `src/App.tsx`:

```tsx
import React from 'react';
import { useTranslation } from '@nekazari/sdk';
import { Card, Button } from '@nekazari/ui-kit';

// IMPORTANT: Do NOT wrap with providers!
// The host already provides: AuthProvider, I18nProvider, Layout

const MyAddonApp: React.FC = () => {
  const { t } = useTranslation('common');

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          My Addon
        </h1>
        <Card padding="lg">
          <p>Your addon content here</p>
        </Card>
      </div>
    </div>
  );
};

// Export as default - required!
export default MyAddonApp;
```

### 3. Register in Host

Add dependency to `apps/host/package.json`:

```json
{
  "dependencies": {
    "@nekazari/my-addon": "workspace:*"
  }
}
```

Add to `apps/host/src/config/localAddons.ts`:

```typescript
export const localAddonRegistry: Record<string, LocalAddonEntry> = {
  // ... existing addons
  'my-addon': {
    component: lazy(() => import('@nekazari/my-addon')),
  },
};
```

### 4. Register in Database

Create SQL migration or run directly:

```sql
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, route_path, label, module_type,
    is_active, required_roles, metadata
) VALUES (
    'my-addon',
    'my-addon', 
    'My Addon',
    'Description of my addon',
    true,  -- LOCAL module
    '/my-addon',
    'My Addon',
    'ADDON_FREE',
    true,
    ARRAY['Farmer', 'TenantAdmin', 'PlatformAdmin'],
    '{"icon": "🔧", "color": "#3B82F6"}'::jsonb
);
```

### 5. Install & Build

```bash
# From repository root
pnpm install
pnpm build
```

---

## Creating a Third-Party Addon (For External Developers)

If you're an external developer wanting to create an addon for Nekazari:

### 1. Development Process

```bash
# Clone the template or create from scratch
mkdir my-addon
cd my-addon
npm init -y
npm install react react-dom @nekazari/sdk @nekazari/ui-kit
```

### 2. Create Your Component

Follow the same structure as local addons (see above). Your `App.tsx` must:
- Export a default React component
- Use `@nekazari/sdk` for API calls
- Use `@nekazari/ui-kit` for consistent UI
- NOT include its own providers (Auth, I18n, etc.)

### 3. Build Your Addon

```bash
npm run build
```

### 4. Submit to Nekazari

Package and submit your addon for review:

1. **Code Review**: Send your source code repository
2. **Build Artifacts**: Include your `dist/` folder
3. **Documentation**: Describe what your addon does
4. **Test Cases**: Include testing instructions

**Contact**: Submit via the Nekazari developer portal or contact the team directly.

### 5. Nekazari Validation Process

Our team will:
- ✅ Review code for security vulnerabilities
- ✅ Test compatibility with current platform version
- ✅ Verify SDK/UI-Kit usage
- ✅ Check performance impact
- ✅ Validate user experience

### 6. Publication

Once approved, Nekazari will:
- Deploy your addon to the modules-server
- Register it in the marketplace database
- Make it available for users to activate

**Note**: You will be credited as the author in the marketplace.

---

## SDK Reference

### Available from `@nekazari/sdk`

```typescript
// API Client (recommended: use NKZClient)
import { NKZClient } from '@nekazari/sdk';
const client = new NKZClient({ baseUrl: '/api' });
await client.get('/entities');

// Backward compatibility: NekazariClient is an alias (will be deprecated in v3.0.0)
import { NekazariClient } from '@nekazari/sdk';
const legacyClient = new NekazariClient({ baseUrl: '/api' });

// Authentication
import { useAuth } from '@nekazari/sdk';
const { user, token, tenant } = useAuth();

// Internationalization
import { useTranslation } from '@nekazari/sdk';
const { t } = useTranslation('common');
```

### Available from `@nekazari/ui-kit`

```typescript
import { 
  Button,
  Card,
  // ... other components
} from '@nekazari/ui-kit';
```

---

## Module Types

| Type | is_local | Description |
|------|----------|-------------|
| `CORE` | true | Core platform features (not removable) |
| `ADDON_FREE` | true/false | Free addons for all tenants |
| `ADDON_PAID` | true/false | Paid addons (requires subscription) |
| `ENTERPRISE` | true/false | Enterprise-only features |

---

## Best Practices

### DO:
- ✅ Export a single default component
- ✅ Use `@nekazari/sdk` for API calls
- ✅ Use `@nekazari/ui-kit` for UI consistency
- ✅ Support i18n with `useTranslation`
- ✅ Handle loading and error states
- ✅ Use Tailwind CSS with **preflight disabled** and **prefix configured**
- ✅ Scope all CSS to prevent affecting host layout

### DON'T:
- ❌ Wrap with AuthProvider (host provides it)
- ❌ Wrap with I18nProvider (host provides it)
- ❌ Create your own routing (use single-page component)
- ❌ Bundle React separately (share from host)
- ❌ Enable Tailwind preflight (breaks host layout)
- ❌ Use global CSS without scoping (breaks host layout)

---

## Directory Structure Reference

```
nekazari/
├── apps/
│   ├── host/                    # Main frontend
│   │   └── src/
│   │       └── config/
│   │           └── localAddons.ts  # Register local addons here
│   └── ornito-radar/            # Example local addon
│       ├── package.json
│       └── src/
│           └── App.tsx
├── packages/
│   ├── sdk/                     # @nekazari/sdk
│   └── ui-kit/                  # @nekazari/ui-kit
└── config/
    └── timescaledb/
        └── migrations/          # Database migrations
```

---

## Deployment (Nekazari Team Only)

### Internal Addons (Bundled)

For addons developed by Nekazari team:

1. Create addon in `apps/` directory
2. Add workspace dependency to host
3. Register in `localAddons.ts`
4. Add database migration
5. Build and deploy host

### Third-Party Addons (Validated)

For addons submitted by external developers:

1. Receive and validate submission
2. Build with Module Federation (if needed)
3. Deploy to modules-server:
   ```bash
   kubectl cp dist/assets/. nekazari/$MODULES_POD:/usr/share/nginx/html/modules/<addon-name>/assets/
   ```
4. Register in database:
   ```sql
   INSERT INTO marketplace_modules (
       id, name, display_name, description,
       is_local, remote_entry_url, scope, exposed_module,
       route_path, label, module_type, author,
       is_active, required_roles
   ) VALUES (...);
   ```
5. Test in staging environment
6. Announce availability to users

---

## Support

For questions about addon development:
- Review `apps/ornito-radar/` as reference implementation
- Check existing SDK documentation in `packages/sdk/`
- Contact the Nekazari team

---

*Last updated: December 2025*
