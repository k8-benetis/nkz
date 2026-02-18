import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/KeycloakAuthContext';
import { logger } from '@/utils/logger';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
  requireTenant?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles = [],
  requireTenant = false
}) => {
  const { isAuthenticated, isLoading, user, login, logout } = useAuth();
  const location = useLocation();
  const [loadingTimeout, setLoadingTimeout] = React.useState(false);

  // Si estamos en medio del callback (hash con code/error), no redirigir; dejar que init procese
  const isCallback = typeof window !== 'undefined' && (
    window.location.hash.includes('code=') ||
    window.location.hash.includes('error=') ||
    window.location.search.includes('code=') ||
    window.location.search.includes('error=')
  );

  // CRÍTICO: Si hay token en sessionStorage pero isAuthenticated es false, puede ser que esté procesando
  // Esperar un momento antes de redirigir
  const hasStoredToken = typeof window !== 'undefined' && sessionStorage.getItem('auth_token');
  const [hasCheckedAuth, setHasCheckedAuth] = React.useState(false);

  // Timeout para evitar cuelgues infinitos (30 segundos máximo)
  React.useEffect(() => {
    if (isLoading || isCallback) {
      const timeout = setTimeout(() => {
        logger.warn('[ProtectedRoute] Loading timeout - forcing state update');
        setLoadingTimeout(true);
      }, 30000); // 30 segundos máximo

      return () => clearTimeout(timeout);
    } else {
      setLoadingTimeout(false);
    }
  }, [isLoading, isCallback]);

  // Si hay token almacenado pero no está autenticado, dar tiempo para que se procese
  React.useEffect(() => {
    if (hasStoredToken && !isAuthenticated && !isLoading && !isCallback) {
      const checkTimeout = setTimeout(() => {
        logger.debug('[ProtectedRoute] Token encontrado pero no autenticado después de esperar');
        setHasCheckedAuth(true);
      }, 1000); // Esperar 1 segundo para que se procese el token

      return () => clearTimeout(checkTimeout);
    } else if (isAuthenticated) {
      setHasCheckedAuth(true);
    }
  }, [hasStoredToken, isAuthenticated, isLoading, isCallback]);

  // During callback or loading, show spinner but don't check tenant yet
  // Pero si hay timeout, continuar con la verificación de autenticación
  if ((isLoading || isCallback) && !loadingTimeout) {
    logger.debug('[ProtectedRoute] Loading or callback, showing spinner. Location:', location.pathname, 'isLoading:', isLoading, 'isCallback:', isCallback);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  // Si hay token almacenado pero aún no está autenticado, esperar un poco más
  if (hasStoredToken && !isAuthenticated && !hasCheckedAuth) {
    logger.debug('[ProtectedRoute] Token encontrado, esperando procesamiento...');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Usar el adaptador de Keycloak para manejar PKCE correctamente
    logger.debug('[ProtectedRoute] Not authenticated, redirecting to login. Location:', location.pathname, 'hasStoredToken:', hasStoredToken);
    login();
    return null;
  }

  // CRÍTICO: Si requireTenant pero el usuario aún no se ha cargado (user es null),
  // esperar un momento antes de verificar el tenant
  // Esto evita que se muestre el error de "Tenant required" cuando el usuario se está cargando
  if (requireTenant) {
    // Si el usuario es null pero estamos autenticados, puede que se esté cargando
    // Esperar un momento antes de verificar el tenant
    if (!user && isAuthenticated) {
      logger.debug('[ProtectedRoute] Usuario autenticado pero user aún no cargado, esperando...');
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando información de usuario...</p>
          </div>
        </div>
      );
    }

    // Solo verificar tenant si el usuario está cargado Y no tiene tenant
    if (user && !user.tenant) {
      logger.debug('[ProtectedRoute] Tenant required but user has no tenant. Location:', location.pathname, 'User:', user);
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md mx-auto p-8 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Tenant Required
            </h2>
            <p className="text-gray-600 mb-6">
              You need to be assigned to a tenant to access this resource. Please contact your administrator.
            </p>
            <button
              onClick={() => {
                // Cerrar sesión de Keycloak para forzar un nuevo login con token actualizado
                logout();
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              Cerrar Sesión y Reintentar
            </button>
          </div>
        </div>
      );
    }
  }

  if (requiredRoles.length > 0) {
    const userRoles = user?.roles || [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      logger.debug('[ProtectedRoute] User does not have required role. Location:', location.pathname, 'User roles:', userRoles, 'Required:', requiredRoles);
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Access Denied
            </h2>
            <p className="text-gray-600">
              You don't have the required permissions to access this resource.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Required roles: {requiredRoles.join(', ')}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Your roles: {userRoles.join(', ')}
            </p>
          </div>
        </div>
      );
    }
  }

  logger.debug('[ProtectedRoute] Access granted. Location:', location.pathname, 'User:', user?.email, 'Tenant:', user?.tenant);
  return <>{children}</>;
};

// Specific route components for different access levels
// AdminRoute: Only PlatformAdmin can access system administration
export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute requiredRoles={['PlatformAdmin']}>
    {children}
  </ProtectedRoute>
);

export const TechnicalConsultantRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute requiredRoles={['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant']} requireTenant>
    {children}
  </ProtectedRoute>
);

// Legacy alias for backward compatibility (deprecated, use TechnicalConsultantRoute)
export const DeviceManagerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TechnicalConsultantRoute>
    {children}
  </TechnicalConsultantRoute>
);

export const FarmerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute requiredRoles={['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant', 'Farmer']} requireTenant>
    {children}
  </ProtectedRoute>
);

// ModulesRoute: TenantAdmin, TechnicalConsultant, and PlatformAdmin can manage modules
export const ModulesRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute requiredRoles={['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant']} requireTenant>
    {children}
  </ProtectedRoute>
);
