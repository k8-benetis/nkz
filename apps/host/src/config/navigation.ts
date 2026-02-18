// =============================================================================
// Navigation Configuration - Single Source of Truth
// =============================================================================
// Centralized navigation configuration for the entire application.
// This eliminates duplication between Sidebar, Navigation, and other components.

import {
  Home,
  Layers,
  Settings,
  Shield,
  Bell,
  Package,
} from 'lucide-react';
import type { ComponentType } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface NavigationItemConfig {
  /** Route path */
  path: string;
  /** Translation key for label */
  label: string;
  /** Lucide React icon component */
  icon: ComponentType<{ className?: string }>;
  /** Roles that can access this item */
  roles: string[];
  /** Only visible to platform admins */
  adminOnly?: boolean;
  /** Optional: Category for grouping (used in UI) */
  category?: 'core' | 'addon' | 'admin';
  /** Optional: Priority order (lower = higher priority) */
  priority?: number;
}

// =============================================================================
// CORE Navigation Items
// =============================================================================
// Fundamental platform features that are ALWAYS available (not optional addons)
// These are hardcoded routes in App.tsx

export const CORE_NAVIGATION_ITEMS: NavigationItemConfig[] = [
  {
    path: '/dashboard',
    label: 'dashboard.title',
    icon: Home,
    roles: ['Farmer', 'DeviceManager', 'TenantAdmin', 'PlatformAdmin'],
    category: 'core',
    priority: 1,
  },
  {
    path: '/entities',
    label: 'navigation.entities',
    icon: Layers,
    roles: ['Farmer', 'DeviceManager', 'TenantAdmin', 'PlatformAdmin'],
    category: 'core',
    priority: 2,
  },
  {
    path: '/alerts',
    label: 'navigation.alerts',
    icon: Bell,
    roles: ['Farmer', 'TenantAdmin', 'PlatformAdmin'],
    category: 'core',
    priority: 4,
  },
  // Note: NDVI/Vegetation, Robots, Sensors, Weather, Simulation, Predictions, Risks
  // are now handled as dynamic modules (addons) and should NOT be in core navigation
];

// =============================================================================
// ADMIN/SETTINGS Navigation Items
// =============================================================================
// Always shown at the bottom of the sidebar

export const ADMIN_NAVIGATION_ITEMS: NavigationItemConfig[] = [
  {
    path: '/settings',
    label: 'navigation.settings',
    icon: Settings,
    roles: ['Farmer', 'DeviceManager', 'TenantAdmin', 'PlatformAdmin'],
    category: 'admin',
    priority: 100,
  },
  {
    path: '/admin/modules',
    label: 'navigation.modules',
    icon: Package,
    roles: ['TenantAdmin', 'PlatformAdmin', 'TechnicalConsultant'],
    category: 'admin',
    priority: 101,
  },
  {
    path: '/system-admin',
    label: 'navigation.admin',
    icon: Shield,
    roles: ['PlatformAdmin'],
    adminOnly: true,
    category: 'admin',
    priority: 102,
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all navigation items (core + admin)
 */
export const getAllNavigationItems = (): NavigationItemConfig[] => {
  return [...CORE_NAVIGATION_ITEMS, ...ADMIN_NAVIGATION_ITEMS];
};

/**
 * Filter navigation items by user roles
 */
export const filterNavigationItemsByRoles = (
  items: NavigationItemConfig[],
  userRoles: string[],
  isPlatformAdmin: boolean = false
): NavigationItemConfig[] => {
  return items.filter((item) => {
    // Admin-only items
    if (item.adminOnly && !isPlatformAdmin) {
      return false;
    }
    // Check if user has at least one required role
    return item.roles.some((role) => userRoles.includes(role));
  });
};

/**
 * Get navigation item by path
 */
export const getNavigationItemByPath = (
  path: string
): NavigationItemConfig | undefined => {
  return getAllNavigationItems().find(
    (item) => item.path === path || path.startsWith(item.path + '/')
  );
};

/**
 * Sort navigation items by priority
 */
export const sortNavigationItemsByPriority = (
  items: NavigationItemConfig[]
): NavigationItemConfig[] => {
  return [...items].sort((a, b) => {
    const priorityA = a.priority ?? 999;
    const priorityB = b.priority ?? 999;
    return priorityA - priorityB;
  });
};

