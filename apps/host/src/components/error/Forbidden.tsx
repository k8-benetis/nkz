// =============================================================================
// 403 Forbidden Page - Access Denied
// =============================================================================

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Shield, ArrowLeft, Home, Lock } from 'lucide-react';

export const Forbidden: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Layout hideBreadcrumb>
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-2xl">
          {/* Icon */}
          <div className="mb-8 flex justify-center">
            <div className="p-6 bg-red-100 rounded-full">
              <Lock className="w-16 h-16 text-red-600" />
            </div>
          </div>

          {/* Error Message */}
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Acceso denegado
          </h1>
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">
            403 - Forbidden
          </h2>
          <p className="text-lg text-gray-600 mb-2">
            No tienes permisos para acceder a esta página.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Si crees que esto es un error, contacta con tu administrador.
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

          {/* Info */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <div className="flex items-center justify-center text-sm text-gray-500">
              <Shield className="w-4 h-4 mr-2" />
              <span>Tu cuenta no tiene los permisos necesarios para esta acción</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

