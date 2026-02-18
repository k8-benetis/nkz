// =============================================================================
// Tenant User Management - Gestión de Usuarios y Asignación a Tenants
// =============================================================================
// Permite a PlatformAdmin ver todos los usuarios, asignarlos a tenants y borrarlos

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';
import {
  Users,
  Trash2,
  UserPlus,
  Search,
  Building2,
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  tenant_id?: string;
  groups: string[];
  roles: string[];
  createdTimestamp?: number;
}

interface Tenant {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
}

export const TenantUserManagement: React.FC = () => {
  const { user, keycloak } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [assignData, setAssignData] = useState({
    tenant_id: '',
    role: 'Farmer'
  });

  const isPlatformAdmin = user?.roles?.includes('PlatformAdmin') ?? false;

  useEffect(() => {
    if (isPlatformAdmin) {
      // Load tenants first, then users (sequential to avoid token race conditions)
      loadTenants().then(() => {
        // Small delay to ensure token is ready
        setTimeout(() => {
          loadUsers();
        }, 500);
      });
    }
  }, [isPlatformAdmin]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Ensure token is fresh before making request
      if (keycloak?.token) {
        try {
          // Check if token needs refresh (within 30 seconds)
          const decoded = JSON.parse(atob(keycloak.token.split('.')[1]));
          const exp = decoded.exp * 1000;
          const now = Date.now();
          const timeUntilExpiry = exp - now;
          
          if (timeUntilExpiry < 30000) {
            console.log('[UserManagement] Token expiring soon, refreshing...');
            await keycloak.updateToken(30);
            console.log('[UserManagement] Token refreshed');
          }
        } catch (e) {
          console.warn('[UserManagement] Error checking/refreshing token:', e);
        }
      }
      
      const response = await api.get('/api/admin/users');
      if (response.data?.success) {
        setUsers(response.data.users || []);
        setError(null);
      } else {
        throw new Error(response.data?.error || 'Error desconocido al cargar usuarios');
      }
    } catch (err: any) {
      console.error('Error loading users:', err);
      
      let errorMsg = 'Error desconocido';
      if (err.response) {
        const status = err.response.status;
        const data = err.response.data;
        
        if (status === 401) {
          errorMsg = 'No autorizado. Tu token puede haber expirado o no tienes el rol PlatformAdmin. Por favor, recarga la página e intenta de nuevo.';
        } else if (status === 403) {
          errorMsg = 'Acceso denegado. Se requiere el rol PlatformAdmin para listar usuarios.';
        } else if (status === 404) {
          errorMsg = 'Endpoint no encontrado. El servicio de administración puede no estar disponible.';
        } else if (status === 500) {
          errorMsg = data?.error || 'Error interno del servidor al cargar usuarios.';
        } else {
          errorMsg = data?.error || `Error ${status}: ${data?.message || 'Error desconocido'}`;
        }
      } else if (err.message) {
        errorMsg = err.message;
      }
      
      setError('Error cargando usuarios: ' + errorMsg);
      
      // If 401, token might be expired - try to refresh and retry once
      if (err.response?.status === 401 && keycloak) {
        try {
          console.log('[UserManagement] 401 error, attempting token refresh...');
          const refreshed = await keycloak.updateToken(30);
          if (refreshed) {
            console.log('[UserManagement] Token refreshed, retrying request...');
            // Retry the request
            try {
              const retryResponse = await api.get('/api/admin/users');
              if (retryResponse.data?.success) {
                setUsers(retryResponse.data.users || []);
                setError(null);
                return; // Success, exit early
              }
            } catch (retryErr) {
              console.error('[UserManagement] Retry failed:', retryErr);
            }
          }
        } catch (refreshErr) {
          console.error('[UserManagement] Token refresh failed:', refreshErr);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const loadTenants = async () => {
    try {
      const response = await api.get('/api/admin/tenants');
      const tenantsData = response.data.tenants || response.data || [];
      setTenants(tenantsData.map((t: any) => ({
        id: t.id || t.tenant_id,
        tenant_id: t.tenant_id || t.id,
        name: t.name || t.tenant_id,
        email: t.email || 'N/A'
      })));
    } catch (err: any) {
      console.error('Error loading tenants:', err);
    }
  };

  const handleAssignUser = async (user: User) => {
    setSelectedUser(user);
    setAssignData({ tenant_id: '', role: 'Farmer' });
    setShowAssignForm(true);
    setError(null);
  };

  const handleSubmitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !assignData.tenant_id) {
      setError('Selecciona un tenant');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await api.post(`/api/admin/tenants/${assignData.tenant_id}/users`, {
        email: selectedUser.email,
        role: assignData.role
      });

      if (response.data.success) {
        setSuccess(`Usuario ${selectedUser.email} asignado a tenant ${assignData.tenant_id}`);
        setShowAssignForm(false);
        setSelectedUser(null);
        setTimeout(() => setSuccess(null), 5000);
        loadUsers(); // Refresh list
      }
    } catch (err: any) {
      setError('Error asignando usuario: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`¿Estás seguro de que quieres borrar el usuario ${userEmail}? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await api.delete(`/api/admin/users/${userId}`);
      setSuccess(`Usuario ${userEmail} borrado correctamente`);
      setTimeout(() => setSuccess(null), 5000);
      loadUsers(); // Refresh list
    } catch (err: any) {
      setError('Error borrando usuario: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.email.toLowerCase().includes(searchLower) ||
      user.username?.toLowerCase().includes(searchLower) ||
      user.firstName?.toLowerCase().includes(searchLower) ||
      user.lastName?.toLowerCase().includes(searchLower) ||
      user.tenant_id?.toLowerCase().includes(searchLower)
    );
  });

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-600 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h1>
            <p className="text-gray-600">
              Solo los administradores de plataforma pueden acceder a esta sección.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h2>
            <p className="text-gray-600 mt-1">Ver, asignar y borrar usuarios de la plataforma</p>
          </div>
          <button
            onClick={loadUsers}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por email, nombre, username o tenant..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
          <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
          <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tenant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Roles
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{user.email}</div>
                      <div className="text-sm text-gray-500">
                        {user.firstName || ''} {user.lastName || ''}
                        {user.username && user.username !== user.email && ` (@${user.username})`}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.tenant_id ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <Building2 className="w-3 h-3 mr-1" />
                        {user.tenant_id}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Sin tenant</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <span
                          key={role}
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            role === 'PlatformAdmin'
                              ? 'bg-purple-100 text-purple-800'
                              : role === 'TenantAdmin'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.enabled ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleAssignUser(user)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Asignar a tenant"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        className="text-red-600 hover:text-red-900"
                        title="Borrar usuario"
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

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">
              {searchTerm ? 'No se encontraron usuarios' : 'No hay usuarios'}
            </p>
          </div>
        )}
      </div>

      {/* Assign User Modal */}
      {showAssignForm && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Asignar Usuario a Tenant
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Usuario: <strong>{selectedUser.email}</strong>
            </p>

            <form onSubmit={handleSubmitAssign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tenant *
                </label>
                <select
                  value={assignData.tenant_id}
                  onChange={(e) => setAssignData({ ...assignData, tenant_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Seleccionar tenant --</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.tenant_id}>
                      {tenant.name} ({tenant.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rol *
                </label>
                <select
                  value={assignData.role}
                  onChange={(e) => setAssignData({ ...assignData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="Farmer">Farmer</option>
                  <option value="TenantAdmin">TenantAdmin</option>
                  <option value="TechnicalConsultant">TechnicalConsultant</option>
                </select>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center">
                  <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignForm(false);
                    setSelectedUser(null);
                    setError(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !assignData.tenant_id}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Asignando...' : 'Asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


