// =============================================================================
// Breadcrumb Component - Navigation Context
// =============================================================================
// Provides breadcrumb navigation to help users understand their location
// in the application hierarchy.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home, Leaf } from 'lucide-react';
import { getNavigationItemByPath } from '@/config/navigation';
import { useTranslation } from '@nekazari/sdk';
import { useModules } from '@/context/ModuleContext';

export interface BreadcrumbItem {
  label: string;
  path: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface BreadcrumbProps {
  /** Custom breadcrumb items (overrides auto-generation) */
  items?: BreadcrumbItem[];
  /** Hide the home/dashboard item */
  hideHome?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Generate breadcrumb items from current route
 * Supports both static navigation items and dynamic addon modules
 */
const generateBreadcrumbsFromPath = (
  pathname: string,
  modules: Array<{ id: string; routePath: string; label?: string; displayName?: string; metadata?: { icon?: string } }> = []
): BreadcrumbItem[] => {
  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [];

  // Always start with dashboard
  items.push({
    label: 'dashboard.title',
    path: '/dashboard',
    icon: Home,
  });

  // Build path segments
  let currentPath = '';
  for (const segment of segments) {
    currentPath += `/${segment}`;
    
    // Skip dashboard since we already added it
    if (currentPath === '/dashboard') {
      continue;
    }

    // First, try to find navigation item for this path (static core/admin items)
    const navItem = getNavigationItemByPath(currentPath);
    
    if (navItem) {
      items.push({
        label: navItem.label,
        path: navItem.path,
        icon: navItem.icon,
      });
    } else {
      // If not found in static navigation, try to find in dynamic modules
      const module = modules.find(
        m => m.routePath === currentPath || currentPath.startsWith(m.routePath + '/')
      );
      
      if (module) {
        items.push({
          label: module.label || module.displayName || module.id,
          path: module.routePath,
          icon: Leaf, // Default icon for modules
        });
      } else {
        // If not found anywhere, use segment as label (capitalized)
        items.push({
          label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
          path: currentPath,
        });
      }
    }
  }

  return items;
};

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  hideHome = false,
  className = '',
}) => {
  const location = useLocation();
  const { t } = useTranslation(['common', 'navigation']);
  const { modules } = useModules();

  // Generate breadcrumbs if not provided (includes support for dynamic modules)
  const breadcrumbItems = items || generateBreadcrumbsFromPath(location.pathname, modules || []);

  // Filter out home if hideHome is true
  const displayItems = hideHome 
    ? breadcrumbItems.filter(item => item.path !== '/dashboard')
    : breadcrumbItems;

  // Don't render if only one item (usually just dashboard on dashboard page)
  if (displayItems.length <= 1) {
    return null;
  }

  return (
    <nav 
      className={`flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4 ${className}`}
      aria-label="Breadcrumb"
    >
      {displayItems.map((item, index) => {
        const isLast = index === displayItems.length - 1;
        const Icon = item.icon;
        const label = t(item.label, { 
          ns: item.label.startsWith('navigation.') ? 'navigation' : 'common',
          defaultValue: item.label 
        });

        return (
          <React.Fragment key={item.path}>
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            )}
            {isLast ? (
              <div className="flex items-center text-gray-900 dark:text-gray-100 font-medium">
                {Icon && <Icon className="w-4 h-4 mr-1" />}
                <span>{label}</span>
              </div>
            ) : (
              <Link
                to={item.path}
                className="flex items-center hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {Icon && <Icon className="w-4 h-4 mr-1" />}
                <span>{label}</span>
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

