// =============================================================================
// Grafana Embedded Page
// =============================================================================
// Page to display Grafana embedded in a tab within the dashboard

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import { Layout } from '@/components/Layout';
import { BarChart3, ExternalLink, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '@/services/api';
import { getConfig } from '@/config/environment';

const config = getConfig();

export const GrafanaEmbedded: React.FC = () => {
  const { user: _user, getToken, hasAnyRole } = useAuth();
  
  // Check if user can edit Grafana (TechnicalConsultant or higher)
  // Farmer can only view dashboards in read-only mode
  const canEditGrafana = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant']);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grafanaUrl, setGrafanaUrl] = useState<string | null>(null);
  const [membershipGranted, setMembershipGranted] = useState<boolean | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [_retryCount, setRetryCount] = useState(0);

  const loadGrafanaLink = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = getToken();
      if (!token) {
        throw new Error('No se pudo obtener el token de autenticación');
      }

      const response = await api.getGrafanaLink();
      if (!response?.url) {
        throw new Error('Respuesta incompleta del backend');
      }

      setGrafanaUrl(response.url);
      setMembershipGranted(Boolean(response.membershipGranted));
      setIsLoading(false);
    } catch (apiError: any) {
      console.error('[GrafanaEmbedded] Error loading Grafana link:', apiError);
      const message = apiError?.response?.data?.error || apiError?.message || 'No se pudo cargar Grafana.';
      setError(message);
      
      // Fallback to generic Grafana URL
      const fallbackUrl = config.external.grafanaUrl
        ? `${config.external.grafanaUrl.replace(/\/$/, '')}/login/generic_oauth`
        : '/grafana/login/generic_oauth';
      setGrafanaUrl(fallbackUrl);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGrafanaLink();
  }, []);

  const handleRefresh = () => {
    setRetryCount(prev => prev + 1);
    loadGrafanaLink();
  };

  const handleOpenInNewTab = () => {
    if (grafanaUrl) {
      window.open(grafanaUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Handle iframe load errors
  const handleIframeError = () => {
    console.warn('[GrafanaEmbedded] Iframe load error, may be due to OAuth restrictions');
    setError('No se pudo cargar Grafana en el iframe. Por favor, abre Grafana en una nueva ventana.');
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Analíticas y Monitoreo</h1>
                <p className="text-sm text-gray-600">
                  {canEditGrafana 
                    ? 'Visualiza y gestiona métricas detalladas y dashboards personalizados de tus robots y sensores'
                    : 'Visualiza métricas detalladas y dashboards de tus robots y sensores (solo lectura)'}
                </p>
                {!canEditGrafana && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⓘ Modo solo lectura. Contacta con un administrador para crear o editar dashboards.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
              <button
                onClick={handleOpenInNewTab}
                disabled={!grafanaUrl}
                className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir en nueva ventana
              </button>
            </div>
          </div>

          {error && !error.includes('401') && !error.includes('Request failed with status code 401') && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {membershipGranted && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              ✓ Acceso verificado para tu organización en Grafana
            </div>
          )}
        </div>

        {/* Grafana iframe */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ height: 'calc(100vh - 250px)', minHeight: '600px' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600">Cargando Grafana...</p>
              </div>
            </div>
          ) : grafanaUrl ? (
            <iframe
              ref={iframeRef}
              src={canEditGrafana ? grafanaUrl : `${grafanaUrl}${grafanaUrl.includes('?') ? '&' : '?'}view-only=true`}
              className="w-full h-full border-0"
              title="Grafana Analytics"
              onError={handleIframeError}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              // Note: Some browsers may block iframe with OAuth due to X-Frame-Options header
              // If this happens, the user should use "Open in new tab" button
              // Note: view-only=true parameter is passed to Grafana for read-only mode (Farmer role)
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No se pudo cargar Grafana</p>
                <button
                  onClick={handleRefresh}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Nota:</strong> Si Grafana no se carga en el iframe (debido a restricciones de seguridad del navegador),
            puedes usar el botón "Abrir en nueva ventana" para acceder a Grafana directamente.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default GrafanaEmbedded;

