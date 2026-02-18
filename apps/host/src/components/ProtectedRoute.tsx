// =============================================================================
// Protected Route Component
// =============================================================================

import React from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Fire-and-forget: start the login flow and render nothing while redirecting
    login().catch(err => {
      // If login fails, log and stay on a minimal page to allow user to retry manually
       
      console.error('[ProtectedRoute] Login initiation failed', err);
      window.location.href = '/login';
    });
    return null;
  }

  return <>{children}</>;
};
