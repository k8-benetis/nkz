// =============================================================================
// Tenant Management Component - Dynamic Tenant Creation Interface
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';
import {
  Users,
  Plus,
  Settings,
  Trash2,
  Eye,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Key,
  Network,
  Bot,
  Shield
} from 'lucide-react';
import { TenantGovernanceForm } from '@/pages/admin/tenants/TenantGovernanceForm';

interface Tenant {
  id: string;
  name: string;
  namespace: string;
  api_key?: string;
  ros2_configured: boolean;
  vpn_configured: boolean;
  created_at: string;
  status: 'active' | 'pending' | 'error';
  user_count: number;
  device_count: number;
  plan_type?: 'basic' | 'premium' | 'enterprise';
  contract_end_date?: string;
}

interface TenantStats {
  total_tenants: number;
  active_tenants: number;
  pending_tenants: number;
  total_users: number;
  total_devices: number;
}

export const TenantManagement: React.FC = () => {
  const { user } = useAuth();
  const { t: _t } = useI18n();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<TenantStats>({
    total_tenants: 0,
    active_tenants: 0,
    pending_tenants: 0,
    total_users: 0,
    total_devices: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [showGovernanceForm, setShowGovernanceForm] = useState(false);
  const [governanceTenantId, setGovernanceTenantId] = useState<string | null>(null);
  const [governanceTenantName, setGovernanceTenantName] = useState<string | null>(null);
  const [newTenant, setNewTenant] = useState({
    name: '',
    description: '',
    tenant_type: 'agricultural',
    email: '',
    plan: 'basic' as 'basic' | 'premium' | 'enterprise',
    password: ''
  });
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: ''
  });

  // Check if user has admin permissions
  const isAdmin = user?.roles?.includes('PlatformAdmin') || user?.roles?.includes('TenantAdmin');

  useEffect(() => {
    if (isAdmin) {
      loadTenants();
    }
  }, [isAdmin]);

  const loadTenants = async () => {
    try {
      setLoading(true);
      setError('');

      // Load tenant data from API
      const [tenantsResponse, statsResponse] = await Promise.allSettled([
        api.get('/api/admin/tenants'),
        api.get('/api/admin/tenants/stats').catch(() => null)
      ]);

      // If tenants endpoint returns data with plan_type, it will be included automatically

      if (tenantsResponse.status === 'fulfilled') {
        const tenantsData = tenantsResponse.value.data;
        setTenants(tenantsData.tenants || tenantsData || []);

        // Calculate stats from tenants if stats endpoint is not available
        if (statsResponse.status === 'rejected' || !statsResponse.value) {
          const tenantsList = tenantsData.tenants || tenantsData || [];
          setStats({
            total_tenants: tenantsList.length,
            active_tenants: tenantsList.filter((t: Tenant) => t.status === 'active').length,
            pending_tenants: tenantsList.filter((t: Tenant) => t.status === 'pending').length,
            total_users: tenantsList.reduce((sum: number, t: Tenant) => sum + (t.user_count || 0), 0),
            total_devices: tenantsList.reduce((sum: number, t: Tenant) => sum + (t.device_count || 0), 0)
          });
        } else if (statsResponse.status === 'fulfilled' && statsResponse.value) {
          setStats(statsResponse.value.data || stats);
        }
      }
    } catch (err: any) {
      setError('Error loading tenant data');
      console.error('Error loading tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenant.name.trim()) return;

    try {
      setLoading(true);
      setError('');

      // Create tenant directly via admin API
      const response = await api.post('/api/admin/tenants', {
        tenant_name: newTenant.name,
        email: newTenant.email || '',
        plan: newTenant.plan || 'basic',
        password: newTenant.password || undefined
      });

      if (response.data.success) {
        setShowCreateForm(false);
        setNewTenant({ name: '', description: '', tenant_type: 'agricultural', email: '', plan: 'basic', password: '' });
        loadTenants(); // Refresh the list
        setError('');
      }
    } catch (err: any) {
      setError('Error creating tenant: ' + (err.response?.data?.error || err.message));
      console.error('Error creating tenant:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTenant = async (tenantId: string, tenantName?: string) => {
    const displayName = tenantName ? `${tenantName} (${tenantId})` : tenantId;
    if (!confirm(`¿Estás seguro de que quieres borrar el tenant ${displayName}? Esta acción no se puede deshacer y eliminará todos los recursos asociados.`)) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Delete tenant directly via admin API
      const response = await api.delete(`/api/admin/tenants/${tenantId}`);
      
      if (response.data?.success) {
        loadTenants(); // Refresh the list
        setError('');
        const warnings = response.data.warnings || [];
        if (warnings.length > 0) {
          alert(`Tenant ${displayName} eliminado con advertencias:\n${warnings.join('\n')}`);
        } else {
          alert(`Tenant ${displayName} eliminado exitosamente`);
        }
      } else {
        throw new Error(response.data?.error || 'Error desconocido al eliminar tenant');
      }
    } catch (err: any) {
      console.error('Error deleting tenant:', err);
      
      let errorMsg = 'Error desconocido';
      if (err.response) {
        const status = err.response.status;
        const data = err.response.data;
        
        if (status === 401) {
          errorMsg = 'No autorizado. Tu token puede haber expirado o no tienes el rol PlatformAdmin. Por favor, recarga la página e intenta de nuevo.';
        } else if (status === 403) {
          errorMsg = 'Acceso denegado. Se requiere el rol PlatformAdmin para eliminar tenants.';
        } else if (status === 404) {
          errorMsg = `Tenant '${tenantId}' no encontrado o el endpoint no está disponible.`;
        } else if (status === 500) {
          errorMsg = data?.error || 'Error interno del servidor al eliminar el tenant.';
        } else {
          errorMsg = data?.error || `Error ${status}: ${data?.message || 'Error desconocido'}`;
        }
      } else if (err.message) {
        errorMsg = err.message;
      }
      
      setError('Error borrando tenant: ' + errorMsg);
      alert('Error al borrar tenant: ' + errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant || !newUser.email || !newUser.password) return;

    try {
      setLoading(true);
      setError('');

      const response = await api.post(`/api/admin/tenants/${selectedTenant}/users`, {
        email: newUser.email,
        password: newUser.password,
        first_name: newUser.first_name,
        last_name: newUser.last_name
      });

      if (response.data.success) {
        setShowUserForm(false);
        setNewUser({ email: '', password: '', first_name: '', last_name: '' });
        setSelectedTenant(null);
        setError('');
        alert(`Usuario ${newUser.email} creado exitosamente`);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Error desconocido';
      setError('Error creando usuario: ' + errorMsg);
      console.error('Error creating user:', err);
      alert('Error al crear usuario: ' + errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPlanBadgeColor = (plan?: string) => {
    switch (plan) {
      case 'basic':
        return 'bg-gray-100 text-gray-800';
      case 'premium':
        return 'bg-yellow-100 text-yellow-800';
      case 'enterprise':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getPlanLabel = (plan?: string) => {
    switch (plan) {
      case 'basic':
        return 'Basic';
      case 'premium':
        return 'Premium';
      case 'enterprise':
        return 'Enterprise';
      default:
        return 'Unknown';
    }
  };

  const handleOpenGovernance = (tenantId: string, tenantName?: string) => {
    setGovernanceTenantId(tenantId);
    setGovernanceTenantName(tenantName || null);
    setShowGovernanceForm(true);
  };

  const handleCloseGovernance = () => {
    setShowGovernanceForm(false);
    setGovernanceTenantId(null);
    setGovernanceTenantName(null);
    loadTenants(); // Refresh list after changes
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-600 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600">
              You don't have permission to access tenant management.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tenant Management</h1>
              <p className="text-gray-600 mt-2">Manage agricultural tenants and their resources</p>
            </div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition duration-200 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Crear Tenant
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Tenants</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.total_tenants}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.active_tenants}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.pending_tenants}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Users</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.total_users}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Bot className="h-8 w-8 text-indigo-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Devices</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.total_devices}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Tenants Table */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium text-gray-900">Tenants</h2>
                <button
                  onClick={loadTenants}
                  disabled={loading}
                  className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tenant
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Resources
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Users/Devices
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{tenant.name || tenant.id}</div>
                          <div className="text-sm text-gray-500">{tenant.id}</div>
                          <div className="text-xs text-gray-400">{tenant.namespace}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPlanBadgeColor(tenant.plan_type)}`}>
                          {getPlanLabel(tenant.plan_type)}
                        </span>
                        {tenant.contract_end_date && (
                          <div className="text-xs text-gray-500 mt-1">
                            Expires: {new Date(tenant.contract_end_date).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(tenant.status)}
                          <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(tenant.status)}`}>
                            {tenant.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {tenant.ros2_configured && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <Bot className="w-3 h-3 mr-1" />
                              ROS2
                            </span>
                          )}
                          {tenant.vpn_configured && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              <Network className="w-3 h-3 mr-1" />
                              VPN
                            </span>
                          )}
                          {tenant.api_key && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              <Key className="w-3 h-3 mr-1" />
                              API
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>{tenant.user_count} users</div>
                        <div>{tenant.device_count} devices</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(tenant.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleOpenGovernance(tenant.id, tenant.name)}
                            className="text-green-600 hover:text-green-900"
                            title="Edit Governance & Limits"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button className="text-indigo-600 hover:text-indigo-900">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="text-gray-600 hover:text-gray-900">
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTenant(tenant.id);
                              setShowUserForm(true);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                            title={`Crear usuario para: ${tenant.name || tenant.id}`}
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                            className="text-red-600 hover:text-red-900"
                            title={`Borrar tenant: ${tenant.name || tenant.id} (${tenant.id})`}
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
          </div>
        </div>
      </div>

      {/* Create Tenant Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Tenant</h3>

              <form onSubmit={handleCreateTenant} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre del Tenant *
                  </label>
                  <input
                    type="text"
                    value={newTenant.name}
                    onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Farm Alpha"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email del Propietario *
                  </label>
                  <input
                    type="email"
                    value={newTenant.email}
                    onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="usuario@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Plan *
                  </label>
                  <select
                    value={newTenant.plan}
                    onChange={(e) => setNewTenant({ ...newTenant, plan: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="basic">Basic (1 usuario, 3 robots, 10 sensores)</option>
                    <option value="premium">Premium (5 usuarios, 10 robots, 50 sensores)</option>
                    <option value="enterprise">Enterprise (Ilimitado)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contraseña (opcional, se generará automáticamente si no se proporciona)
                  </label>
                  <input
                    type="password"
                    value={newTenant.password}
                    onChange={(e) => setNewTenant({ ...newTenant, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Dejar vacío para generar automáticamente"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !newTenant.name || !newTenant.email}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Creando...' : 'Crear Tenant'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showUserForm && selectedTenant && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Crear Usuario para Tenant: {selectedTenant}</h3>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="usuario@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Mínimo 8 caracteres"
                    required
                    minLength={8}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre (opcional)
                  </label>
                  <input
                    type="text"
                    value={newUser.first_name}
                    onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nombre"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Apellido (opcional)
                  </label>
                  <input
                    type="text"
                    value={newUser.last_name}
                    onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Apellido"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserForm(false);
                      setSelectedTenant(null);
                      setNewUser({ email: '', password: '', first_name: '', last_name: '' });
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !newUser.email || !newUser.password}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Creando...' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Governance Modal */}
      {showGovernanceForm && governanceTenantId && (
        <TenantGovernanceForm
          tenantId={governanceTenantId}
          tenantName={governanceTenantName || undefined}
          onClose={handleCloseGovernance}
          onSuccess={handleCloseGovernance}
        />
      )}
    </div>
  );
};
