// =============================================================================
// Grafana Access Component
// =============================================================================
// Component to access Grafana for tenant-specific monitoring

import React, { useState } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import { BarChart3, ExternalLink, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import api from '@/services/api';
import { getConfig } from '@/config/environment';

interface GrafanaAccessProps {
  embedded?: boolean;
  height?: string;
}

const config = getConfig();

export const GrafanaAccess: React.FC<GrafanaAccessProps> = ({ 
  embedded = false, 
  height = '600px' 
}) => {
  const { user, getToken } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [membershipGranted, setMembershipGranted] = useState<boolean | null>(null);
  
  const handleOpenGrafana = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const token = getToken();
      if (!token) {
        console.warn('[GrafanaAccess] No token available, user may need to login again');
        setError('No se pudo obtener el token de autenticación');
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.getGrafanaLink();
        if (!response?.url) {
          throw new Error('Respuesta incompleta del backend');
        }
        const destination = response.url;
        setLastLink(destination);
        setMembershipGranted(Boolean(response.membershipGranted));
        window.open(destination, '_blank', 'noopener,noreferrer');
        setTimeout(() => {
          setIsLoading(false);
        }, 300);
      } catch (apiError: any) {
        console.error('[GrafanaAccess] Backend grafana link error:', apiError);
        const message = apiError?.response?.data?.error || apiError?.message || 'No se pudo preparar el acceso a Grafana.';
        setError(message);
        const fallbackUrl = config.external.grafanaUrl
          ? `${config.external.grafanaUrl.replace(/\/$/, '')}/login/generic_oauth`
          : '/grafana/login/generic_oauth';
        setLastLink(fallbackUrl);
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('[GrafanaAccess] Error opening Grafana:', err);
      setError('Error al abrir Grafana');
      setIsLoading(false);
    }
  };

  // Embedded view (iframe) - Note: iframe may not work with OAuth SSO due to same-origin policy
  // It's recommended to use the button view instead
  if (embedded) {
    console.log('[GrafanaAccess] Rendering embedded view', { user: user?.email, tenant: user?.tenant });
    return (
      <div className="w-full h-full border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-600" />
            <span className="font-medium text-gray-700">Grafana Analytics</span>
            {user?.tenant && (
              <span className="text-xs text-gray-500">(Tenant: {user.tenant})</span>
            )}
          </div>
          <a
            href={lastLink || config.external.grafanaUrl || '/grafana'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            onClick={(e) => {
              e.preventDefault();
              handleOpenGrafana();
            }}
          >
            <ExternalLink className="w-4 h-4" />
            Abrir en nueva ventana
          </a>
        </div>
        <div className="p-4 text-center text-gray-500">
          <p className="mb-2">⚠️ Vista embebida limitada por autenticación OAuth</p>
          <p className="text-sm mb-4">Se recomienda abrir Grafana en una nueva ventana para mejor experiencia</p>
          <button
            onClick={handleOpenGrafana}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Abrir Grafana en nueva ventana
          </button>
        </div>
      </div>
    );
  }

  // Button view (recommended - opens in new tab)
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Analíticas y Monitoreo
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Accede a Grafana para visualizar métricas detalladas, dashboards personalizados 
            y análisis avanzados de tus robots y sensores.
            {user?.tenant && (
              <span className="block mt-1 text-xs text-gray-500">
                Tu organización: {user.tenant}
              </span>
            )}
          </p>
          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
          {membershipGranted && (
            <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Acceso verificado para tu organización en Grafana.
            </div>
          )}
          <button
            onClick={handleOpenGrafana}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Abriendo...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4" />
                Abrir Grafana
                <ExternalLink className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
        <div className="ml-6">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-12 h-12 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
};

