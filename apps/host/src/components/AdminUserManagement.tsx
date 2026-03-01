// =============================================================================
// Admin User Management - Gestión de Códigos de Activación para PlatformAdmin
// =============================================================================
// Permite crear códigos de activación NEK-XXXX que se envían por email
// Los usuarios se registran después en /register usando esos códigos
// También muestra la API-KEY del admin actual y permite crear API-KEYS para tenants existentes

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';
import {
  Users,
  Plus,
  Key,
  Eye,
  EyeOff,
  Copy,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface AdminApiKey {
  id: string;
  tenant: string;
  name: string;
  api_key: string;
  created_at: string;
  is_active: boolean;
}

interface ActivationCode {
  id: string;
  code: string;
  email: string;
  plan: string;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  expires_at: string;
  created_at: string;
  limits: {
    max_users: number;
    max_robots: number;
    max_sensors: number;
  };
}

interface CreateActivationCodeRequest {
  email: string;
  plan: 'basic' | 'premium' | 'enterprise';
  duration_days: number;
  notes?: string;
}

interface Tenant {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  plan: string;
  created_at: string;
}

export const AdminUserManagement: React.FC = () => {
  const { user, getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [adminApiKey, setAdminApiKey] = useState<AdminApiKey | null>(null);
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [showCreateCodeForm, setShowCreateCodeForm] = useState(false);
  const [showCreateApiKeyForm, setShowCreateApiKeyForm] = useState(false);
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [newCode, setNewCode] = useState<CreateActivationCodeRequest>({
    email: '',
    plan: 'basic',
    duration_days: 30,
    notes: ''
  });
  
  const [newApiKey, setNewApiKey] = useState({
    tenant_id: '',
    description: ''
  });

  useEffect(() => {
    loadAdminApiKey();
    loadActivationCodes();
    loadTenants();
  }, []);

  const loadAdminApiKey = async () => {
    try {
      setLoading(true);
      // Obtener API-KEY del admin actual
      const token = getToken() || '';
      const response = await api.get('/api/admin/api-keys', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Asegurar que response.data sea un array
      const keysArray = Array.isArray(response.data) ? response.data : 
                       (response.data?.api_keys ? response.data.api_keys : []);
      
      // Filtrar por tenant del admin o usar la primera
      const adminKey = keysArray.find((key: any) => 
        key?.tenant === user?.tenant || key?.tenant === 'admin' || key?.tenant === 'platform'
      ) || keysArray[0];
      
      if (adminKey && adminKey.api_key) {
        setAdminApiKey(adminKey);
      } else {
        setAdminApiKey(null);
      }
    } catch (err: any) {
      console.error('Error loading admin API key:', err);
      // Si no existe, intentar crear una
      if (err.response?.status === 404) {
        await createAdminApiKey();
      }
    } finally {
      setLoading(false);
    }
  };

  const createAdminApiKey = async () => {
    try {
      const token = getToken() || '';
      const response = await api.post('/api/admin/api-keys', {
        tenant: user?.tenant || 'admin',
        name: `API Key for ${user?.email}`,
        description: `Admin API key for ${user?.name || user?.email}`
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setAdminApiKey(response.data);
      setSuccess('API-KEY del admin creada correctamente');
    } catch (err: any) {
      setError('Error creando API-KEY del admin: ' + (err.response?.data?.error || err.message));
    }
  };

  const loadActivationCodes = async () => {
    try {
      const token = getToken() || '';
      const response = await api.get('/webhook/admin/codes', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      // Manejar diferentes formatos de respuesta
      const codes = Array.isArray(response.data) 
        ? response.data 
        : (response.data?.codes || response.data?.data || []);
      setActivationCodes(Array.isArray(codes) ? codes : []);
    } catch (err: any) {
      console.error('Error loading activation codes:', err);
      // Intentar endpoint alternativo sin autenticación
      try {
        const altResponse = await api.get('/webhook/admin/codes');
        const codes = Array.isArray(altResponse.data) 
          ? altResponse.data 
          : (altResponse.data?.codes || altResponse.data?.data || []);
        setActivationCodes(Array.isArray(codes) ? codes : []);
      } catch (altErr) {
        console.error('Alternative endpoint also failed:', altErr);
        // Dejar array vacío en lugar de mostrar error
        setActivationCodes([]);
      }
    }
  };

  const loadTenants = async () => {
    try {
      const token = getToken() || '';
      const response = await api.get('/api/admin/tenants', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      // Transform data to match expected format
      const tenantsData = response.data.tenants || response.data || [];
      setTenants(tenantsData.map((t: any) => ({
        id: t.id || t.tenant,
        tenant_id: t.tenant || t.tenant_id || t.id,
        name: t.name || t.tenant || 'Sin nombre',
        email: t.email || 'N/A',
        plan: t.plan || 'basic',
        created_at: t.created_at || t.id
      })));
    } catch (err: any) {
      console.error('Error loading tenants:', err);
      // Try alternative endpoint
      try {
        const altResponse = await api.get('/admin/tenants', {
          headers: {
            'Authorization': `Bearer ${getToken() || ''}`
          }
        });
        const tenantsData = altResponse.data.tenants || altResponse.data || [];
        setTenants(tenantsData.map((t: any) => ({
          id: t.id || t.tenant,
          tenant_id: t.tenant || t.tenant_id || t.id,
          name: t.name || t.tenant || 'Sin nombre',
          email: t.email || 'N/A',
          plan: t.plan || 'basic',
          created_at: t.created_at || t.id
        })));
      } catch (altErr) {
        console.error('Alternative endpoint also failed:', altErr);
      }
    }
  };

  const handleCreateActivationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.email) {
      setError('Email es requerido');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const tokenForWebhook = getToken() || '';
      
      // Intentar primero con /webhook/admin/generate-code
      let response;
      try {
        response = await api.post('/webhook/admin/generate-code', {
          email: newCode.email,
          plan: newCode.plan,
          duration_days: newCode.duration_days,
          notes: newCode.notes || `Generated by admin for ${newCode.email}`
        }, {
          headers: {
            'Authorization': `Bearer ${tokenForWebhook}`
          }
        });
      } catch (webhookErr: any) {
        // Si falla, intentar con /admin/generate-code
        if (webhookErr.response?.status === 404) {
          response = await api.post('/admin/generate-code', {
            email: newCode.email,
            plan: newCode.plan,
            duration_days: newCode.duration_days,
            notes: newCode.notes || `Generated by admin for ${newCode.email}`
          }, {
            headers: {
              'Authorization': `Bearer ${tokenForWebhook}`
            }
          });
        } else {
          throw webhookErr;
        }
      }

      if (response.data.success || response.data.code) {
        const code = response.data.code || 'generado';
        setSuccess(`✅ Código de activación ${code} generado y enviado por email a ${newCode.email}`);
        setNewCode({
          email: '',
          plan: 'basic',
          duration_days: 30,
          notes: ''
        });
        setShowCreateCodeForm(false);
        setTimeout(() => setSuccess(null), 5000);
        loadActivationCodes(); // Refresh list
      } else {
        setError('Error generando código de activación');
      }
    } catch (err: any) {
      setError('Error creando código de activación: ' + (err.response?.data?.error || err.message));
      console.error('Error creating activation code:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApiKey.tenant_id) {
      setError('Selecciona un tenant');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getToken() || '';
      const response = await api.post('/api/admin/api-keys', {
        tenant: newApiKey.tenant_id,
        name: `API Key for ${newApiKey.tenant_id}`,
        description: newApiKey.description || `Generated for tenant ${newApiKey.tenant_id}`
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data?.api_key) {
        const apiKey = response.data.api_key;
        setSuccess(`API-KEY generada: ${apiKey.substring ? apiKey.substring(0, 16) : apiKey}...`);
        setNewApiKey({ tenant_id: '', description: '' });
        setShowCreateApiKeyForm(false);
        loadAdminApiKey(); // Refresh admin key list
      } else {
        setError('Error: La respuesta no contiene api_key');
      }
    } catch (err: any) {
      setError('Error creando API-KEY: ' + (err.response?.data?.error || err.message));
      console.error('Error creating API key:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copiado al portapapeles');
    setTimeout(() => setSuccess(null), 2000);
  };

  const revokeActivationCode = async (codeId: string) => {
    try {
      const token = getToken() || '';
      await api.delete(`/webhook/admin/codes/${codeId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setSuccess('Código revocado correctamente');
      loadActivationCodes();
    } catch (err: any) {
      console.error('Error revoking code:', err);
      // Try alternative endpoint
      try {
        const altToken = getToken() || '';
        await api.delete(`/api/webhook/admin/codes/${codeId}`, {
          headers: {
            'Authorization': `Bearer ${altToken}`
          }
        });
        setSuccess('Código revocado correctamente');
        loadActivationCodes();
      } catch (altErr: any) {
        setError('Error revocando código: ' + (altErr.response?.data?.error || altErr.message || 'Endpoint no disponible'));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin API-KEY Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Key className="h-6 w-6 text-blue-600 mr-3" />
            <h2 className="text-lg font-semibold text-gray-900">Mi API-KEY</h2>
          </div>
          {adminApiKey && (
            <button
              onClick={loadAdminApiKey}
              disabled={loading}
              className="p-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 rounded-md hover:bg-gray-100"
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {adminApiKey && adminApiKey.api_key ? (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-1">Tenant: {adminApiKey.tenant || 'N/A'}</p>
                <code className="text-sm font-mono bg-white px-3 py-2 rounded border border-gray-200 block">
                  {showAdminKey 
                    ? adminApiKey.api_key 
                    : `${adminApiKey.api_key.substring(0, 16)}...${adminApiKey.api_key.substring(adminApiKey.api_key.length - 8)}`
                  }
                </code>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => setShowAdminKey(!showAdminKey)}
                  className="p-2 text-gray-600 hover:text-gray-900"
                  title={showAdminKey ? 'Ocultar' : 'Mostrar'}
                >
                  {showAdminKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => copyToClipboard(adminApiKey.api_key)}
                  className="p-2 text-gray-600 hover:text-gray-900"
                  title="Copiar"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Creada: {new Date(adminApiKey.created_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 mb-2">
              No tienes una API-KEY. Crea una para hacer pruebas y recopilar datos.
            </p>
            <button
              onClick={createAdminApiKey}
              disabled={loading}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
            >
              Crear Mi API-KEY
            </button>
          </div>
        )}
      </div>

      {/* Create Activation Code Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Users className="h-6 w-6 text-blue-600 mr-3" />
            <h2 className="text-lg font-semibold text-gray-900">Códigos de Activación</h2>
          </div>
          <button
            onClick={() => {
              setShowCreateCodeForm(!showCreateCodeForm);
              setError(null);
              setSuccess(null);
            }}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            {showCreateCodeForm ? 'Cancelar' : 'Generar Código NEK'}
          </button>
        </div>

        {showCreateCodeForm && (
          <form onSubmit={handleCreateActivationCode} className="space-y-4 mt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Flujo:</strong> Genera un código → Se envía por email → El usuario se registra en <code className="bg-blue-100 px-1 rounded">/register</code> → Se crea el tenant automáticamente
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email del Usuario *
                </label>
                <input
                  type="email"
                  value={newCode.email}
                  onChange={(e) => setNewCode({...newCode, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="usuario@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plan *
                </label>
                <select
                  value={newCode.plan}
                  onChange={(e) => setNewCode({...newCode, plan: e.target.value as any})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="basic">Basic (1 usuario, 3 robots, 10 sensores)</option>
                  <option value="premium">Premium (5 usuarios, 10 robots, 50 sensores)</option>
                  <option value="enterprise">Enterprise (Ilimitado)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duración (días) *
                </label>
                <input
                  type="number"
                  value={newCode.duration_days}
                  onChange={(e) => setNewCode({...newCode, duration_days: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="365"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <input
                  type="text"
                  value={newCode.notes}
                  onChange={(e) => setNewCode({...newCode, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Cliente VIP, Pago #12345"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center">
                <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateCodeForm(false);
                  setError(null);
                  setNewCode({
                    email: '',
                    plan: 'basic',
                    duration_days: 30,
                    notes: ''
                  });
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !newCode.email}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Generando...' : 'Generar Código y Enviar Email'}
              </button>
            </div>
          </form>
        )}

        {/* Activation Codes List */}
        {activationCodes.length > 0 && (
          <div className="mt-6">
            <h3 className="text-md font-semibold text-gray-900 mb-3">Códigos Generados</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {activationCodes.map((code) => (
                    <tr key={code.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                          {code.code}
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{code.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          code.plan === 'enterprise' ? 'bg-purple-100 text-purple-800' :
                          code.plan === 'premium' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {code.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          code.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          code.status === 'active' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {code.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {code.status === 'pending' && (
                          <button
                            onClick={() => revokeActivationCode(code.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Revocar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create API-KEY for Existing Tenant */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Key className="h-6 w-6 text-orange-600 mr-3" />
            <h2 className="text-lg font-semibold text-gray-900">API-KEYS para Tenants</h2>
          </div>
          <button
            onClick={() => {
              setShowCreateApiKeyForm(!showCreateApiKeyForm);
              setError(null);
              setSuccess(null);
            }}
            className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            {showCreateApiKeyForm ? 'Cancelar' : 'Crear API-KEY'}
          </button>
        </div>

        {showCreateApiKeyForm && (
          <form onSubmit={handleCreateApiKey} className="space-y-4 mt-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-800">
                <strong>Nota:</strong> Solo puedes crear API-KEYS para tenants que ya existen. Los tenants se crean cuando el usuario se registra en <code className="bg-orange-100 px-1 rounded">/register</code> usando un código de activación.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Seleccionar Tenant *
                </label>
                <select
                  value={newApiKey.tenant_id}
                  onChange={(e) => setNewApiKey({...newApiKey, tenant_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                >
                  <option value="">-- Seleccionar tenant --</option>
                  {tenants.map(tenant => (
                    <option key={tenant.id || tenant.tenant_id} value={tenant.tenant_id || tenant.id}>
                      {tenant.name || tenant.tenant_id} ({tenant.email})
                    </option>
                  ))}
                </select>
                {tenants.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No hay tenants disponibles. Los tenants se crean cuando los usuarios se registran.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción (opcional)
                </label>
                <input
                  type="text"
                  value={newApiKey.description}
                  onChange={(e) => setNewApiKey({...newApiKey, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: Sensores de Campo Norte"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center">
                <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateApiKeyForm(false);
                  setError(null);
                  setNewApiKey({ tenant_id: '', description: '' });
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !newApiKey.tenant_id}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50"
              >
                {loading ? 'Creando...' : 'Crear API-KEY'}
              </button>
            </div>
          </form>
        )}
      </div>


      {success && (
        <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg flex items-center">
          <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}
    </div>
  );
};

