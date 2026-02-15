// =============================================================================
// Admin Panel - Panel de administración profesional
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';
import { TenantManagement } from '@/components/TenantManagement';
import { TenantUserManagement } from '@/components/TenantUserManagement';
import { SDMManagement } from '@/components/SDMManagement';
import { TeamManagement } from '@/components/TeamManagement';
import { AdminUserManagement } from '@/components/AdminUserManagement';
import { PlatformApiCredentials } from '@/components/PlatformApiCredentials';
import { TermsManagement } from '@/components/TermsManagement';
import { getConfig } from '@/config/environment';
import {
  Shield,
  Users,
  Bot,
  Activity,
  Settings,
  LogOut,
  AlertTriangle,
  CheckCircle,
  Clock,
  Building2,
  Key,
  Database,
  Gauge,
  FileText,
  Package,
  BookOpen
} from 'lucide-react';
import { LimitsManagement } from '@/components/LimitsManagement';
import { Modules } from '@/pages/admin/Modules';
import { IoTConfiguration } from '@/pages/admin/IoTConfiguration';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuditLogsPanel } from '@/components/AuditLogsPanel';
import { GlobalAssetManager } from '@/components/Admin/GlobalAssetManager';
import { DeviceLibrary } from '@/pages/admin/DeviceLibrary';


interface AdminStats {
  totalUsers: number;
  activeDevices: number;
  totalSensors: number;
  systemAlerts: number;
  lastUpdate: string;
}

interface SystemStatus {
  status: 'healthy' | 'warning' | 'error';
  message: string;
  uptime: string;
}

export const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  // Inicializar currentView siempre como 'dashboard' para evitar problemas de renderizado
  // El usuario puede cambiar manualmente a la vista que desee
  const [currentView, setCurrentView] = useState<'dashboard' | 'tenants' | 'limits' | 'users' | 'team' | 'devices' | 'sdm' | 'user-management' | 'tenant-users' | 'platform-apis' | 'terms' | 'modules' | 'audit-logs' | 'iot' | 'assets' | 'device-library'>('dashboard');
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    activeDevices: 0,
    totalSensors: 0,
    systemAlerts: 0,
    lastUpdate: new Date().toISOString()
  });
  const [systemStatus] = useState<SystemStatus>({
    status: 'healthy',
    message: t('admin.system_working'),
    uptime: '0d 0h 0m'
  });

  const isPlatformAdmin = user?.roles?.includes('PlatformAdmin') ?? false;
  const isTenantAdmin = user?.roles?.includes('TenantAdmin') ?? false;

  // Admin access if either PlatformAdmin or TenantAdmin
  const isAdminUser = isPlatformAdmin || isTenantAdmin;

  const loadSystemData = async () => {
    try {
      setLoading(true);
      // Cargar estadísticas reales del sistema
      const [usersResponse, devicesResponse, sensorsResponse] = await Promise.allSettled([
        api.get('/api/tenant/users/stats'),
        api.get('/api/devices/stats'),
        api.get('/api/sensors/stats')
      ]);

      const newStats: AdminStats = {
        totalUsers: usersResponse.status === 'fulfilled' ? usersResponse.value.data.total || 0 : 0,
        activeDevices: devicesResponse.status === 'fulfilled' ? devicesResponse.value.data.active || 0 : 0,
        totalSensors: sensorsResponse.status === 'fulfilled' ? sensorsResponse.value.data.total || 0 : 0,
        systemAlerts: 0, // TODO: Implementar sistema de alertas
        lastUpdate: new Date().toISOString()
      };

      setStats(newStats);
    } catch (error) {
      console.error('Error loading system data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Cargar estadísticas para todos los admins
  useEffect(() => {
    if (isAdminUser) {
      loadSystemData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminUser]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const refreshData = () => {
    loadSystemData();
  };

  // Solo PlatformAdmin y TenantAdmin pueden acceder
  // IMPORTANTE: Este return debe estar DESPUÉS de todos los hooks
  if (!isAdminUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('admin.access_denied')}</h1>
            <p className="text-gray-600 mb-6">
              {t('admin.access_denied_message')}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition duration-200"
              >
                {t('admin.back_to_dashboard')}
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 transition duration-200"
              >
                {t('admin.go_home')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('admin.panel_title')}</h1>
                <p className="text-sm text-gray-600">{t('admin.panel_subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={refreshData}
                disabled={loading}
                className="flex items-center text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                <Activity className="h-4 w-4 mr-2" />
                {t('admin.refresh')}
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t('admin.logout')}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* System Status */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className={`p-4 rounded-lg flex items-center ${systemStatus.status === 'healthy' ? 'bg-green-50 text-green-800' :
          systemStatus.status === 'warning' ? 'bg-yellow-50 text-yellow-800' :
            'bg-red-50 text-red-800'
          }`}>
          {systemStatus.status === 'healthy' ? (
            <CheckCircle className="h-5 w-5 mr-2" />
          ) : systemStatus.status === 'warning' ? (
            <AlertTriangle className="h-5 w-5 mr-2" />
          ) : (
            <AlertTriangle className="h-5 w-5 mr-2" />
          )}
          <span className="font-medium">{systemStatus.message}</span>
          <span className="ml-auto text-sm">
            <Clock className="h-4 w-4 inline mr-1" />
            {systemStatus.uptime}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid - Para todos los admins */}
        {isAdminUser && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 force-grid">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{t('admin.total_users')}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Bot className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{t('admin.active_devices')}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.activeDevices}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Activity className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{t('admin.total_sensors')}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalSensors}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Settings className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{t('admin.system_alerts')}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.systemAlerts}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admin Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('admin.admin_actions')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 force-grid">
            {/* Platform Admin: Ve TODO */}
            {isPlatformAdmin && (
              <>
                <button
                  onClick={() => setCurrentView('tenants')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Building2 className="h-6 w-6 text-blue-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.manage_tenants')}</h3>
                  <p className="text-sm text-gray-600">{t('admin.manage_tenants_desc')}</p>
                </button>

                <button
                  onClick={() => setCurrentView('user-management')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Users className="h-6 w-6 text-green-600 mb-2" />
                  <h3 className="font-medium text-gray-900">Códigos NEK</h3>
                  <p className="text-sm text-gray-600">Generar códigos de activación NEK</p>
                </button>

                <button
                  onClick={() => setCurrentView('tenant-users')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Users className="h-6 w-6 text-purple-600 mb-2" />
                  <h3 className="font-medium text-gray-900">Gestión de Usuarios</h3>
                  <p className="text-sm text-gray-600">Ver, asignar y borrar usuarios</p>
                </button>

                <button
                  onClick={() => setCurrentView('team')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Users className="h-6 w-6 text-purple-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.my_team')}</h3>
                  <p className="text-sm text-gray-600">{t('admin.my_team_desc')}</p>
                </button>

                <button
                  onClick={() => setCurrentView('devices')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Bot className="h-6 w-6 text-purple-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.manage_devices')}</h3>
                  <p className="text-sm text-gray-600">{t('admin.manage_devices_desc')}</p>
                </button>

                <button
                  onClick={() => {
                    const config = getConfig();
                    const adminUrl = config.keycloak.adminUrl || (config.keycloak.url ? `${config.keycloak.url}/admin` : '');
                    if (adminUrl) {
                      window.open(adminUrl, '_blank');
                    }
                  }}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Shield className="h-6 w-6 text-red-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.keycloak_admin')}</h3>
                  <p className="text-sm text-gray-600">{t('admin.keycloak_admin_desc')}</p>
                </button>

                <button
                  onClick={() => setCurrentView('sdm')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Database className="h-6 w-6 text-indigo-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.sdm_management')}</h3>
                  <p className="text-sm text-gray-600">{t('admin.sdm_management_desc')}</p>
                </button>

                <button
                  onClick={() => setCurrentView('limits')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Settings className="h-6 w-6 text-blue-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.tenant_limits')}</h3>
                  <p className="text-sm text-gray-600">{t('admin.tenant_limits_desc')}</p>
                </button>

                <button
                  onClick={() => setCurrentView('platform-apis')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Key className="h-6 w-6 text-purple-600 mb-2" />
                  <h3 className="font-medium text-gray-900">APIs de Plataforma</h3>
                  <p className="text-sm text-gray-600">Copernicus CDSE y AEMET (para toda la plataforma)</p>
                </button>

                <button
                  onClick={() => setCurrentView('terms')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <FileText className="h-6 w-6 text-blue-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.terms_management')}</h3>
                  <p className="text-sm text-gray-600">{t('admin.terms_help')}</p>
                </button>

                <button
                  onClick={() => setCurrentView('modules')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Package className="h-6 w-6 text-purple-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.manage_modules')}</h3>
                  <p className="text-sm text-gray-600 mt-1">{t('admin.manage_modules_desc')}</p>
                </button>

                <button
                  onClick={() => setCurrentView('audit-logs')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <FileText className="h-6 w-6 text-indigo-600 mb-2" />
                  <h3 className="font-medium text-gray-900">Audit Logs</h3>
                  <p className="text-sm text-gray-600">View system audit logs and compliance records</p>
                </button>

                <button
                  onClick={() => setCurrentView('iot')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Activity className="h-6 w-6 text-cyan-600 mb-2" />
                  <h3 className="font-medium text-gray-900">Configuración IoT</h3>
                  <p className="text-sm text-gray-600">Perfiles de procesamiento y estadísticas de telemetría</p>
                </button>

                <button
                  onClick={() => setCurrentView('assets')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Package className="h-6 w-6 text-orange-600 mb-2" />
                  <h3 className="font-medium text-gray-900">Global Asset Manager</h3>
                  <p className="text-sm text-gray-600">Manage public 3D models and icons</p>
                </button>

                <button
                  onClick={() => setCurrentView('device-library')}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <BookOpen className="h-6 w-6 text-purple-600 mb-2" />
                  <h3 className="font-medium text-gray-900">Librería de Dispositivos</h3>
                  <p className="text-sm text-gray-600">Perfiles de mapeo IoT para sensores</p>
                </button>

                <button
                  onClick={() => {
                    const config = getConfig();
                    const grafanaUrl = config.external.grafanaUrl || `${window.location.origin}/grafana`;
                    if (grafanaUrl) {
                      window.open(grafanaUrl, '_blank');
                    }
                  }}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Activity className="h-6 w-6 text-indigo-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.grafana')}</h3>
                  <p className="text-sm text-gray-600">{t('admin.grafana_desc')}</p>
                </button>

                <button
                  onClick={() => {
                    const config = getConfig();
                    // Prometheus está en /prometheus con path rewrite
                    const prometheusUrl = config.external.prometheusUrl || `${window.location.origin}/prometheus`;
                    if (prometheusUrl) {
                      window.open(prometheusUrl, '_blank');
                    } else {
                      console.error('Prometheus URL no configurada');
                    }
                  }}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
                >
                  <Gauge className="h-6 w-6 text-red-600 mb-2" />
                  <h3 className="font-medium text-gray-900">{t('admin.prometheus')}</h3>
                  <p className="text-sm text-gray-600">{t('admin.prometheus_desc')}</p>
                </button>
              </>
            )}

            {/* Tenant Admin: Solo ve su equipo */}
            {isTenantAdmin && !isPlatformAdmin && (
              <button
                onClick={() => setCurrentView('team')}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition duration-200"
              >
                <Users className="h-6 w-6 text-purple-600 mb-2" />
                <h3 className="font-medium text-gray-900">{t('admin.my_team')}</h3>
                <p className="text-sm text-gray-600">{t('admin.my_team_desc')}</p>
              </button>
            )}

          </div>
        </div>

        {/* Shared Content: Team Management */}
        {currentView === 'team' && (isPlatformAdmin || isTenantAdmin) && <TeamManagement />}

        {/* Dynamic Content Based on Current View */}
        {/* Platform Admin: Ve TODO */}
        {isPlatformAdmin && (
          <>
            {currentView === 'tenants' && <TenantManagement />}

            {currentView === 'user-management' && <AdminUserManagement />}

            {currentView === 'tenant-users' && <TenantUserManagement />}

            {currentView === 'users' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('admin.user_management_title')}</h2>
                <p className="text-gray-600">{t('admin.user_management_message')}</p>
                <button
                  onClick={() => {
                    const config = getConfig();
                    const adminUrl = config.keycloak.adminUrl || (config.keycloak.url ? `${config.keycloak.url}/admin` : '');
                    if (adminUrl) {
                      window.open(adminUrl, '_blank');
                    }
                  }}
                  className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition duration-200"
                >
                  {t('admin.open_keycloak_admin')}
                </button>
              </div>
            )}

            {currentView === 'devices' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('admin.device_management')}</h2>
                <div className="space-y-4">
                  <p className="text-gray-600">{t('admin.device_management_desc')}</p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => navigate('/robots')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      {t('admin.manage_robots')}
                    </button>
                    <button
                      onClick={() => navigate('/sensors')}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      {t('admin.manage_sensors')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentView === 'sdm' && <SDMManagement />}

            {currentView === 'limits' && <LimitsManagement />}

            {currentView === 'platform-apis' && <PlatformApiCredentials />}

            {currentView === 'terms' && <TermsManagement />}

            {currentView === 'modules' && (
              <ErrorBoundary componentName="Modules">
                <Modules />
              </ErrorBoundary>
            )}

            {currentView === 'audit-logs' && (
              <ErrorBoundary componentName="AuditLogs">
                <AuditLogsPanel />
              </ErrorBoundary>
            )}

            {currentView === 'iot' && (
              <ErrorBoundary componentName="IoTConfiguration">
                <IoTConfiguration />
              </ErrorBoundary>
            )}

            {currentView === 'assets' && (
              <ErrorBoundary componentName="GlobalAssetManager">
                <GlobalAssetManager />
              </ErrorBoundary>
            )}

            {currentView === 'device-library' && (
              <ErrorBoundary componentName="DeviceLibrary">
                <DeviceLibrary />
              </ErrorBoundary>
            )}

          </>
        )}

        {/* Tenant Admin: Can also manage modules */}
        {isTenantAdmin && !isPlatformAdmin && (
          <>
            {currentView === 'modules' && (
              <ErrorBoundary componentName="Modules">
                <Modules />
              </ErrorBoundary>
            )}
          </>
        )}


        {/* Last Update */}
        <div className="mt-6 text-center text-sm text-gray-500">
          {t('admin.last_update', { date: new Date(stats.lastUpdate).toLocaleString() })}
        </div>
      </main>
    </div>
  );
};
