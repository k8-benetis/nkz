// =============================================================================
// Platform API Credentials Management Component
// =============================================================================
// Manages platform-wide API credentials (Copernicus CDSE, AEMET, etc.)
// These are stored in Kubernetes secrets and synchronized with database

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';
import {
  Key,
  Save,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Globe,
  Cloud,
  ExternalLink,
  Info
} from 'lucide-react';

interface CopernicusCredentials {
  username: string;
  password: string;
  url: string;
  configured: boolean;
}

interface AemetCredentials {
  api_key: string;
  url: string;
  configured: boolean;
}

export const PlatformApiCredentials: React.FC = () => {
  const { user, getToken } = useAuth();
  const [copernicus, setCopernicus] = useState<CopernicusCredentials>({
    username: '',
    password: '',
    url: 'https://dataspace.copernicus.eu',
    configured: false
  });
  const [aemet, setAemet] = useState<AemetCredentials>({
    api_key: '',
    url: 'https://opendata.aemet.es/opendata/api',
    configured: false
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isPlatformAdmin = user?.roles?.includes('PlatformAdmin');

  useEffect(() => {
    if (isPlatformAdmin) {
      loadCredentials();
    }
  }, [isPlatformAdmin]);

  const loadCredentials = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      
      // Load Copernicus CDSE credentials
      const copernicusResponse = await api.get('/api/admin/platform-credentials/copernicus-cdse', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (copernicusResponse.data.configured) {
        setCopernicus({
          username: copernicusResponse.data.username || '',
          password: '', // Never show password
          url: copernicusResponse.data.url || 'https://dataspace.copernicus.eu',
          configured: true
        });
      }

      // Load AEMET credentials
      const aemetResponse = await api.get('/api/admin/platform-credentials/aemet', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (aemetResponse.data.configured) {
        setAemet({
          api_key: '', // Never show API key
          url: aemetResponse.data.url || 'https://opendata.aemet.es/opendata/api',
          configured: true
        });
      }
    } catch (err: any) {
      // 404 is OK - means credentials not configured yet
      if (err?.response?.status !== 404) {
        setError(err?.response?.data?.error || 'Error cargando credenciales');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCopernicus = async () => {
    if (!copernicus.username || !copernicus.password) {
      setError('Usuario y contraseña son requeridos para Copernicus CDSE');
      return;
    }

    try {
      setSaving(prev => ({ ...prev, copernicus: true }));
      setError(null);
      setSuccess(null);
      const token = getToken();

      await api.post('/api/admin/platform-credentials/copernicus-cdse', {
        username: copernicus.username,
        password: copernicus.password,
        url: copernicus.url
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSuccess('Credenciales de Copernicus CDSE guardadas correctamente');
      setCopernicus(prev => ({ ...prev, password: '', configured: true }));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error guardando credenciales de Copernicus CDSE');
    } finally {
      setSaving(prev => ({ ...prev, copernicus: false }));
    }
  };

  const handleSaveAemet = async () => {
    if (!aemet.api_key) {
      setError('API Key es requerida para AEMET');
      return;
    }

    try {
      setSaving(prev => ({ ...prev, aemet: true }));
      setError(null);
      setSuccess(null);
      const token = getToken();

      await api.post('/api/admin/platform-credentials/aemet', {
        api_key: aemet.api_key,
        url: aemet.url
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSuccess('Credenciales de AEMET guardadas correctamente');
      setAemet(prev => ({ ...prev, api_key: '', configured: true }));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error guardando credenciales de AEMET');
    } finally {
      setSaving(prev => ({ ...prev, aemet: false }));
    }
  };

  const togglePasswordVisibility = (field: string) => {
    setShowPassword(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  if (!isPlatformAdmin) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Acceso Denegado
          </h3>
          <p className="text-gray-600">
            Solo los administradores de plataforma pueden gestionar credenciales de APIs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Key className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Credenciales de APIs de Plataforma</h2>
              <p className="text-sm text-gray-600">
                Gestiona las credenciales para servicios externos usados por toda la plataforma
              </p>
            </div>
          </div>
          <button
            onClick={loadCredentials}
            disabled={loading}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Éxito</p>
              <p className="text-sm text-green-700">{success}</p>
            </div>
          </div>
        )}
      </div>

      {/* Copernicus CDSE Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Globe className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Copernicus CDSE</h3>
            <p className="text-sm text-gray-600">
              Credenciales OAuth para acceso a datos Sentinel-2 (usado por NDVI Worker)
            </p>
          </div>
          {copernicus.configured && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
              Configurado
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Obtener credenciales:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Regístrate en <a href="https://dataspace.copernicus.eu" target="_blank" rel="noopener noreferrer" className="underline">Copernicus Data Space Ecosystem</a></li>
                  <li>Crea un OAuth Client en tu perfil</li>
                  <li>Introduce el Client ID como usuario y el Client Secret como contraseña</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client ID (Usuario) *
              </label>
              <input
                type="text"
                value={copernicus.username}
                onChange={(e) => setCopernicus(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Tu Client ID de Copernicus CDSE"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client Secret (Contraseña) *
              </label>
              <div className="relative">
                <input
                  type={showPassword.copernicus ? 'text' : 'password'}
                  value={copernicus.password}
                  onChange={(e) => setCopernicus(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={copernicus.configured ? '•••••••• (dejar vacío para no cambiar)' : 'Tu Client Secret'}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required={!copernicus.configured}
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('copernicus')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword.copernicus ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL Base
              </label>
              <input
                type="url"
                value={copernicus.url}
                onChange={(e) => setCopernicus(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://dataspace.copernicus.eu"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveCopernicus}
              disabled={saving.copernicus || !copernicus.username || (!copernicus.password && !copernicus.configured)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving.copernicus ? 'Guardando...' : 'Guardar Credenciales'}
            </button>
          </div>
        </div>
      </div>

      {/* AEMET Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <Cloud className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">AEMET OpenData</h3>
            <p className="text-sm text-gray-600">
              API Key para acceso a datos meteorológicos oficiales (usado por Weather Worker)
            </p>
          </div>
          {aemet.configured && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
              Configurado
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Obtener API Key:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Regístrate en <a href="https://opendata.aemet.es" target="_blank" rel="noopener noreferrer" className="underline">AEMET OpenData</a></li>
                  <li>Solicita una API Key gratuita</li>
                  <li>Introduce la API Key aquí</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key *
              </label>
              <div className="relative">
                <input
                  type={showPassword.aemet ? 'text' : 'password'}
                  value={aemet.api_key}
                  onChange={(e) => setAemet(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder={aemet.configured ? '•••••••• (dejar vacío para no cambiar)' : 'Tu API Key de AEMET'}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required={!aemet.configured}
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('aemet')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword.aemet ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL Base
              </label>
              <input
                type="url"
                value={aemet.url}
                onChange={(e) => setAemet(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://opendata.aemet.es/opendata/api"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveAemet}
              disabled={saving.aemet || (!aemet.api_key && !aemet.configured)}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving.aemet ? 'Guardando...' : 'Guardar Credenciales'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

