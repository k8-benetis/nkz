# @nekazari/ui-kit

**Nekazari Platform UI Kit** - Official UI components for Nekazari Platform modules.

## License

**Apache-2.0** - See [LICENSE](./LICENSE) file.

This UI Kit is licensed under Apache-2.0 to enable developers to build proprietary/commercial modules. The core Nekazari Platform remains under AGPL-3.0.

## Installation

```bash
npm install @nekazari/ui-kit
```

## Usage

```typescript
import { Button, Card, Input } from '@nekazari/ui-kit';

function MyComponent() {
  return (
    <Card padding="md">
      <Input placeholder="Enter text" />
      <Button variant="primary">Submit</Button>
    </Card>
  );
}
```

## Documentation

See the [External Developer Guide](https://github.com/nkz-os/nekazari-public/blob/main/docs/EXTERNAL_DEVELOPER_GUIDE.md) for complete component documentation.

## License Note

This package is licensed under **Apache-2.0**, separate from the core NKZ Platform (AGPL-3.0). This explicitly means that:

- ✅ Third-party modules built with this UI Kit can use **any license** (proprietary, commercial, closed-source, open-source, etc.).
- ✅ You can build proprietary/commercial modules.
- ✅ You can distribute modules under any license.
- ✅ You can monetize your modules.

Your modules are considered **separate works** when using only the public SDK/UI-Kit APIs. They do not become derived works of the AGPL-3.0 platform.

---

**Copyright 2025 NKZ Platform (Nekazari)**
