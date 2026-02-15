# Module Provider Guide

**Date:** 2025-01-XX  
**Related:** Module slot integration is documented in [ADDON_DEVELOPMENT_GUIDE.md](ADDON_DEVELOPMENT_GUIDE.md) and [MODULE_LAYER_INTEGRATION.md](MODULE_LAYER_INTEGRATION.md).

## Overview

This guide explains how to export and use React Context providers in remote modules for the Unified Viewer slot system.

## When to Use Module Providers

### ✅ You Need a Provider If:
- Your module is **fully remote** (loaded via Module Federation)
- Your widgets use React Context hooks (e.g., `useVegetationContext`, `useYourModuleContext`)
- Multiple widgets from your module need to share state
- Your widgets depend on module-specific context

### ❌ You Don't Need a Provider If:
- Your module is **local/bundled** with the host (like `ndvi`, `weather`, `parcels`)
- Your widgets don't use React Context
- Your widgets are completely independent

## Implementation

### Step 1: Create Your Provider

```typescript
// src/context/YourModuleContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface YourModuleContextType {
  // Your context state/functions
  data: any;
  setData: (data: any) => void;
  // ... other properties
}

const YourModuleContext = createContext<YourModuleContextType | undefined>(undefined);

export const useYourModuleContext = () => {
  const context = useContext(YourModuleContext);
  if (!context) {
    throw new Error('useYourModuleContext must be used within YourModuleProvider');
  }
  return context;
};

export const YourModuleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [data, setData] = useState<any>(null);

  const value: YourModuleContextType = {
    data,
    setData,
    // ... other properties
  };

  return (
    <YourModuleContext.Provider value={value}>
      {children}
    </YourModuleContext.Provider>
  );
};
```

### Step 2: Export Provider in viewerSlots

```typescript
// src/slots/index.ts
import React from 'react';
import { YourModuleProvider } from '../context/YourModuleContext';
import { YourWidget1 } from '../components/YourWidget1';
import { YourWidget2 } from '../components/YourWidget2';

export const viewerSlots: ModuleViewerSlots = {
  'context-panel': [
    {
      id: 'your-module-widget-1',
      component: 'YourWidget1',
      priority: 10,
      localComponent: YourWidget1,
    },
    {
      id: 'your-module-widget-2',
      component: 'YourWidget2',
      priority: 20,
      localComponent: YourWidget2,
    },
  ],
  // Export the provider for remote modules
  moduleProvider: YourModuleProvider,
};
```

### Step 3: Use Context in Widgets

```typescript
// src/components/YourWidget1.tsx
import { useYourModuleContext } from '../context/YourModuleContext';

export const YourWidget1: React.FC = () => {
  const { data, setData } = useYourModuleContext(); // ✅ Works!

  return (
    <div>
      {/* Your widget UI */}
    </div>
  );
};
```

## Important Notes

### Shared Provider Instance

**All widgets from the same module in the same slot share ONE provider instance.**

This means:
- ✅ State synchronization: If widget A updates context, widget B sees the change
- ✅ Single source of truth: All widgets read from the same context
- ✅ Efficient: Only one provider instance per module per slot

Example:
```
Slot: context-panel
├── vegetation-config (uses VegetationProvider)
└── vegetation-analytics (uses same VegetationProvider instance)
```

If `vegetation-config` calls `setFilter('wheat')`, `vegetation-analytics` immediately sees the updated filter.

### Provider Scope

- Each module has its own provider instance
- Providers are isolated between modules
- Local modules don't use providers (they're in the host bundle)

### State Management Best Practices

If you need complex state synchronization, consider:

1. **For simple state**: Use React Context (useState in provider) - works perfectly
2. **For complex state**: Use external stores (Zustand, Redux) accessed via context
3. **For async state**: Use React Query or SWR with context wrapper

Example with Zustand:

```typescript
// src/store/yourModuleStore.ts
import create from 'zustand';

export const useYourModuleStore = create((set) => ({
  data: null,
  setData: (data) => set({ data }),
}));

// src/context/YourModuleContext.tsx
export const YourModuleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Provider can still provide API client, config, etc.
  // While state lives in Zustand store (accessible directly or via context)
  return <>{children}</>;
};
```

## Troubleshooting

### Error: "useYourModuleContext must be used within YourModuleProvider"

**Cause:** Widget is trying to use context but provider isn't available.

**Solution:**
1. Ensure `moduleProvider` is exported in `viewerSlots`
2. Verify module is loaded as remote (not local)
3. Check that provider component is correctly imported

### Widgets Not Synchronizing

**Cause:** Multiple provider instances (shouldn't happen with current implementation).

**Solution:**
- Verify you're using a single `moduleProvider` export (not widget-level)
- Check that widgets are from the same module
- Ensure state is in the provider, not in individual widgets

### Provider Not Loading

**Cause:** Module Federation loading issues.

**Solution:**
1. Verify `vite.config.ts` exposes `./viewerSlots`:
   ```typescript
   exposes: {
     './viewerSlots': './src/slots/index.ts',
   }
   ```
2. Check browser console for Module Federation errors
3. Verify `remoteEntry` URL is correct in database

## Example: vegetation-prime Module

See `vegetation-prime` module for a complete example:

```typescript
// vegetation-prime/src/context/VegetationContext.tsx
export const VegetationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Vegetation-specific context
  return <VegetationContext.Provider value={value}>{children}</VegetationContext.Provider>;
};

// vegetation-prime/src/slots/index.ts
export const viewerSlots: ModuleViewerSlots = {
  'context-panel': [
    { id: 'vegetation-config', localComponent: VegetationConfig, ... },
    { id: 'vegetation-analytics', localComponent: VegetationAnalytics, ... },
  ],
  'bottom-panel': [
    { id: 'vegetation-timeline', localComponent: VegetationTimeline, ... },
  ],
  moduleProvider: VegetationProvider, // ✅ Shared across all widgets
};
```

## Migration Checklist

For existing remote modules:

- [ ] Identify if widgets use React Context
- [ ] Create module provider if needed
- [ ] Export `moduleProvider` in `viewerSlots`
- [ ] Test that widgets can access context
- [ ] Verify state synchronization between widgets
- [ ] Update module documentation

## Additional Resources

- [React Context Documentation](https://react.dev/reference/react/useContext)
- [Module Development Best Practices](./MODULE_DEVELOPMENT_BEST_PRACTICES.md)
- [Slot System Documentation](./MODULE_LAYER_INTEGRATION.md)

