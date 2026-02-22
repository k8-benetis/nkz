// =============================================================================
// 500 Server Error Page
// =============================================================================

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { AlertTriangle, ArrowLeft, Home, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface ServerErrorProps {
  error?: Error;
  resetError?: () => void;
}

export const ServerError: React.FC<ServerErrorProps> = ({ error, resetError }) => {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <Layout hideBreadcrumb>
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-2xl">
          {/* Icon */}
          <div className="mb-8 flex justify-center">
            <div className="p-6 bg-orange-100 rounded-full">
              <AlertTriangle className="w-16 h-16 text-orange-600" />
            </div>
          </div>

          {/* Error Message */}
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Error del servidor
          </h1>
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">
            500 - Internal Server Error
          </h2>
          <p className="text-lg text-gray-600 mb-2">
            Algo salió mal en el servidor. Estamos trabajando para solucionarlo.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Por favor, inténtalo de nuevo en unos momentos.
          </p>

          {/* Error Details (if provided) */}
          {error && (
            <div className="mb-8 text-left">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center justify-between w-full px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium text-gray-700"
              >
                <span>Ver detalles del error</span>
                {showDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {showDetails && (
                <div className="mt-2 p-4 bg-gray-50 rounded-lg text-xs font-mono text-gray-600 overflow-auto max-h-48">
                  <div className="mb-2">
                    <strong>Mensaje:</strong> {error.message}
                  </div>
                  {error.stack && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap">{error.stack}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {resetError && (
              <button
                onClick={resetError}
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Reintentar
              </button>
            )}
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Volver atrás
            </button>
            <Link
              to="/dashboard"
              className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Home className="w-5 h-5 mr-2" />
              Ir al Dashboard
            </Link>
          </div>

          {/* Help */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Si el problema persiste, contacta con{' '}
              <a href={`mailto:${(window as any).__ENV__?.SUPPORT_EMAIL || 'support'}`} className="text-green-600 hover:text-green-700">
                soporte técnico
              </a>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

