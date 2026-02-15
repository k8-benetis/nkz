// =============================================================================
// Navigation Component - Unified Top Bar with Mega Menu
// =============================================================================
// This component replaces the traditional Sidebar + Header architecture.
// It features a "Mega Menu" dropdown triggered by the Nekazari logo,
// providing access to all platform areas (Core, Modules, Admin) from a single place.
//
// Features:
// - Mega Menu Dropdown (Desktop)
// - Mobile Drawer Trigger (Mobile)
// - User Profile & Quick Actions
// - Module Integration
// - Responsive Design

import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useModules } from '@/context/ModuleContext';
import { useTranslation } from '@nekazari/sdk';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import { MobileDrawer } from './layout/MobileDrawer';
import {
  CORE_NAVIGATION_ITEMS,
  ADMIN_NAVIGATION_ITEMS,
  filterNavigationItemsByRoles,
  sortNavigationItemsByPriority,
} from '@/config/navigation';
import {
  ChevronDown,
  LogOut,
  Shield,
  Puzzle,
  ExternalLink,
  Menu
} from 'lucide-react';

// Styling configuration
const glassStyles = {
  // We use a cleaner white background for the main nav to ensure readability vs transparency
  dropdown: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl',
  hover: 'hover:bg-slate-50 dark:hover:bg-slate-800',
};

// Module icon mapping
const moduleIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'puzzle': Puzzle,
  'default': Puzzle,
};

export const Navigation: React.FC = () => {
  const { user, logout } = useAuth();
  const { modules } = useModules();
  const { t } = useTranslation(['common', 'navigation']);
  const navigate = useNavigate();
  const location = useLocation();

  // State
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // User roles & Permissions
  const userRoles = user?.roles || [];
  const isAdmin = userRoles.includes('PlatformAdmin') || userRoles.includes('TenantAdmin');
  const isPlatformAdmin = userRoles.includes('PlatformAdmin');

  // Navigation Items
  const coreItems = sortNavigationItemsByPriority(
    filterNavigationItemsByRoles(CORE_NAVIGATION_ITEMS, userRoles, isPlatformAdmin)
  );
  const adminItems = sortNavigationItemsByPriority(
    filterNavigationItemsByRoles(ADMIN_NAVIGATION_ITEMS, userRoles, isPlatformAdmin)
  );

  // Safe modules array
  const safeModules = Array.isArray(modules) ? modules.filter(m => m?.id && m?.routePath) : [];

  // --- Interaction Handlers ---

  const handleMouseEnter = () => {
    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current);
      menuTimeoutRef.current = null;
    }
    setIsMenuOpen(true);
  };

  const handleMouseLeave = () => {
    menuTimeoutRef.current = setTimeout(() => {
      setIsMenuOpen(false);
    }, 150);
  };

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (menuTimeoutRef.current) {
        clearTimeout(menuTimeoutRef.current);
      }
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <>
      <nav className="bg-white dark:bg-slate-900 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 transition-colors duration-200 h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex justify-between items-center h-full">

            {/* LEFT SECTION: Logo & Mega Menu */}
            <div className="flex items-center gap-4">
              {/* Mobile Hamburger (Visible only on mobile) */}
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Abrir menú"
              >
                <Menu className="h-6 w-6" />
              </button>

              {/* Mega Menu Container (Desktop) */}
              <div
                ref={menuRef}
                className="relative hidden md:block"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                {/* Logo Button Trigger */}
                <button
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 ${isMenuOpen ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  <span className="text-2xl">🌾</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                    Nekazari
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Dropdown Menu Content */}
                <div
                  className={`absolute top-full left-0 mt-2 min-w-[280px] rounded-xl ${glassStyles.dropdown} overflow-hidden transition-all duration-200 origin-top-left ${isMenuOpen
                    ? 'opacity-100 scale-100 translate-y-0 visible'
                    : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'
                    }`}
                >
                  {/* Core Navigation */}
                  <div className="py-2">
                    <div className="px-4 py-1">
                      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        Principal
                      </span>
                    </div>
                    {coreItems.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.path);
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsMenuOpen(false)}
                          className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all ${active
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                        >
                          <Icon className={`w-5 h-5 ${active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
                          <span className="font-medium">
                            {t(item.label, { ns: item.label.startsWith('navigation.') ? 'navigation' : 'common' })}
                          </span>
                        </Link>
                      );
                    })}
                  </div>

                  {/* Addons Section */}
                  {safeModules.length > 0 && (
                    <div className="py-2 border-t border-gray-100 dark:border-gray-700/50">
                      <div className="px-4 py-1">
                        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          Módulos
                        </span>
                      </div>
                      {safeModules.slice(0, 5).map((module) => {
                        const Icon = moduleIconMap[module.icon || 'default'] || Puzzle;
                        const active = isActive(module.routePath);
                        const emoji = module.metadata?.icon;
                        const hasEmoji = emoji && typeof emoji === 'string' && emoji.length <= 2;

                        return (
                          <Link
                            key={module.id}
                            to={module.routePath}
                            onClick={() => setIsMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all ${active
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                          >
                            {hasEmoji ? (
                              <span className="w-5 h-5 flex items-center justify-center text-base">{emoji}</span>
                            ) : (
                              <Icon className={`w-5 h-5 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`} />
                            )}
                            <span className="font-medium truncate">
                              {module.label || module.displayName || module.name}
                            </span>
                          </Link>
                        );
                      })}
                      {safeModules.length > 5 && (
                        <Link
                          to="/admin/modules"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 mx-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Ver todos ({safeModules.length})
                        </Link>
                      )}
                    </div>
                  )}

                  {/* Admin/Settings Section */}
                  {adminItems.length > 0 && (
                    <div className="py-2 border-t border-gray-100 dark:border-gray-700/50">
                      {adminItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setIsMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all ${active
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                          >
                            <Icon className={`w-5 h-5 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                            <span className="font-medium">
                              {t(item.label, { ns: 'navigation' })}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile Logo (Simple) */}
              <div className="md:hidden flex items-center">
                <span className="text-2xl mr-2">🌾</span>
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Nekazari</span>
              </div>
            </div>

            {/* RIGHT SECTION: User Profile & Tools */}
            <div className="flex items-center gap-4">
              {/* User Info - Desktop only */}
              <div className="hidden md:flex items-center gap-3">
                <div className="text-right hidden lg:block">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {user?.email}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {isAdmin ? t('layout.administrator', { defaultValue: 'Administrador' }) : userRoles[0] || t('layout.user', { defaultValue: 'Usuario' })}
                  </div>
                </div>

                {/* Admin Badge */}
                {isAdmin && (
                  <div className="flex items-center px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-md">
                    <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-1" />
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium hidden xl:inline">
                      {t('navigation.admin_badge', { defaultValue: 'Admin' })}
                    </span>
                  </div>
                )}
              </div>

              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1 hidden md:block"></div>

              {/* Theme Toggle */}
              <ThemeToggle variant="compact" />

              {/* Language Selector */}
              <LanguageSelector variant="compact" />

              {/* Logout Button (Desktop) */}
              <button
                onClick={handleLogout}
                className="hidden md:flex p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title={t('layout.logout', { defaultValue: 'Cerrar sesión' })}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <MobileDrawer isOpen={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)} />
    </>
  );
};
