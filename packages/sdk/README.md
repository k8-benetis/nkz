# @nekazari/sdk

**Nekazari Platform SDK** - Official SDK for building Nekazari Platform modules.

## License

**Apache-2.0** - See [LICENSE](./LICENSE) file.

This SDK is licensed under Apache-2.0 to enable developers to build proprietary/commercial modules. The core Nekazari Platform remains under AGPL-3.0.

## Installation

```bash
npm install @nekazari/sdk
```

## Usage

```typescript
import { NKZClient, useAuth, useTranslation } from '@nekazari/sdk';

// API Client
const client = new NKZClient({
  baseUrl: '/api',
  getToken: () => token,
  getTenantId: () => tenantId,
});

// Authentication
const { user, token, tenantId } = useAuth();

// Internationalization
const { t } = useTranslation('common');
```

## Documentation

See the [External Developer Guide](https://github.com/k8-benetis/nkz/blob/main/docs/development/EXTERNAL_DEVELOPER_GUIDE.md) for complete documentation.

## License Note

This package is licensed under **Apache-2.0**, separate from the core NKZ Platform (AGPL-3.0). This allows you to:

- ? Build proprietary/commercial modules
- ? Distribute modules under any license
- ? Monetize your modules

Your modules are considered **separate works** when using only the public SDK APIs.

---

**Copyright 2025 NKZ Platform (Nekazari)**
