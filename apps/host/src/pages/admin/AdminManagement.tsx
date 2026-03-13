
import React, { useState, useEffect } from 'react';
import { 
  Users, Building2, Ticket, Search, Filter, Plus, 
  Trash2, ShieldCheck, AlertTriangle, RefreshCcw, 
  Mail, Settings2, Shield, Database, Key, ScrollText, 
  FileText, Activity, Box, Puzzle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import client from '@/services/api';
import { format } from 'date-fns';
import { useModules } from '@/context/ModuleContext';
import { SlotRenderer } from '@/components/SlotRenderer';

// Missing Admin Components
import { LimitsManagement } from '@/components/LimitsManagement';
import { SDMManagement } from '@/components/SDMManagement';
import { TermsManagement } from '@/components/TermsManagement';
import { PlatformApiCredentials } from '@/components/PlatformApiCredentials';
import { AuditLogsPanel } from '@/components/AuditLogsPanel';
import { GlobalAssetManager } from '@/components/Admin/GlobalAssetManager';

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
  const { modules } = useModules();
  const [activeTab, setActiveTab] = useState<string>('users');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activations, setActivations] = useState<ActivationCode[]>([]);

  // Find modules that provide admin-tab slots
  const adminTabModules = Array.isArray(modules) 
    ? modules.filter(m => m.viewerSlots?.['admin-tab'] && m.viewerSlots['admin-tab'].length > 0)
    : [];

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const response = await client.get('/api/tenant/users');
        setUsers(response.data.users || response.data || []);
      } else if (activeTab === 'tenants') {
        const response = await client.get('/api/admin/tenants');
        const data = response.data;
        setTenants(Array.isArray(data) ? data : (data.tenants || []));
      } else if (activeTab === 'activations') {
        const response = await client.get('/api/admin/activations');
        const data = response.data;
        setActivations(Array.isArray(data) ? data : (data.activations || data.codes || []));
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (['users', 'tenants', 'activations'].includes(activeTab)) {
      loadData();
    }
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

  const handleGenerateCode = async () => {
    const email = window.prompt('Email del destinatario:');
    if (!email) return;
    
    const tenant_name = window.prompt('Nombre de la Explotación / Granja:');
    if (!tenant_name) return;

    try {
      setLoading(true);
      await client.createActivationCode({ email, tenant_name });
      alert('Código generado con éxito');
      if (activeTab === 'activations') loadData();
    } catch (error) {
      alert('Error al generar código');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigTenant = async (tenant: Tenant) => {
    const newName = window.prompt('Nuevo nombre de la Explotación:', tenant.tenant_name);
    if (!newName) return;

    const contactEmail = window.prompt('Email de contacto (metadata):', '');
    if (contactEmail === null) return;

    try {
      setLoading(true);
      await client.updateTenant(tenant.tenant_id, { 
        tenant_name: newName,
        metadata: { contact_email: contactEmail }
      });
      alert('Tenant actualizado con éxito');
      loadData();
    } catch (error) {
      alert('Error al actualizar tenant');
    } finally {
      setLoading(false);
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
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar">
        {[
          { id: 'users', label: 'Usuarios', icon: Users },
          { id: 'tenants', label: 'Tenants', icon: Building2 },
          { id: 'activations', label: 'Códigos NEK', icon: Ticket },
          { id: 'limits', label: 'Límites', icon: Activity },
          { id: 'sdm', label: 'Modelos SDM', icon: Database },
          { id: 'terms', label: 'Términos', icon: FileText },
          { id: 'apis', label: 'APIs Plataforma', icon: Key },
          { id: 'logs', label: 'Logs', icon: ScrollText },
          { id: 'assets', label: 'Assets', icon: Box },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
              activeTab === tab.id 
                ? 'border-green-600 text-green-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="h-5 w-5" />
            {tab.label}
          </button>
        ))}
        {/* Module-contributed admin tabs */}
        {adminTabModules.map((module) => (
          <button
            key={`module-tab-${module.id}`}
            onClick={() => setActiveTab(`module-${module.id}`)}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
              activeTab === `module-${module.id}`
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Puzzle className="h-5 w-5" />
            {module.displayName || module.name}
          </button>
        ))}
      </div>

      {/* Search & Actions Bar (only for users/tenants/activations) */}
      {['users', 'tenants', 'activations'].includes(activeTab) && (
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
              <button 
                onClick={handleGenerateCode}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
              >
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
      )}

      {/* Content Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading && ['users', 'tenants', 'activations'].includes(activeTab) ? (
          <div className="p-12 text-center">
            <RefreshCcw className="h-10 w-10 text-green-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Cargando datos maestros...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {activeTab === 'users' && (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Usuario (Keycloak)</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Explotación / Tenant</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Roles</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Estado</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Fecha Registro</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold">
                            {(user.firstName?.[0] || user.email[0]).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{user.firstName} {user.lastName}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {user.email}
                            </p>
                            {user.username && <p className="text-[10px] text-gray-400">UID: {user.username}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {user.tenant || 'no-tenant'}
                        </span>
                      </td>
                      <td className="px-6 py-4 flex flex-wrap gap-1">
                        {(user.roles || []).map(role => (
                          <span key={role} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-gray-50 text-gray-600">
                            {role}
                          </span>
                        ))}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-1.5 text-green-600 font-medium">
                          <div className="h-2 w-2 rounded-full bg-green-600"></div>
                          {user.enabled ? 'Activo' : 'Deshabilitado'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {user.createdAt ? format(user.createdAt, 'dd/MM/yyyy') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Borrar usuario">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === 'tenants' && (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Explotación / Granja</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">ID Interno</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Plan / Nivel</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Infra K8s</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tenants.map(tenant => (
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
                          <button 
                            onClick={() => handleConfigTenant(tenant)}
                            className="p-2 text-gray-400 hover:text-blue-600 transition-colors" 
                            title="Configurar Explotación"
                          >
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
            )}

            {activeTab === 'activations' && (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Código NEK</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Email Destino</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Plan Pre-asig</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Expiración</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-sm text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activations.map(activation => (
                    <tr key={activation.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-gray-900">{activation.code}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{activation.email}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold uppercase text-blue-600">{activation.plan}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {format(new Date(activation.expires_at), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Special Administrative Components */}
            <div className="p-0">
              {activeTab === 'limits' && <div className="p-6"><LimitsManagement /></div>}
              {activeTab === 'sdm' && <div className="p-6"><SDMManagement /></div>}
              {activeTab === 'terms' && <div className="p-6"><TermsManagement /></div>}
              {activeTab === 'apis' && <div className="p-6"><PlatformApiCredentials /></div>}
              {activeTab === 'logs' && <div className="p-0"><AuditLogsPanel /></div>}
              {activeTab === 'assets' && <div className="p-6"><GlobalAssetManager /></div>}
            </div>

            {/* Module-contributed dynamic admin tabs */}
            {adminTabModules.map((module) => (
              activeTab === `module-${module.id}` && (
                <div key={`module-content-${module.id}`} className="p-6">
                  <SlotRenderer 
                    slot="admin-tab" 
                  />
                </div>
              )
            ))}
            
            {((activeTab === 'users' && users.length === 0) || 
               (activeTab === 'tenants' && tenants.length === 0) || 
               (activeTab === 'activations' && activations.length === 0)) && 
               ['users', 'tenants', 'activations'].includes(activeTab) && (
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