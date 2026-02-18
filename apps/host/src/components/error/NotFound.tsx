// =============================================================================
// 404 Not Found Page
// =============================================================================

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Home, ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Layout hideBreadcrumb>
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-2xl">
          {/* Large 404 Number */}
          <div className="mb-8">
            <h1 className="text-9xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-green-700">
              404
            </h1>
          </div>

          {/* Error Message */}
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Página no encontrada
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Lo sentimos, la página que buscas no existe o ha sido movida.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
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

          {/* Quick Links */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-4">Enlaces útiles:</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/dashboard" className="text-green-600 hover:text-green-700 text-sm">
                Dashboard
              </Link>
              <Link to="/entities" className="text-green-600 hover:text-green-700 text-sm">
                Entidades
              </Link>
              <Link to="/alerts" className="text-green-600 hover:text-green-700 text-sm">
                Alertas
              </Link>
              <Link to="/settings" className="text-green-600 hover:text-green-700 text-sm">
                Configuración
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

