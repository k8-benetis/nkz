// =============================================================================
// Mobile Drawer - Navigation Menu for Mobile Devices
// =============================================================================
// Slide-out drawer that replaces the sidebar on mobile devices

import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useModules } from '@/context/ModuleContext';
import { useTranslation } from '@nekazari/sdk';
import {
  CORE_NAVIGATION_ITEMS,
  ADMIN_NAVIGATION_ITEMS,
  filterNavigationItemsByRoles,
  sortNavigationItemsByPriority,
} from '@/config/navigation';
import { X, Menu } from 'lucide-react';
import {
  Puzzle,
  Bird,
  Sparkles,
  Leaf,
  Cloud,
  AlertTriangle,
  BarChart2,
  LineChart,
  Brain,
  Gauge,
  Bot,
  Satellite
} from 'lucide-react';

// Icon mapping for dynamic addon modules
const moduleIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'bird': Bird,
  'puzzle': Puzzle,
  'sparkles': Sparkles,
  'leaf': Leaf,
  'cloud': Cloud,
  'alert': AlertTriangle,
  'chart': BarChart2,
  'line-chart': LineChart,
  'brain': Brain,
  'gauge': Gauge,
  'bot': Bot,
  'satellite': Satellite,
  'default': Puzzle
};

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { modules } = useModules();
  const { t } = useTranslation(['common', 'navigation']);
  const location = useLocation();

  const userRoles = user?.roles || [];
  const isPlatformAdmin = userRoles.includes('PlatformAdmin');

  // Filter navigation items
  const visibleCoreItems = sortNavigationItemsByPriority(
    filterNavigationItemsByRoles(CORE_NAVIGATION_ITEMS, userRoles, isPlatformAdmin)
  );

  const visibleAdminItems = sortNavigationItemsByPriority(
    filterNavigationItemsByRoles(ADMIN_NAVIGATION_ITEMS, userRoles, isPlatformAdmin)
  );

  // Close drawer on route change
  useEffect(() => {
    if (isOpen) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Get icon component for a dynamic addon module
  const getModuleIcon = (module: { icon?: string; metadata?: { icon?: string } }) => {
    const iconName = module.icon || module.metadata?.icon || 'default';
    if (iconName.length <= 2) return moduleIconMap['default'];
    return moduleIconMap[iconName.toLowerCase()] || moduleIconMap['default'];
  };

  // Render a navigation link
  const renderNavLink = (item: typeof CORE_NAVIGATION_ITEMS[0]) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={onClose}
        className={`flex items-center px-4 py-3 text-base font-medium rounded-lg transition-colors ${
          isActive
            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
      >
        <Icon className={`mr-3 flex-shrink-0 h-5 w-5 ${isActive ? 'text-green-500 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
        {t(item.label, { ns: item.label.startsWith('navigation.') ? 'navigation' : 'common' })}
      </Link>
    );
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-80 bg-white dark:bg-gray-900 shadow-xl z-50 md:hidden transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          <Link to="/dashboard" onClick={onClose} className="flex items-center">
            <span className="text-2xl mr-2">🌾</span>
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Nekazari</span>
          </Link>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Cerrar menú"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="overflow-y-auto h-[calc(100vh-4rem)] py-4">
          <nav className="px-2 space-y-1">
            {/* CORE Navigation Items */}
            <div className="mb-4">
              {visibleCoreItems.map((item) => renderNavLink(item))}
            </div>

            {/* ADDONS Section */}
            {modules && modules.length > 0 && (
              <>
                <div className="pt-4 pb-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="px-4 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Addons
                  </div>
                </div>
                {modules.map((module) => {
                  const Icon = getModuleIcon(module);
                  const isActive = location.pathname === module.routePath || 
                                 location.pathname.startsWith(module.routePath + '/');
                  const emoji = module.metadata?.icon;
                  const hasEmoji = emoji && emoji.length <= 2;

                  return (
                    <Link
                      key={module.id}
                      to={module.routePath}
                      onClick={onClose}
                      className={`flex items-center px-4 py-3 text-base font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {hasEmoji ? (
                        <span className="mr-3 flex-shrink-0 h-5 w-5 flex items-center justify-center text-base">
                          {emoji}
                        </span>
                      ) : (
                                            <Icon
                                                className={`mr-3 flex-shrink-0 h-5 w-5 ${isActive ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}
                                            />
                      )}
                      {module.label || module.displayName}
                    </Link>
                  );
                })}
              </>
            )}

            {/* Admin/Settings Section */}
            {visibleAdminItems.length > 0 && (
              <>
                <div className="pt-4 pb-2 border-t border-gray-200 dark:border-gray-700 mt-4" />
                {visibleAdminItems.map((item) => renderNavLink(item))}
              </>
            )}
          </nav>
        </div>
      </div>
    </>
  );
};

