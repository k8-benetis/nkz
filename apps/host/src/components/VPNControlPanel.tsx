// =============================================================================
// VPN Control Panel Component
// =============================================================================
// Panel de control VPN para que cada tenant vea su configuración y cómo usarla
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Shield, Download, Copy, CheckCircle, AlertCircle, RefreshCw, Plus, Key, Network, Server, Power, Loader, Users } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';

interface VPNConfig {
  tenant_id: string;
  configured: boolean;
  vpn_ip_range?: string;
  vpn_port?: string;
  server_endpoint: string;
  server_ip: string;
  subnet: string;
  tenant_base_ip?: string;
  has_wireguard_config?: boolean;
  instructions: Array<{
    step: number;
    title: string;
    description: string;
    command?: string;
  }>;
}

interface VPNClientConfig {
  success: boolean;
  client_name: string;
  client_ip: string;
  client_public_key: string;
  config: string;
  instructions: {
    save_to: string;
    activate: string;
    enable: string;
  };
}

interface VPNServiceStatus {
  active: boolean | null;
  vpn_configured: boolean;
  tenant_id: string;
  vpn_ip?: string;
}

interface TenantPlan {
  plan: string;
  max_vpn_ips: number;
}

export const VPNControlPanel: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [config, setConfig] = useState<VPNConfig | null>(null);
  const [serviceStatus, setServiceStatus] = useState<VPNServiceStatus | null>(null);
  const [tenantPlan, setTenantPlan] = useState<TenantPlan | null>(null);
  const [assignedIPs, setAssignedIPs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [activating, setActivating] = useState(false);
  const [clientConfig, setClientConfig] = useState<VPNClientConfig | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Get VPN IP limits based on plan
  const getPlanLimits = (planType?: string | null): number => {
    if (!planType) return 1; // Default to basic
    const normalized = planType.toLowerCase().replace(/[_\-]+/g, ' ').trim();
    if (normalized.includes('enterprise')) return 50;
    if (normalized.includes('advance') || normalized.includes('advanced') || normalized.includes('premium')) return 10;
    return 1; // basic
  };

  const loadTenantPlan = async () => {
    try {
      // Try to get tenant plan from usage summary or expiration info
      const usageData = await api.getTenantUsage().catch(() => null);
      if (usageData?.limits?.planType) {
        const planType = usageData.limits.planType;
        setTenantPlan({
          plan: planType,
          max_vpn_ips: getPlanLimits(planType)
        });
        return;
      }
      
      // Fallback: try to get from expiration info (DashboardImproved approach)
      const token = sessionStorage.getItem('auth_token') || '';
      const response = await api.get('/admin/tenants', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => null);
      
      if (response?.data) {
        const tenants = Array.isArray(response.data) ? response.data : 
                       (response.data?.tenants || [response.data]);
        const currentTenant = tenants.find((t: any) => 
          t.tenant === user?.tenant || t.email === user?.email || t.tenant_id === user?.tenant
        );
        
        if (currentTenant?.plan) {
          const planType = currentTenant.plan;
          setTenantPlan({
            plan: planType,
            max_vpn_ips: getPlanLimits(planType)
          });
        }
      }
    } catch (err) {
      console.warn('Error loading tenant plan:', err);
      // Default to basic plan
      setTenantPlan({ plan: 'basic', max_vpn_ips: 1 });
    }
  };

  const loadVPNConfig = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load tenant plan first
      await loadTenantPlan();
      
      const [configData, statusData] = await Promise.all([
        api.getVPNConfig().catch(() => null),
        api.getVPNServiceStatus().catch(() => null)
      ]);
      
      if (configData) {
        setConfig(configData);
      }
      
      if (statusData) {
        setServiceStatus(statusData);
        
        // Extract assigned IPs from config if available
        if (configData?.tenant_base_ip) {
          const baseIP = configData.tenant_base_ip;
          // For now, we'll track IPs as they're generated
          // In a real implementation, we'd query the backend for assigned IPs
          setAssignedIPs([baseIP]); // Start with base IP
        }
      }
      
      if (!configData && !statusData) {
        // Service not configured yet - this is normal, don't show as error
        setError(null);
      }
    } catch (err: any) {
      // Don't show error if it's 401/403 - service might not be configured yet
      if (err?.response?.status !== 401 && err?.response?.status !== 403) {
        setError(err.message || t('settings.vpn.error'));
      } else {
        setError(null);
      }
      console.error('Error loading VPN config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleActivateVPN = async () => {
    if (!confirm(t('settings.vpn.activate_confirm') || '¿Activar el servicio VPN? Esto puede tardar unos minutos.')) {
      return;
    }

    setActivating(true);
    setError(null);
    
    try {
      const data = await api.activateVPNService();
      if (data.success) {
        // Reload status after activation
        setTimeout(() => {
          loadVPNConfig();
        }, 2000);
      } else {
        setError(data.message || t('settings.vpn.activate_error') || 'Failed to activate VPN service');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || t('settings.vpn.activate_error') || 'Error activating VPN service');
      console.error('Error activating VPN:', err);
    } finally {
      setActivating(false);
    }
  };

  useEffect(() => {
    loadVPNConfig();
  }, []);

  const handleGenerateClientConfig = async () => {
    // Check IP limit
    const maxIPs = tenantPlan?.max_vpn_ips || 1;
    if (assignedIPs.length >= maxIPs) {
      alert(`Has alcanzado el límite de ${maxIPs} IP(s) VPN para tu plan ${tenantPlan?.plan || 'basic'}.`);
      return;
    }

    const clientName = prompt(`${t('settings.vpn.device')} (ej: robot_001, sensor_001):`, `device_${assignedIPs.length + 1}`);
    if (!clientName) return;

    setGenerating(true);
    try {
      const data = await api.generateVPNClientConfig(clientName);
      setClientConfig(data);
      
      // Add the new IP to assigned list
      if (data.client_ip && !assignedIPs.includes(data.client_ip)) {
        setAssignedIPs([...assignedIPs, data.client_ip]);
      }
    } catch (err: any) {
      alert(`Error: ${err.message || t('settings.vpn.error')}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownloadConfig = () => {
    if (!clientConfig) return;
    
    const blob = new Blob([clientConfig.config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clientConfig.client_name}.conf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm mt-2">{t('settings.vpn.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {t('settings.vpn.error')}
          </h3>
        </div>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
            <button
              onClick={loadVPNConfig}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-2 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              {t('settings.vpn.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Always show VPN panel, even if not configured
  // This allows users to see the status and activate the service

  return (
    <div className="space-y-4">
      {/* Main VPN Info Panel */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {t('settings.vpn.title')}
          </h3>
          <p className="text-blue-100 text-sm mt-1">{t('settings.vpn.subtitle')}</p>
        </div>

        <div className="p-6">
          {serviceStatus && !serviceStatus.active ? (
            <>
              {/* Service Inactive - Show Activation Button */}
              <div className="mb-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-yellow-800 font-medium mb-1">
                        {t('settings.vpn.inactive') || 'Servicio VPN Inactivo'}
                      </p>
                      <p className="text-yellow-700 text-sm">
                        {t('settings.vpn.inactive_description') || 
                          'El servicio VPN no está activo. Actívalo para conectar robots y sensores mediante VPN segura.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Activate Button */}
                <button
                  onClick={handleActivateVPN}
                  disabled={activating}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {activating ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      {t('settings.vpn.activating') || 'Activando...'}
                    </>
                  ) : (
                    <>
                      <Power className="w-5 h-5" />
                      {t('settings.vpn.activate') || 'Activar Servicio VPN'}
                    </>
                  )}
                </button>
              </div>
            </>
          ) : !config || !config.configured ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-yellow-800 font-medium mb-1">{t('settings.vpn.not_configured')}</p>
                  <p className="text-yellow-700 text-sm">
                    {t('settings.vpn.not_configured_description')}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* VPN Status */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-semibold text-gray-900">
                    {serviceStatus?.active 
                      ? (t('settings.vpn.active') || 'Servicio VPN Activo')
                      : (t('settings.vpn.configured') || 'VPN Configurada')}
                  </span>
                </div>

                {/* Plan Info and IP Limits */}
                {tenantPlan && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">
                          Plan: {tenantPlan.plan.charAt(0).toUpperCase() + tenantPlan.plan.slice(1)}
                        </span>
                      </div>
                      <span className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {assignedIPs.length} / {tenantPlan.max_vpn_ips} IPs utilizadas
                      </span>
                    </div>
                    <p className="text-xs text-blue-700">
                      Tu plan permite hasta {tenantPlan.max_vpn_ips} dirección(es) IP VPN para conectar robots y sensores.
                    </p>
                  </div>
                )}

                {/* Service Status Details */}
                {serviceStatus && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-gray-700">
                          {t('settings.vpn.service_status') || 'Estado del Servicio'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {serviceStatus.active ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-green-700 font-medium">
                              {t('settings.vpn.running') || 'En ejecución'}
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm text-yellow-700 font-medium">
                              {t('settings.vpn.not_running') || 'No disponible'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Network className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm font-medium text-gray-700">
                          {t('settings.vpn.config_status') || 'Configuración'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {serviceStatus.vpn_configured ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-green-700 font-medium">
                              {t('settings.vpn.configured') || 'Configurado'}
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm text-yellow-700 font-medium">
                              {t('settings.vpn.not_configured') || 'No configurado'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Assigned IPs List */}
                {assignedIPs.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Network className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-medium text-gray-700">
                        IPs VPN Asignadas
                      </span>
                    </div>
                    <div className="space-y-2">
                      {assignedIPs.map((ip, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white rounded p-2 border border-gray-200">
                          <span className="text-sm font-mono text-gray-900">{ip}</span>
                          <button
                            onClick={() => handleCopy(ip, `ip-${idx}`)}
                            className="text-gray-400 hover:text-gray-600 transition"
                            title="Copiar IP"
                          >
                            {copied === `ip-${idx}` ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Network Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Server className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">{t('settings.vpn.server_vpn')}</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{config.server_endpoint}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('settings.vpn.public_endpoint')}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Network className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-700">{t('settings.vpn.network_range')}</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{config.vpn_ip_range || config.subnet}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('settings.vpn.vpn_subnet')}</p>
                  </div>

                  {config.tenant_base_ip && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Key className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium text-gray-700">{t('settings.vpn.tenant_base_ip')}</span>
                      </div>
                      <p className="text-lg font-bold text-gray-900">{config.tenant_base_ip}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('settings.vpn.assigned_ip')}</p>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-medium text-gray-700">{t('settings.vpn.port')}</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{config.vpn_port || '51820'}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('settings.vpn.udp_port')}</p>
                  </div>
                </div>
              </div>

              {/* Refresh Button */}
              {serviceStatus && (
                <button
                  onClick={loadVPNConfig}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center justify-center gap-2 disabled:opacity-50 mb-6"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  {t('settings.vpn.refresh') || 'Actualizar Estado'}
                </button>
              )}

              {/* Generate Client Config Button */}
              <div className="mb-6">
                <button
                  onClick={handleGenerateClientConfig}
                  disabled={generating || (tenantPlan !== null && assignedIPs.length >= tenantPlan.max_vpn_ips)}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className={`w-5 h-5 ${generating ? 'animate-spin' : ''}`} />
                  {generating 
                    ? t('settings.vpn.generating') 
                    : (tenantPlan && assignedIPs.length >= tenantPlan.max_vpn_ips)
                      ? `Límite alcanzado (${tenantPlan.max_vpn_ips} IPs)`
                      : t('settings.vpn.generate_config')}
                </button>
                {tenantPlan && assignedIPs.length >= tenantPlan.max_vpn_ips && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Has alcanzado el límite de IPs para tu plan {tenantPlan.plan}. 
                    Actualiza tu plan para obtener más IPs.
                  </p>
                )}
              </div>

              {/* Client Config Display */}
              {clientConfig && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-green-900 mb-1">{t('settings.vpn.config_generated')}</h4>
                      <p className="text-sm text-green-700">
                        {t('settings.vpn.device')}: <span className="font-mono">{clientConfig.client_name}</span> ({clientConfig.client_ip})
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy(clientConfig.config, 'config')}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition flex items-center gap-1"
                        title={t('settings.vpn.copy_config')}
                      >
                        <Copy className="w-4 h-4" />
                        {copied === 'config' ? t('settings.vpn.copied') : t('settings.vpn.copy_config')}
                      </button>
                      <button
                        onClick={handleDownloadConfig}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition flex items-center gap-1"
                        title={t('settings.vpn.download')}
                      >
                        <Download className="w-4 h-4" />
                        {t('settings.vpn.download')}
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded p-3 mb-3">
                    <pre className="text-xs text-gray-800 font-mono whitespace-pre-wrap break-all">
                      {clientConfig.config}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-green-900">{t('settings.vpn.installation_instructions')}:</p>
                    <div className="space-y-1 text-sm text-green-800">
                      <p>1. {t('settings.vpn.save_config')}: <code className="bg-white px-2 py-1 rounded">{clientConfig.instructions.save_to}</code></p>
                      <p>2. {t('settings.vpn.activate_vpn')}: <code className="bg-white px-2 py-1 rounded">{clientConfig.instructions.activate}</code></p>
                      <p>3. {t('settings.vpn.enable_startup')}: <code className="bg-white px-2 py-1 rounded">{clientConfig.instructions.enable}</code></p>
                    </div>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">{t('settings.vpn.usage_guide')}</h4>
                <div className="space-y-3">
                  {config.instructions.map((instruction) => (
                    <div key={instruction.step} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
                          {instruction.step}
                        </div>
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900 mb-1">{instruction.title}</h5>
                          <p className="text-sm text-gray-600 mb-2">{instruction.description}</p>
                          {instruction.command && (
                            <div className="bg-gray-900 rounded p-2 flex items-center justify-between group">
                              <code className="text-green-400 text-xs font-mono">{instruction.command}</code>
                              <button
                                onClick={() => handleCopy(instruction.command!, `cmd-${instruction.step}`)}
                                className="opacity-0 group-hover:opacity-100 transition px-2 py-1 text-white hover:bg-gray-700 rounded"
                                title={t('settings.vpn.copy_config')}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-red-800 text-sm font-medium mb-1">
                    {t('settings.vpn.error') || 'Error'}
                  </p>
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Info */}
      {(config?.configured || serviceStatus?.active) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-semibold text-blue-900 mb-2">{t('settings.vpn.important_info')}</h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>{t('settings.vpn.info_secure')}</li>
                <li>{t('settings.vpn.info_unique')}</li>
                <li>{t('settings.vpn.info_private')}</li>
                <li>{t('settings.vpn.info_encrypted')}</li>
                <li>{t('settings.vpn.info_support')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
