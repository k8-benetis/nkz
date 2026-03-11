
import React, { useState, useEffect } from 'react';
import { 
  Users, Building2, Ticket, Search, Filter, Plus, 
  Trash2, ShieldCheck, AlertTriangle, RefreshCcw, 
  Mail, Settings2, Shield
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import client from '@/services/api';
import { format } from 'date-fns';

interface Tenant {
  tenant_id: string;
  tenant_name: string;
  plan_type: string;
  plan_level: number;
  status: string;
  created_at: string;
}

interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  roles: string[];
  tenant?: string;
  createdAt: number;
}

interface ActivationCode {
  id: number;
  code: string;
  email: string;
  plan: string;
  plan_level: number;
  status: string;
  expires_at: string;
}

export const AdminManagement: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'users' | 'tenants' | 'activations'>('users');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [, setActivations] = useState<ActivationCode[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const response = await client.get('/api/tenant/users');
        setUsers(response.data.users || []);
      } else if (activeTab === 'tenants') {
        // This endpoint will be added to entity-manager or tenant-webhook
        const response = await client.get('/api/admin/tenants');
        setTenants(response.data || []);
      } else if (activeTab === 'activations') {
        const response = await client.get('/api/admin/activations');
        const data = response.data || [];
        setActivations(data);
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleDeleteTenant = async (tenantId: string) => {
    if (!window.confirm(`${t('admin.confirm_delete_tenant', { tenantId })}`)) {
      return;
    }
    try {
      await client.delete(`/api/admin/tenants/${tenantId}/purge`);
      setTenants(tenants.filter(t => t.tenant_id !== tenantId));
      alert('Tenant purgado con éxito');
    } catch (error) {
      alert('Error al purgar tenant');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="text-green-600 h-8 w-8" />
            Nekazari Control Center
          </h1>
          <p className="text-gray-500 mt-1">Gestión avanzada de usuarios, infraestructuras y planes SOTA.</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => loadData()}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refrescar datos"
          >
            <RefreshCcw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-[2px] ${
            activeTab === 'users' 
              ? 'border-green-600 text-green-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="h-5 w-5" />
          Usuarios
        </button>
        <button
          onClick={() => setActiveTab('tenants')}
          className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-[2px] ${
            activeTab === 'tenants' 
              ? 'border-green-600 text-green-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="h-5 w-5" />
          Tenants / Infra
        </button>
        <button
          onClick={() => setActiveTab('activations')}
          className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-[2px] ${
            activeTab === 'activations' 
              ? 'border-green-600 text-green-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Ticket className="h-5 w-5" />
          Códigos NEK
        </button>
      </div>

      {/* Search & Actions Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={`Buscar en ${activeTab}...`}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          {activeTab === 'activations' && (
            <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors">
              <Plus className="h-5 w-5" />
              Generar Código
            </button>
          )}
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors border border-gray-200">
            <Filter className="h-5 w-5" />
            Filtros
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <RefreshCcw className="h-10 w-10 text-green-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Cargando datos maestros...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                {activeTab === 'users' && (
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Usuario</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Tenant ID</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Roles</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Estado</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Fecha Registro</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm text-right">Acciones</th>
                  </tr>
                )}
                {activeTab === 'tenants' && (
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Organización</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">ID Interno</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Plan / Nivel</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Infra K8s</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm text-right">Acciones</th>
                  </tr>
                )}
                {activeTab === 'activations' && (
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Código NEK</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Email Destino</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Plan Pre-asig</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Expiración</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm text-right">Acciones</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeTab === 'users' && users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold">
                          {user.email[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{user.firstName} {user.lastName}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {user.tenant || 'no-tenant'}
                      </span>
                    </td>
                    <td className="px-6 py-4 flex flex-wrap gap-1">
                      {user.roles.map(role => (
                        <span key={role} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-gray-50 text-gray-600">
                          {role}
                        </span>
                      ))}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-1.5 text-green-600 font-medium">
                        <div className="h-2 w-2 rounded-full bg-green-600"></div>
                        Activo
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {format(user.createdAt, 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Borrar usuario">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
                
                {activeTab === 'tenants' && tenants.map(tenant => (
                  <tr key={tenant.tenant_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900">{tenant.tenant_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{tenant.tenant_id}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-xs font-bold uppercase tracking-wider ${
                          tenant.plan_type === 'enterprise' ? 'text-purple-600' : 'text-green-600'
                        }`}>
                          {tenant.plan_type}
                        </span>
                        <span className="text-[10px] text-gray-400">Nivel {tenant.plan_level}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                        <span className="text-xs text-gray-600">Namespace OK</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Configurar Plan">
                          <Settings2 className="h-5 w-5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteTenant(tenant.tenant_id)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors" 
                          title="BORRADO NUCLEAR"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {((activeTab === 'users' && users.length === 0) || (activeTab === 'tenants' && tenants.length === 0)) && (
              <div className="p-12 text-center bg-gray-50">
                <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No se encontraron datos para mostrar.</p>
                <p className="text-sm text-gray-400 mt-1">Verifica la conexión con el clúster central.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
