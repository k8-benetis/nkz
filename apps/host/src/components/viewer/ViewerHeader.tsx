// =============================================================================
// Viewer Header - Floating Header for UnifiedViewer
// =============================================================================
// A glassmorphism header that floats over the map in the /entities page.
// Features:
// - Nekazari logo with dropdown menu on hover
// - Language selector and theme toggle on the right
// - Same navigation items as the sidebar
//
// This component replaces the solid Navigation bar in UnifiedViewer.

import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useModules } from '@/context/ModuleContext';
import { useTranslation } from '@nekazari/sdk';
import { LanguageSelector } from '@/components/LanguageSelector';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
    CORE_NAVIGATION_ITEMS,
    ADMIN_NAVIGATION_ITEMS,
    filterNavigationItemsByRoles,
    sortNavigationItemsByPriority,
} from '@/config/navigation';
import {
    ChevronDown,
    LogOut,
    Puzzle,
    ExternalLink,
} from 'lucide-react';

// Glassmorphism styling
const glassStyles = {
    base: 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/30 dark:border-slate-700/50 shadow-xl',
    hover: 'hover:bg-white/90 dark:hover:bg-slate-800/90',
};

// Module icon mapping (same as Sidebar)
const moduleIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'puzzle': Puzzle,
    'default': Puzzle,
};

export interface ViewerHeaderProps {
    /** Optional content to show in the right strip (e.g. layer toggle button) to avoid crowding */
    rightContent?: React.ReactNode;
}

export const ViewerHeader: React.FC<ViewerHeaderProps> = ({ rightContent }) => {
    const { user, logout } = useAuth();
    const { modules } = useModules();
    const { t } = useTranslation(['common', 'navigation']);
    const navigate = useNavigate();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // User roles
    const userRoles = user?.roles || [];
    const isPlatformAdmin = userRoles.includes('PlatformAdmin');

    // Get navigation items
    const coreItems = sortNavigationItemsByPriority(
        filterNavigationItemsByRoles(CORE_NAVIGATION_ITEMS, userRoles, isPlatformAdmin)
    );
    const adminItems = sortNavigationItemsByPriority(
        filterNavigationItemsByRoles(ADMIN_NAVIGATION_ITEMS, userRoles, isPlatformAdmin)
    );

    // Safe modules array
    const safeModules = Array.isArray(modules) ? modules.filter(m => m?.id && m?.routePath) : [];

    // Handle menu open on hover
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

    // Cleanup timeout on unmount
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
            {/* Left: Logo and Navigation Menu */}
            <div
                ref={menuRef}
                className="absolute top-4 left-4 z-50"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Logo Button: click → dashboard, hover opens menu */}
                <button
                    type="button"
                    onClick={() => {
                        setIsMenuOpen(false);
                        navigate('/dashboard');
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${glassStyles.base} ${glassStyles.hover} transition-all duration-300 group`}
                >
                    <span className="text-2xl">🌾</span>
                    <span className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Nekazari
                    </span>
                    <ChevronDown
                        className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''
                            }`}
                    />
                </button>

                {/* Dropdown Menu */}
                <div
                    className={`absolute top-full left-0 mt-2 min-w-[280px] rounded-xl ${glassStyles.base} overflow-hidden transition-all duration-300 origin-top-left ${isMenuOpen
                        ? 'opacity-100 scale-100 translate-y-0'
                        : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
                        }`}
                >
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-slate-200/50 dark:border-slate-700/50 bg-gradient-to-r from-slate-50/80 to-white/80 dark:from-slate-800/80 dark:to-slate-900/80">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold shadow-md">
                                {user?.email?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                    {user?.email || 'Usuario'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                                    {isPlatformAdmin ? 'Administrador' : userRoles[0] || 'Usuario'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Core Navigation */}
                    <div className="py-2">
                        <div className="px-4 py-1">
                            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
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
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    <Icon className={`w-5 h-5 ${active ? 'text-green-600 dark:text-green-400' : 'text-slate-500'}`} />
                                    <span className="font-medium">
                                        {t(item.label, { ns: item.label.startsWith('navigation.') ? 'navigation' : 'common' })}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Addons Section (only if modules exist) */}
                    {safeModules.length > 0 && (
                        <div className="py-2 border-t border-slate-200/50 dark:border-slate-700/50">
                            <details className="group" open>
                                <summary className="px-4 py-1 flex items-center justify-between cursor-pointer list-none">
                                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                        Módulos ({safeModules.length})
                                    </span>
                                    <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="mt-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {safeModules.map((module) => {
                                        const Icon = moduleIconMap[module.icon || 'default'] || Puzzle;
                                        const active = isActive(module.routePath);
                                        const emoji = module.metadata?.icon;
                                        const hasEmoji = emoji && typeof emoji === 'string' && emoji.length <= 2;

                                        return (
                                            <Link
                                                key={module.id}
                                                to={module.routePath}
                                                onClick={() => setIsMenuOpen(false)}
                                                className={`flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-all ${active
                                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                    }`}
                                            >
                                                {hasEmoji ? (
                                                    <span className="w-5 h-5 flex items-center justify-center text-base">{emoji}</span>
                                                ) : (
                                                    <Icon className={`w-5 h-5 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`} />
                                                )}
                                                <span className="font-medium truncate text-sm">
                                                    {module.label || module.displayName || module.name}
                                                </span>
                                            </Link>
                                        );
                                    })}
                                    {safeModules.length > 0 && (
                                        <Link
                                            to="/admin/modules"
                                            onClick={() => setIsMenuOpen(false)}
                                            className="flex items-center gap-2 px-4 py-2 mx-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            {t('navigation.manage_modules', { defaultValue: 'Gestionar módulos' })}
                                        </Link>
                                    )}
                                </div>
                            </details>
                        </div>
                    )}

                    {/* Admin/Settings Section */}
                    {adminItems.length > 0 && (
                        <div className="py-2 border-t border-slate-200/50 dark:border-slate-700/50">
                            {adminItems.map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.path);
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setIsMenuOpen(false)}
                                        className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all ${active
                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        <Icon className={`w-5 h-5 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`} />
                                        <span className="font-medium">
                                            {t(item.label, { ns: 'navigation' })}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}

                    {/* Logout */}
                    <div className="py-2 border-t border-slate-200/50 dark:border-slate-700/50">
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] text-left text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="font-medium">{t('layout.logout', { defaultValue: 'Cerrar sesión' })}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Right: Single strip – optional rightContent (e.g. Layers) + theme + language, icon-only to avoid crowding */}
            <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
                {rightContent}
                <div className={`rounded-xl ${glassStyles.base} p-1.5 flex items-center gap-2`}>
                    <ThemeToggle variant="default" />
                    <LanguageSelector variant="iconOnly" />
                </div>
            </div>
        </>
    );
};

export default ViewerHeader;
