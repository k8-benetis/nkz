# Module Development Best Practices - Nekazari Platform

## Overview

This guide establishes best practices for developing external modules for the Nekazari Platform, following FIWARE principles, security standards, and modern development practices.

## Architecture Principles

### 1. Module Independence

**✅ DO:**
- Create isolated database tables with module-specific names (e.g., `vegetation_jobs`, `weather_observations`)
- Use module-specific endpoints (e.g., `/api/vegetation/*` instead of `/api/ndvi/*`)
- Include all migrations in the module directory
- Design for clean installation/uninstallation

**❌ DON'T:**
- Share tables with other modules or core
- Modify core migrations
- Create dependencies on other modules
- Hardcode tenant-specific logic

### 2. Database Schema Design

#### Table Naming Convention
```sql
-- ✅ GOOD: Module-specific prefix
CREATE TABLE vegetation_jobs (...);
CREATE TABLE vegetation_results (...);

-- ❌ BAD: Generic names that could conflict
CREATE TABLE jobs (...);
CREATE TABLE results (...);
```

#### Required Columns for All Module Tables
```sql
CREATE TABLE your_module_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,  -- REQUIRED for multi-tenancy
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Your module-specific columns
    ...
);
```

#### Row Level Security (RLS)
```sql
-- ✅ ALWAYS enable RLS
ALTER TABLE your_module_entities ENABLE ROW LEVEL SECURITY;

-- ✅ ALWAYS create tenant isolation policy
CREATE POLICY your_module_entities_policy ON your_module_entities
    USING (
        tenant_id = current_setting('app.current_tenant', true) OR
        current_setting('app.current_tenant', true) = 'platform' OR
        current_setting('app.current_tenant', true) = 'platform_admin'
    )
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true) OR
        current_setting('app.current_tenant', true) = 'platform' OR
        current_setting('app.current_tenant', true) = 'platform_admin'
    );
```

### 3. API Endpoint Design

#### Endpoint Naming
```python
# ✅ GOOD: Module-specific prefix
@app.route('/api/vegetation/jobs', methods=['POST'])
@app.route('/api/vegetation/results', methods=['GET'])

# ❌ BAD: Generic names
@app.route('/api/jobs', methods=['POST'])
```

#### Authentication & Authorization
```python
# ✅ ALWAYS use require_auth decorator
from common.auth_middleware import require_auth

@app.route('/api/your-module/endpoint', methods=['POST'])
@require_auth(require_hmac=False)  # False for frontend, True for API keys
def your_endpoint():
    # Access tenant from Flask g object
    tenant_id = g.tenant
    
    # Always set tenant context for RLS
    with get_db_connection_with_tenant(tenant_id) as conn:
        # Your database operations
        ...
```

#### Error Handling
```python
# ✅ GOOD: Proper error handling with logging
try:
    # Your operation
    result = perform_operation()
    return jsonify({'success': True, 'data': result}), 200
except ValueError as e:
    logger.warning(f"Validation error: {e}")
    return jsonify({'error': str(e)}), 400
except Exception as e:
    logger.error(f"Unexpected error: {e}", exc_info=True)
    return jsonify({'error': 'Internal server error'}), 500
```

### 4. Frontend Integration

#### Module Structure
```
your-module/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   ├── types.ts
│   │   └── index.ts
│   ├── vite.config.ts
│   ├── tailwind.config.js  # CRITICAL: Must disable preflight
│   └── package.json
├── backend/
│   ├── migrations/
│   │   ├── 001_create_module_tables.sql
│   │   └── rollback/
│   │       └── 001_drop_module_tables.sql
│   └── api/
│       └── your_module_api.py
├── module.json
└── README.md
```

#### CSS Isolation Requirements (MANDATORY)

**⚠️ CRITICAL: External modules MUST prevent CSS bleeding into the host application.**

This is a **mandatory requirement** to avoid breaking the host's layout. Modules that inject global CSS will be rejected during validation.

**If using Tailwind CSS:**

```javascript
// tailwind.config.js - REQUIRED configuration
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // CRITICAL: Prefix all classes to avoid collisions
  prefix: 'your-module-prefix-',  // e.g., 'vp-' for vegetation-prime
  corePlugins: {
    // CRITICAL: Disable preflight to prevent resetting host styles
    // Preflight resets margins, paddings, and base styles globally
    // which breaks the host's grid layouts
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
- **Prefix**: Adding a prefix ensures your module's Tailwind classes don't collide with the host's classes.

**If using plain CSS:**
- All CSS must be scoped under a unique root class (e.g., `.your-module-root`)
- Use CSS Modules or styled-components
- Never use global selectors without a prefix

**Validation:**
- Modules that break the host layout will be rejected
- Test your module in the host application before submission
- Ensure grids, spacing, and layouts remain intact

#### Module Federation Architecture: Self-Contained Modules

**⚠️ CRITICAL: External modules must be self-contained (autonomous).**

The Nekazari Platform uses a **self-contained microfrontend architecture** for external modules, similar to industry standards used by companies like Netflix and Spotify. This ensures:

1. **Long-term compatibility**: Core platform updates won't break external modules
2. **Version independence**: Modules can be developed and deployed independently
3. **Robustness**: No dependency on host runtime configuration
4. **Professional ecosystem**: Partners can develop modules without tight coupling to platform internals

**✅ DO (External Modules):**
```typescript
// vite.config.ts - External modules MUST share React as singleton
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'your_module',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
        // ... other exports
      },
      shared: {
        // ✅ CRITICAL: React MUST be shared as singleton with import: false
        // This is a technical requirement: React hooks require the same React instance
        // when module renders inside host's React tree
        // import: false tells Module Federation to use window globals from host
        'react': {
          singleton: true,
          requiredVersion: '^18.3.1',
          import: false,  // Use global from host (window.React)
          shareScope: 'default',
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.3.1',
          import: false,  // Use global from host (window.ReactDOM)
          shareScope: 'default',
        },
        'react-router-dom': {
          singleton: true,
          requiredVersion: '^6.26.0',
          import: false,  // Use global from host (window.ReactRouterDOM)
          shareScope: 'default',
        },
        // Platform-specific packages can be bundled (lightweight and version-stable)
        '@nekazari/ui-kit': {
          singleton: false,
          requiredVersion: '^1.0.0',
        },
        '@nekazari/sdk': {
          singleton: false,
          requiredVersion: '^1.0.0',
        },
      },
    }),
  ],
  build: {
    // ✅ Externalize React so Module Federation can share it
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

**Why Share React as Singleton?**

- **Technical requirement**: React hooks (`useState`, `useEffect`, etc.) require all components in the same tree to use the same React instance. If a module bundles its own React and renders inside the host's React tree, hooks will fail with errors like "can't access property 'useState', U.current is null"
- **Host provides React via globals**: The Nekazari host exposes React via `window.React`, `window.ReactDOM`, which Module Federation uses when configured with `singleton: true`
- **Module Federation handles fallback**: If React isn't available from the host, Module Federation will bundle it, but this should never happen in production
- **Version compatibility**: The `requiredVersion` ensures the host's React version is compatible with the module's expectations

**❌ DON'T (External Modules):**
```typescript
// ❌ BAD: Don't bundle React directly - hooks will fail
shared: {
  // Missing React - this will cause hook errors
  '@nekazari/ui-kit': { singleton: false },
},
rollupOptions: {
  // No external configuration - React gets bundled, causing conflicts
}
```

**SDK Initialization:**

Even though modules bundle their own copy of `@nekazari/sdk`, the SDK automatically obtains authentication context from the host application via React Context. The host's `AuthProvider` wraps all modules, so `useAuth()` from the SDK will work correctly:

```typescript
// ✅ GOOD: SDK automatically gets context from host
import { useAuth } from '@nekazari/sdk';

function MyComponent() {
  const { getToken, tenantId } = useAuth();  // Gets context from host
  // SDK client uses this token automatically
}
```

**Note on React Sharing:**

Sharing React as singleton is a **technical requirement**, not an architectural choice. React's internal dispatcher system requires a single instance for hooks to work. This is different from sharing other dependencies - React's singleton requirement is fundamental to how React works.

**Platform Packages (@nekazari/*):**

Platform-specific packages (`@nekazari/sdk`, `@nekazari/ui-kit`) can be bundled directly in the module because:
- They are lightweight and version-stable
- They don't have the same singleton requirements as React
- They automatically obtain host context (like auth) via React Context, so bundling them doesn't create isolation issues

#### Slot Registration
```typescript
// In your module's index.ts
import { SlotWidgetDefinition } from '@/context/ModuleContext';

export const YOUR_MODULE_SLOTS: ModuleViewerSlots = {
    'context-panel': [{
        id: 'your-module-controls',
        component: 'YourModuleControls',
        priority: 10,
        localComponent: YourModuleControls,
        showWhen: { entityType: ['AgriParcel'] },
    }],
    'layer-toggle': [{
        id: 'your-module-layer',
        component: 'YourModuleLayerToggle',
        priority: 10,
        localComponent: YourModuleLayerToggle,
    }],
};
```

#### API Service Pattern
```typescript
// services/yourModuleApi.ts
import axios from 'axios';
import { getConfig } from '@/config/environment';

const config = getConfig();
const API_BASE_URL = config.api.baseUrl;

const getAuthToken = (): string => {
    return localStorage.getItem('auth_token') ||
        (window as any).__keycloak?.token || '';
};

const createClient = () => axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
    },
});

export const yourModuleApi = {
    createJob: async (params: CreateJobParams) => {
        const response = await createClient().post('/api/your-module/jobs', {
            ...params,
            sourceModule: 'your-module', // ✅ Always identify module
        });
        return response.data;
    },
    
    getResults: async (entityId: string) => {
        const response = await createClient().get('/api/your-module/results', {
            params: { entity_id: entityId },
        });
        return response.data;
    },
};
```

### 5. Metadata Configuration

#### Module Registration
```sql
-- In your module's registration migration
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, route_path, label, version,
    module_type, required_plan_type, pricing_tier,
    is_active, metadata
) VALUES (
    'your-module',
    'your-module',
    'Your Module Display Name',
    'Description of what your module does',
    true,  -- or false for remote modules
    '/your-module',
    'Your Module',
    '1.0.0',
    'ADDON_PAID',  -- or ADDON_FREE
    'premium',  -- or 'basic', 'enterprise'
    'PAID',  -- or 'FREE'
    true,
    '{
        "icon": "your-icon",
        "color": "#10B981",
        "shortDescription": "Brief description",
        "contextPanel": {
            "description": "What this module does",
            "instructions": "How to use it",
            "entityTypes": ["AgriParcel", "Vineyard"]
        },
        "features": ["Feature 1", "Feature 2"],
        "backend_services": ["your-service"],
        "external_dependencies": ["External API"]
    }'::jsonb
);
```

### 6. Security Best Practices

#### Input Validation
```python
# ✅ ALWAYS validate input
def validate_parcel_id(parcel_id: str) -> bool:
    if not parcel_id or not isinstance(parcel_id, str):
        return False
    # UUID validation
    try:
        uuid.UUID(parcel_id)
        return True
    except ValueError:
        return False

@app.route('/api/your-module/jobs', methods=['POST'])
@require_auth(require_hmac=False)
def create_job():
    data = request.get_json() or {}
    parcel_id = data.get('parcelId')
    
    # ✅ Validate input
    if not validate_parcel_id(parcel_id):
        return jsonify({'error': 'Invalid parcel ID'}), 400
```

#### SQL Injection Prevention
```python
# ✅ ALWAYS use parameterized queries
cursor.execute(
    "SELECT * FROM your_table WHERE tenant_id = %s AND id = %s",
    (tenant_id, entity_id)  # Parameters, not string formatting
)

# ❌ NEVER use string formatting
cursor.execute(
    f"SELECT * FROM your_table WHERE id = '{entity_id}'"  # DANGEROUS!
)
```

#### Tenant Isolation
```python
# ✅ ALWAYS use tenant context
with get_db_connection_with_tenant(g.tenant) as conn:
    cursor = conn.cursor()
    # RLS automatically filters by tenant
    cursor.execute("SELECT * FROM your_table WHERE id = %s", (entity_id,))
```

### 7. Migration Best Practices

#### Migration Structure
```sql
-- =============================================================================
-- Migration XXX: Your Module Description
-- =============================================================================
-- Brief description of what this migration does
--
-- PURPOSE:
-- Detailed explanation
--
-- DEPENDENCIES:
-- - 001_other_migration.sql (if depends on other migrations)
--
-- IDEMPOTENCY:
-- This migration is idempotent - safe to run multiple times
-- =============================================================================

-- Use IF NOT EXISTS for tables
CREATE TABLE IF NOT EXISTS your_module_table (
    ...
);

-- Use IF NOT EXISTS for indexes
CREATE INDEX IF NOT EXISTS idx_name ON your_module_table(column);

-- Use DROP IF EXISTS for policies (idempotent)
DROP POLICY IF EXISTS policy_name ON your_module_table;
CREATE POLICY policy_name ON your_module_table ...;

-- =============================================================================
-- End of migration XXX
-- =============================================================================
```

#### Rollback Scripts
```sql
-- rollback/001_drop_module_tables.sql
-- Always provide rollback scripts for clean uninstallation

DROP TABLE IF EXISTS your_module_table CASCADE;
DROP INDEX IF EXISTS idx_name;
```

### 8. Testing Requirements

#### Unit Tests
```python
# tests/test_your_module.py
def test_create_job():
    # Test with valid input
    # Test with invalid input
    # Test tenant isolation
    # Test error handling
```

#### Integration Tests
```python
# tests/integration/test_your_module_api.py
def test_api_endpoint():
    # Test authentication
    # Test authorization
    # Test RLS policies
    # Test error responses
```

### 9. Documentation Requirements

#### Module README
```markdown
# Your Module Name

## Description
Brief description of what the module does

## Features
- Feature 1
- Feature 2

## Installation
1. Apply migrations
2. Register module
3. Configure settings

## Usage
How to use the module

## API Endpoints
- POST /api/your-module/jobs
- GET /api/your-module/results

## Configuration
Environment variables, secrets, etc.

## Dependencies
- External services
- Other modules (if any)
```

### 10. FIWARE Compliance

#### NGSI-LD Context
```json
{
  "@context": {
    "YourEntity": {
      "@id": "https://uri.etsi.org/ngsi-ld/YourEntity",
      "@type": "@id"
    }
  }
}
```

#### Entity Structure
```python
# Follow FIWARE Smart Data Models when possible
entity = {
    "id": f"urn:ngsi-ld:YourEntity:{entity_id}",
    "type": "YourEntity",
    "@context": ["https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"],
    "name": {
        "type": "Property",
        "value": "Entity Name"
    },
    "location": {
        "type": "GeoProperty",
        "value": {
            "type": "Point",
            "coordinates": [lon, lat]
        }
    }
}
```

## Checklist for New Modules

- [ ] Module-specific table names (no conflicts)
- [ ] RLS policies enabled on all tables
- [ ] Tenant isolation in all queries
- [ ] Module-specific API endpoints
- [ ] Input validation on all endpoints
- [ ] Proper error handling and logging
- [ ] Metadata configuration in marketplace_modules
- [ ] Slot registration for UI integration
- [ ] Migration scripts (with rollback)
- [ ] Documentation (README, API docs)
- [ ] Tests (unit + integration)
- [ ] Security review (SQL injection, XSS, etc.)
- [ ] **Frontend: Self-contained module (React bundled, not externalized)**
- [ ] **Frontend: SDK initialization uses host context (via `useAuth()` from `@nekazari/sdk`)**
- [ ] **Frontend: CSS isolation configured (Tailwind preflight disabled, prefix added, or CSS scoped)**

## Example: VegetationHealth Module

See `config/timescaledb/migrations/035_create_vegetation_module_tables.sql` for a complete example following all these practices.

