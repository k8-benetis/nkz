// =============================================================================
// External API Credentials Management Component
// =============================================================================
// Manages credentials for external APIs (Sentinel Hub, AEMET, etc.)

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';
import {
  Key,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

interface ApiCredential {
  id: string;
  service_name: string;
  service_url: string;
  auth_type: 'api_key' | 'basic_auth' | 'bearer' | 'none';
  username?: string;
  password_encrypted?: string;
  api_key_encrypted?: string;
  additional_params?: Record<string, any>;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at?: string;
}

interface ApiCredentialForm {
  service_name: string;
  service_url: string;
  auth_type: 'api_key' | 'basic_auth' | 'bearer' | 'none';
  username?: string;
  password?: string;
  api_key?: string;
  additional_params?: Record<string, any>;
  description?: string;
  is_active: boolean;
}

export const ExternalApiCredentials: React.FC = () => {
  const { user, getToken } = useAuth();
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<ApiCredentialForm>({
    service_name: '',
    service_url: '',
    auth_type: 'api_key',
    username: '',
    password: '',
    api_key: '',
    description: '',
    is_active: true,
  });

  // Check if user is PlatformAdmin or TenantAdmin
  const isPlatformAdmin = user?.roles?.includes('PlatformAdmin');
  const isTenantAdmin = user?.roles?.includes('TenantAdmin');
  const canManageCredentials = isPlatformAdmin || isTenantAdmin;

  useEffect(() => {
    if (canManageCredentials) {
      loadCredentials();
    }
  }, [canManageCredentials]);

  const loadCredentials = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      const response = await api.get('/admin/external-api-credentials', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setCredentials(response.data.credentials || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error cargando credenciales');
      console.error('Error loading credentials:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setFormData({
      service_name: '',
      service_url: '',
      auth_type: 'api_key',
      username: '',
      password: '',
      api_key: '',
      description: '',
      is_active: true,
    });
    setEditingId(null);
    setShowForm(true);
  };

  const handleEdit = (credential: ApiCredential) => {
    setFormData({
      service_name: credential.service_name,
      service_url: credential.service_url,
      auth_type: credential.auth_type,
      username: credential.username || '',
      password: '', // Don't show encrypted password
      api_key: '', // Don't show encrypted API key
      description: credential.description || '',
      is_active: credential.is_active,
      additional_params: credential.additional_params || {},
    });
    setEditingId(credential.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      setError(null);
      setSuccess(null);
      const token = getToken();

      const payload: any = {
        service_name: formData.service_name,
        service_url: formData.service_url,
        auth_type: formData.auth_type,
        description: formData.description,
        is_active: formData.is_active,
        additional_params: formData.additional_params || {},
      };

      // Only include credentials if provided (for new or update)
      if (formData.auth_type === 'basic_auth') {
        if (formData.username) payload.username = formData.username;
        if (formData.password) payload.password = formData.password;
      } else if (formData.auth_type === 'api_key' || formData.auth_type === 'bearer') {
        if (formData.api_key) payload.api_key = formData.api_key;
      }

      if (editingId) {
        // Update
        await api.put(`/admin/external-api-credentials/${editingId}`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setSuccess('Credencial actualizada correctamente');
      } else {
        // Create
        await api.post('/admin/external-api-credentials', payload, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setSuccess('Credencial creada correctamente');
      }

      setShowForm(false);
      await loadCredentials();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error guardando credencial');
      console.error('Error saving credential:', err);
    }
  };

  const handleDelete = async (id: string, serviceName: string) => {
    if (!confirm(`¿Estás seguro de eliminar las credenciales de ${serviceName}?`)) {
      return;
    }

    try {
      setError(null);
      const token = getToken();
      await api.delete(`/admin/external-api-credentials/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setSuccess('Credencial eliminada correctamente');
      await loadCredentials();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error eliminando credencial');
      console.error('Error deleting credential:', err);
    }
  };

  const getAuthTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      api_key: 'API Key',
      basic_auth: 'Usuario/Contraseña',
      bearer: 'Bearer Token',
      none: 'Sin autenticación',
    };
    return labels[type] || type;
  };

  if (!canManageCredentials) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Acceso Denegado
          </h3>
          <p className="text-gray-600">
            Solo los administradores pueden gestionar credenciales de APIs externas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Key className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Credenciales de APIs Externas</h2>
            <p className="text-sm text-gray-600">
              Gestiona las credenciales para servicios externos (Sentinel Hub, AEMET, etc.)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadCredentials}
            disabled={loading}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nueva Credencial
          </button>
        </div>
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

      {showForm && (
        <div className="mb-6 p-6 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Editar Credencial' : 'Nueva Credencial'}
            </h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Servicio *
              </label>
              <input
                type="text"
                value={formData.service_name}
                onChange={(e) => setFormData({ ...formData, service_name: e.target.value })}
                placeholder="sentinel-hub, aemet, catastro"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Identificador único (ej: sentinel-hub, aemet)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL del Servicio *
              </label>
              <input
                type="url"
                value={formData.service_url}
                onChange={(e) => setFormData({ ...formData, service_url: e.target.value })}
                placeholder="https://services.sentinel-hub.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                URL base del servicio (sin autenticación)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Autenticación *
              </label>
              <select
                value={formData.auth_type}
                onChange={(e) => setFormData({ ...formData, auth_type: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="none">Sin autenticación</option>
                <option value="api_key">API Key</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic_auth">Usuario/Contraseña</option>
              </select>
            </div>

            {formData.auth_type === 'basic_auth' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usuario *
                  </label>
                  <input
                    type="text"
                    value={formData.username || ''}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="usuario"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    value={formData.password || ''}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {editingId ? 'Dejar vacío para no cambiar' : 'Obligatorio para nuevo'}
                  </p>
                </div>
              </>
            )}

            {(formData.auth_type === 'api_key' || formData.auth_type === 'bearer') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.auth_type === 'api_key' ? 'API Key' : 'Bearer Token'} *
                </label>
                <input
                  type="password"
                  value={formData.api_key || ''}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {editingId ? 'Dejar vacío para no cambiar' : 'Obligatorio para nuevo'}
                </p>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción del servicio y cómo obtener las credenciales"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">
                Activo (esta credencial se usará para autenticación)
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Guardar
            </button>
          </div>
        </div>
      )}

      {loading && !showForm ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-2">Cargando credenciales...</p>
        </div>
      ) : credentials.length === 0 ? (
        <div className="text-center py-8">
          <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No hay credenciales configuradas</p>
          <button
            onClick={handleCreate}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Crear Primera Credencial
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Servicio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Autenticación
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Último Uso
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {credentials.map((credential) => (
                <tr key={credential.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Key className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {credential.service_name}
                        </div>
                        {credential.description && (
                          <div className="text-xs text-gray-500">{credential.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">
                      {credential.service_url}
                    </div>
                    <a
                      href={credential.service_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {getAuthTypeLabel(credential.auth_type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {credential.is_active ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        Activo
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {credential.last_used_at
                      ? new Date(credential.last_used_at).toLocaleDateString('es-ES')
                      : 'Nunca'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(credential)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(credential.id, credential.service_name)}
                        className="text-red-600 hover:text-red-900"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

