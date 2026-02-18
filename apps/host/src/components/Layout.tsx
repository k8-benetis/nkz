import { useAuth } from '@/context/KeycloakAuthContext';
import { useI18n } from '@/context/I18nContext';
import { Navigation } from '@/components/Navigation';
import { CookieBanner } from '@/components/CookieBanner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingBar } from '@/components/loading/LoadingBar';
import { LogOut, User } from 'lucide-react';

export interface LayoutProps {
  children: React.ReactNode;
  fullWidth?: boolean;
  /** Hide breadcrumb navigation */
  hideBreadcrumb?: boolean;
  /** Custom breadcrumb items */
  breadcrumbItems?: Array<{ label: string; path: string }>;
  /** Additional CSS classes */
  className?: string;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  fullWidth = false,
  hideBreadcrumb = false,
  breadcrumbItems,
  className: _className = ''
}) => {
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 host-protected">
      {/* Global Loading Bar */}
      <LoadingBar />

      {/* Top Navigation (Header) */}
      <Navigation />

      {/* Main Content - Full Width */}
      <main className="w-full pt-6 flex-1 flex flex-col min-h-0">
        <div className={fullWidth ? "w-full px-0 flex-1" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex-1"}>
          {/* Breadcrumb Navigation */}
          {!hideBreadcrumb && (
            <div className={fullWidth ? "px-4 sm:px-6 lg:px-8" : ""}>
              <Breadcrumb items={breadcrumbItems} />
            </div>
          )}

          <div className={fullWidth ? "w-full" : ""}>
            {children}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-auto py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex justify-between items-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {t('layout.copyright')}
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <User className="w-4 h-4 mr-1" />
                  {user?.email}
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  {t('layout.logout')}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* Cookie Banner */}
      <CookieBanner />
    </div>
  );
};