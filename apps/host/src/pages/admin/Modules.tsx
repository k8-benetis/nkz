// =============================================================================
// Modules Management Page - Admin Panel
// =============================================================================
// Allows TenantAdmin and PlatformAdmin to view and manage installed modules.

import React, { useState, useEffect } from 'react';
import { useModules } from '@/context/ModuleContext';
import { useAuth } from '@/context/KeycloakAuthContext';
import { NekazariClient, useTranslation } from '@nekazari/sdk';
import { Card } from '@nekazari/ui-kit';
import { Button } from '@nekazari/ui-kit';
import { CheckCircle2, XCircle, Package, RefreshCw, Upload } from 'lucide-react';
import { getConfig } from '@/config/environment';
import { ModuleUploadModal } from '@/components/ModuleUploadModal';

const config = getConfig();
const API_BASE_URL = config.api.baseUrl || '/api';

interface MarketplaceModule {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  version: string;
  author?: string;
  category?: string;
  icon_url?: string;
  company_logo_url?: string;
  developer_organization?: string;
  nkz_validated?: boolean;
  nkz_validated_at?: string | null;
  is_active: boolean;
  required_roles?: string[];
  metadata?: Record<string, any>;
  module_type?: 'CORE' | 'ADDON_FREE' | 'ADDON_PAID' | 'ENTERPRISE';
  required_plan_type?: 'basic' | 'premium' | 'enterprise';
  pricing_tier?: 'FREE' | 'PAID' | 'ENTERPRISE_ONLY';
}

export const Modules: React.FC = () => {
  const { modules: rawInstalledModules, refresh: refreshInstalled } = useModules();
  const { getToken, tenantId, hasRole } = useAuth();
  const { t } = useTranslation('common');
  const [marketplaceModules, setMarketplaceModules] = useState<MarketplaceModule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [activating, setActivating] = useState<Set<string>>(new Set());
  const [canInstallChecks, setCanInstallChecks] = useState<Map<string, { can_install: boolean; reason: string }>>(new Map());
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Ensure installedModules is always an array
  const installedModules = Array.isArray(rawInstalledModules) ? rawInstalledModules : [];

  const isPlatformAdmin = hasRole('PlatformAdmin');
  const isTenantAdmin = hasRole('TenantAdmin');
  const isTechnicalConsultant = hasRole('TechnicalConsultant');
  const isAdmin = isPlatformAdmin || isTenantAdmin;
  const canManageModules = isPlatformAdmin || isTenantAdmin || isTechnicalConsultant;

  useEffect(() => {
    if (canManageModules) {
      loadMarketplace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageModules]); // Only depend on canManageModules to avoid infinite loops

  // Check installation eligibility for each module
  useEffect(() => {
    if (marketplaceModules.length > 0 && !isPlatformAdmin) {
      // Only check for non-PlatformAdmin users (they can install anything)
      checkModuleEligibility();
    }
  }, [marketplaceModules, isPlatformAdmin]);

  const checkModuleEligibility = async () => {
    const checks = new Map<string, { can_install: boolean; reason: string }>();

    // Ensure marketplaceModules is iterable
    const modulesToCheck = Array.isArray(marketplaceModules) ? marketplaceModules : [];
    for (const module of modulesToCheck) {
      try {
        const client = new NekazariClient({
          baseUrl: API_BASE_URL,
          getToken: getToken,
          getTenantId: () => tenantId,
        });

        const response = await client.get<{ can_install: boolean; reason: string }>(`/api/modules/${module.id}/can-install`);
        checks.set(module.id, {
          can_install: response.can_install,
          reason: response.reason
        });
      } catch (err) {
        // If check fails, assume can't install
        checks.set(module.id, {
          can_install: false,
          reason: 'Unable to verify eligibility'
        });
      }
    }

    setCanInstallChecks(checks);
  };

  const loadMarketplace = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const client = new NekazariClient({
        baseUrl: API_BASE_URL,
        getToken: getToken,
        getTenantId: () => tenantId,
      });

      const data = await client.get<MarketplaceModule[]>('/api/modules/marketplace');
      // Ensure data is always an array
      const modules = Array.isArray(data) ? data : [];
      console.log('[Modules] Loaded marketplace modules:', modules.length);
      setMarketplaceModules(modules);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load marketplace modules';
      setError(errorMessage);
      console.error('[Modules] Error loading marketplace:', err);
      setMarketplaceModules([]); // Ensure empty array on error
    } finally {
      setIsLoading(false);
    }
  };

  // Activate/deactivate module in marketplace (PlatformAdmin only)
  const activateMarketplaceModule = async (moduleId: string, currentActive: boolean) => {
    if (activating.has(moduleId)) return;

    setActivating(prev => new Set(prev).add(moduleId));

    try {
      const client = new NekazariClient({
        baseUrl: API_BASE_URL,
        getToken: getToken,
        getTenantId: () => tenantId,
      });

      await client.post(`/api/modules/${moduleId}/activate`, { active: !currentActive });

      // Refresh marketplace to see updated status
      await loadMarketplace();

      console.log(`Module ${moduleId} ${!currentActive ? 'activated' : 'deactivated'} in marketplace`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to activate/deactivate module';
      setError(errorMessage);
      console.error('[Modules] Error activating/deactivating module:', err);
    } finally {
      setActivating(prev => {
        const next = new Set(prev);
        next.delete(moduleId);
        return next;
      });
    }
  };

  // Install/uninstall module for tenant (TenantAdmin, TechnicalConsultant)
  const toggleModule = async (moduleId: string, currentEnabled: boolean) => {
    if (toggling.has(moduleId)) return;

    setToggling(prev => new Set(prev).add(moduleId));

    try {
      const client = new NekazariClient({
        baseUrl: API_BASE_URL,
        getToken: getToken,
        getTenantId: () => tenantId,
      });

      await client.post(`/api/modules/${moduleId}/toggle`, { enabled: !currentEnabled });

      // Refresh installed modules
      await refreshInstalled();

      // Show success feedback (could use a toast library)
      console.log(`Module ${moduleId} ${!currentEnabled ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      // Extract detailed error message from API response
      let errorMessage = 'Error al instalar/desinstalar el módulo';
      let errorMessageEn = 'Failed to install/uninstall module';

      if (err?.response?.data) {
        const errorData = err.response.data;
        // Use Spanish message if available, fallback to English, then to error field
        errorMessage = errorData.message || errorData.reason || errorData.error || errorMessage;
        errorMessageEn = errorData.message_en || errorData.reason_en || errorData.error_en || errorMessageEn;

        // Add help text if available
        if (errorData.help_text) {
          errorMessage += `\n\n${errorData.help_text}`;
        }
        if (errorData.help_text_en) {
          errorMessageEn += `\n\n${errorData.help_text_en}`;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
        errorMessageEn = err.message;
      }

      // Show user-friendly error message
      const displayMessage = navigator.language.startsWith('es') ? errorMessage : errorMessageEn;
      setError(displayMessage);
      console.error('[Modules] Error toggling module:', err);

      // Show alert to user with detailed information
      if (err?.response?.data?.action_required === 'upgrade_plan') {
        alert(displayMessage);
      }
    } finally {
      setToggling(prev => {
        const next = new Set(prev);
        next.delete(moduleId);
        return next;
      });
    }
  };

  const isModuleInstalled = (moduleId: string): boolean => {
    return installedModules.some(m => m.id === moduleId);
  };

  const isModuleEnabled = (moduleId: string): boolean => {
    const installed = installedModules.find(m => m.id === moduleId);
    return installed !== undefined;
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-center py-8">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You need TenantAdmin or PlatformAdmin role to manage modules.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 host-layout-protected" style={{ contain: 'layout style' }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('module_management')}</h1>
          <p className="text-gray-600 mt-1">{t('manage_remote_modules')}</p>
        </div>
        <div className="flex gap-3">
          {isPlatformAdmin && (
            <Button
              variant="primary"
              onClick={() => setIsUploadModalOpen(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Module
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              loadMarketplace();
              refreshInstalled();
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Installed Modules Section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('installed_modules')} ({installedModules?.length || 0})</h2>
        {(!installedModules || installedModules.length === 0) ? (
          <Card>
            <div className="text-center py-8 text-gray-500">
              {t('no_modules_installed')}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {installedModules.filter(m => m && m.id).map((module) => (
              <Card key={module.id} padding="md" className="hover:shadow-md transition-shadow">
                {/* Header with Icon, Title, and Status */}
                <div className="flex items-start gap-3 mb-4">
                  {/* Module Icon */}
                  <div className="flex-shrink-0">
                    {module.icon ? (
                      <img
                        src={module.icon}
                        alt={module.displayName}
                        className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Package className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Title and Version - Clear separation */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 text-base leading-tight break-words">
                        {module.displayName || module.name || module.id}
                      </h3>
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        v{module.version || '1.0.0'}
                      </span>
                      {module.moduleType && (
                        <span className={`text-xs px-2 py-0.5 rounded ${module.moduleType === 'CORE' ? 'bg-blue-100 text-blue-700' :
                          module.moduleType === 'ADDON_FREE' ? 'bg-green-100 text-green-700' :
                            module.moduleType === 'ADDON_PAID' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-purple-100 text-purple-700'
                          }`}>
                          {module.moduleType === 'CORE' ? t('core') :
                            module.moduleType === 'ADDON_FREE' ? t('free') :
                              module.moduleType === 'ADDON_PAID' ? t('paid') :
                                t('enterprise')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description - Clear spacing */}
                <div className="mb-4">
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                    {module.metadata?.description || 'No hay descripción disponible para este módulo.'}
                  </p>
                </div>

                {/* Route and Actions - Clear separation */}
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-gray-500 block truncate">
                        <span className="font-medium">{t('route')}:</span> {module.routePath || `/${module.id}`}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleModule(module.id, true)}
                      disabled={toggling.has(module.id)}
                      className="flex-shrink-0"
                    >
                      {toggling.has(module.id) ? '...' : t('deactivate')}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Marketplace Section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {isPlatformAdmin ? t('all_modules_marketplace') : t('available_modules')}
        </h2>
        {isPlatformAdmin && (
          <p className="text-sm text-gray-600 mb-4">
            {t('activate_modules_visible')}
          </p>
        )}
        {isLoading ? (
          <Card>
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
              <p className="text-gray-600">{t('loading_marketplace')}</p>
            </div>
          </Card>
        ) : (!marketplaceModules || marketplaceModules.length === 0) ? (
          <Card>
            <div className="text-center py-8 text-gray-500">{t('no_modules_available')}</div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {marketplaceModules.filter(m => m && m.id).map((module) => {
              const installed = isModuleInstalled(module.id);
              const enabled = isModuleEnabled(module.id);
              const isToggling = toggling.has(module.id);
              const isActivating = activating.has(module.id);
              const isInactive = !module.is_active;
              const eligibilityCheck = canInstallChecks.get(module.id);
              const cannotInstall = !isPlatformAdmin && eligibilityCheck && !eligibilityCheck.can_install;

              return (
                <Card
                  key={module.id}
                  padding="md"
                  className={`hover:shadow-md transition-shadow ${isInactive && isPlatformAdmin ? 'opacity-60 bg-gray-50' : ''}`}
                >
                  {/* Header with Icon, Title, and Status */}
                  <div className="flex items-start gap-3 mb-4">
                    {/* Module Icon */}
                    <div className="flex-shrink-0">
                      {module.icon_url ? (
                        <img
                          src={module.icon_url}
                          alt={module.display_name}
                          className={`w-12 h-12 rounded-lg object-cover border border-gray-200 ${isInactive ? 'grayscale opacity-50' : ''}`}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center ${isInactive ? 'opacity-50' : ''}`}>
                          <Package className={`w-6 h-6 ${isInactive ? 'text-gray-300' : 'text-gray-400'}`} />
                        </div>
                      )}
                    </div>

                    {/* Title, Version, and Badges - Clear separation */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className={`font-semibold text-base leading-tight break-words ${isInactive ? 'text-gray-500' : 'text-gray-900'}`}>
                          {module.display_name || module.name || module.id}
                        </h3>
                        {installed && enabled && (
                          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        )}
                      </div>

                      {/* Version, Author, and Developer Org - Clear line */}
                      <div className="mb-2">
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded mr-2">
                          v{module.version || '1.0.0'}
                        </span>
                        {module.developer_organization && (
                          <span className="text-xs text-gray-500">por {module.developer_organization}</span>
                        )}
                        {!module.developer_organization && module.author && (
                          <span className="text-xs text-gray-500">por {module.author}</span>
                        )}
                      </div>

                      {/* Badges - Clear spacing */}
                      <div className="flex flex-wrap gap-1.5">
                        {/* NKZ Validated Badge - Show first for prominence */}
                        {module.nkz_validated && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 rounded" title="Módulo verificado por el equipo NKZ">
                            <CheckCircle2 className="w-3 h-3" />
                            NKZ
                          </span>
                        )}
                        {/* Module Type Badge */}
                        {module.module_type && (
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${module.module_type === 'CORE' ? 'bg-blue-100 text-blue-800' :
                            module.module_type === 'ADDON_FREE' ? 'bg-green-100 text-green-800' :
                              module.module_type === 'ADDON_PAID' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-purple-100 text-purple-800'
                            }`}>
                            {module.module_type === 'CORE' ? t('core') :
                              module.module_type === 'ADDON_FREE' ? t('free') :
                                module.module_type === 'ADDON_PAID' ? t('paid') :
                                  t('enterprise')}
                          </span>
                        )}
                        {/* Inactive Badge */}
                        {isInactive && isPlatformAdmin && (
                          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                            {t('inactive')}
                          </span>
                        )}
                        {/* Plan Requirement Badge */}
                        {module.required_plan_type && !isPlatformAdmin && (
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${module.required_plan_type === 'premium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-purple-100 text-purple-800'
                            }`}>
                            {t('requires_plan')} {t(module.required_plan_type)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description - Clear spacing */}
                  <div className="mb-4">
                    <p className={`text-sm leading-relaxed line-clamp-3 ${isInactive ? 'text-gray-400' : 'text-gray-600'}`}>
                      {module.description || 'No hay descripción disponible para este módulo.'}
                    </p>
                  </div>

                  {/* Category Tag */}
                  {module.category && (
                    <div className="mb-4">
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${isInactive ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 text-gray-700'}`}>
                        {module.category}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${isInactive ? 'text-gray-400' : 'text-gray-500'}`}>
                      {installed ? t('installed') : t('not_installed')}
                    </span>
                    <div className="flex gap-2">
                      {/* PlatformAdmin: Activate/deactivate in marketplace */}
                      {isPlatformAdmin && (
                        <Button
                          variant={module.is_active ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={() => activateMarketplaceModule(module.id, module.is_active)}
                          disabled={isActivating}
                        >
                          {isActivating ? '...' : module.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                      {/* TenantAdmin/TechnicalConsultant: Install/uninstall for tenant */}
                      {!isPlatformAdmin && (
                        <>
                          {cannotInstall ? (
                            <div className="flex flex-col items-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={true}
                                className="opacity-50 cursor-not-allowed"
                              >
                                Install
                              </Button>
                              <span className="text-xs text-red-600 mt-1 text-right max-w-[120px]">
                                {eligibilityCheck?.reason || t('cannot_install')}
                              </span>
                            </div>
                          ) : (
                            <Button
                              variant={enabled ? 'secondary' : 'primary'}
                              size="sm"
                              onClick={() => toggleModule(module.id, enabled)}
                              disabled={isToggling || isInactive}
                            >
                              {isToggling ? '...' : enabled ? t('uninstall') : t('install')}
                            </Button>
                          )}
                        </>
                      )}
                      {/* PlatformAdmin can also install for their tenant */}
                      {isPlatformAdmin && module.is_active && (
                        <Button
                          variant={enabled ? 'ghost' : 'primary'}
                          size="sm"
                          onClick={() => toggleModule(module.id, enabled)}
                          disabled={isToggling}
                        >
                          {isToggling ? '...' : enabled ? t('uninstall') : t('install')}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Module Upload Modal */}
      {isPlatformAdmin && (
        <ModuleUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={() => {
            // Refresh modules list after successful upload
            loadMarketplace();
            refreshInstalled();
          }}
        />
      )}
    </div>
  );
};

