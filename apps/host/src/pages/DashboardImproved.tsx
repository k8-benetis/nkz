// =============================================================================
// Improved Dashboard - Modern and Professional
// =============================================================================

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useI18n } from '@/context/I18nContext';
import { Layout } from '@/components/Layout';
import { CesiumMap } from '@/components/CesiumMap';
import { useViewer } from '@/context/ViewerContext';
import { GrafanaAccess } from '@/components/GrafanaAccess';
import { WeatherWidget } from '@/components/WeatherWidget';
import { WeatherAgroPanel } from '@/components/WeatherAgroPanel';
import { PlanSummaryCard } from '@/components/dashboard/PlanSummaryCard';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { TenantInfoWidget } from '@/components/dashboard/TenantInfoWidget';
import { RobotsStatusCard } from '@/components/dashboard/RobotsStatusCard';
import { EnvironmentalSensorsCard } from '@/components/dashboard/EnvironmentalSensorsCard';
import { AgriculturalMachinesCard } from '@/components/dashboard/AgriculturalMachinesCard';
import { LivestockCard } from '@/components/dashboard/LivestockCard';
import { WeatherStationsCard } from '@/components/dashboard/WeatherStationsCard';
import { ParcelsOverviewCard } from '@/components/dashboard/ParcelsOverviewCard';
import { AlertsCard } from '@/components/dashboard/AlertsCard';
import { useDashboardData } from '@/hooks/dashboard/useDashboardData';
import { getExpirationAlert } from '@/utils/keycloakHelpers';
import {
  Bot,
  Gauge,
  MapPin,
  Activity,
  TrendingUp,
  AlertCircle,
  Clock,
  Zap,
  Plus,
  X
} from 'lucide-react';
import { EntityWizard } from '@/components/EntityWizard';
import { SlotRegistryProvider } from '@/context/SlotRegistry';
import { SlotRenderer } from '@/components/SlotRenderer';

export const DashboardImproved: React.FC = () => {
  const navigate = useNavigate();
  const { hasAnyRole } = useAuth();
  const { t } = useI18n();
  const { mapMode, pickingCallback, cancelPicking } = useViewer();

  // Check permissions
  const canManageDevices = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant']);

  // Data loading via extracted hook
  const {
    robots, sensors, parcels, machines, livestock, weatherStations,
    isLoading, expirationInfo, tenantUsage, loadData
  } = useDashboardData();

  // Entity Wizard State
  const [showEntityWizard, setShowEntityWizard] = useState(false);
  const [wizardInitialType, setWizardInitialType] = useState<string | undefined>(undefined);

  const openWizard = useCallback((entityType: string) => {
    setWizardInitialType(entityType);
    setShowEntityWizard(true);
  }, []);

  const activeRobots = robots.filter(r => r.status?.value === 'working').length;
  const idleRobots = robots.filter(r => r.status?.value === 'idle').length;
  const chargingRobots = robots.filter(r => r.status?.value === 'charging').length;

  const avgTemperature = sensors.length > 0
    ? sensors.reduce((sum, s) => sum + (s.temperature?.value || 0), 0) / sensors.length
    : 0;

  const usageStats = tenantUsage?.usage;
  const robotLimit = tenantUsage?.limits?.maxRobots ?? null;
  const sensorLimit = tenantUsage?.limits?.maxSensors ?? null;
  const areaLimit = tenantUsage?.limits?.maxAreaHectares ?? null;
  const lastUsageUpdate = tenantUsage?.timestamp;

  const expirationAlert = getExpirationAlert(expirationInfo);

  return (
    <Layout className="host-layout-protected">
      <SlotRegistryProvider>
      {/* Expiration Alert */}
      {expirationAlert && (
        <div className={`mb-6 p-4 rounded-lg border ${expirationAlert.color} flex items-center justify-between`}>
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-3" />
            <p className="font-medium">{expirationAlert.message}</p>
            {expirationInfo?.expires_at && (
              <span className="ml-2 text-sm opacity-75">
                (Expira: {new Date(expirationInfo.expires_at).toLocaleDateString('es-ES')})
              </span>
            )}
          </div>
          <a
            href="/settings"
            className="px-4 py-2 bg-white dark:bg-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition font-medium text-sm text-gray-900 dark:text-gray-100"
          >
            Renovar
          </a>
        </div>
      )}

      {/* Welcome Section - Replaced by TenantInfoWidget */}
      <TenantInfoWidget />

      {/* Plan Summary */}
      <PlanSummaryCard
        planType={tenantUsage?.limits?.planType || expirationInfo?.plan}
        daysRemaining={expirationInfo?.days_remaining ?? null}
        expiresAt={expirationInfo?.expires_at ?? null}
        limits={tenantUsage?.limits}
        usage={usageStats}
        updatedAt={lastUsageUpdate}
      />

      {/* Quick Stats - Modern Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Robots Totales"
          value={robots.length}
          description={`${activeRobots} activos • ${idleRobots} inactivos`}
          icon={Bot}
          accentIcon={TrendingUp}
          gradientFrom="from-blue-500"
          gradientTo="to-blue-600"
          footer={usageStats && robotLimit ? `Capacidad: ${usageStats.robots}/${robotLimit}` : undefined}
        >
          {usageStats && robotLimit ? (
            <ProgressBar
              value={usageStats.robots}
              max={robotLimit ?? undefined}
              label={`Uso ${usageStats.robots}/${robotLimit}`}
              showLabel
              labelClassName="text-white text-xs text-opacity-80"
              valueClassName="text-white font-semibold"
              barClassName="bg-white dark:bg-gray-700"
            />
          ) : null}
        </MetricCard>

        <MetricCard
          title="Sensores Activos"
          value={sensors.length}
          description={`${sensors.length} en línea • ${avgTemperature.toFixed(1)}°C promedio`}
          icon={Gauge}
          accentIcon={Activity}
          gradientFrom="from-green-500"
          gradientTo="to-green-600"
          footer={usageStats && sensorLimit ? `Capacidad: ${usageStats.sensors}/${sensorLimit}` : undefined}
        >
          {usageStats && sensorLimit ? (
            <ProgressBar
              value={usageStats.sensors}
              max={sensorLimit ?? undefined}
              label={`Uso ${usageStats.sensors}/${sensorLimit}`}
              showLabel
              labelClassName="text-white text-xs text-opacity-80"
              valueClassName="text-white font-semibold"
              barClassName="bg-white dark:bg-gray-700"
            />
          ) : null}
        </MetricCard>

        <MetricCard
          title={t('dashboard.registered_parcels')}
          value={parcels.length}
          description={t('dashboard.monitoring')}
          icon={MapPin}
          accentIcon={Zap}
          gradientFrom="from-yellow-500"
          gradientTo="to-yellow-600"
          footer={usageStats && areaLimit ? t('dashboard.area', { current: usageStats.areaHectares.toFixed(2), limit: areaLimit.toString() }) : undefined}
        >
          {usageStats && areaLimit ? (
            <ProgressBar
              value={usageStats.areaHectares}
              max={areaLimit ?? undefined}
              label={t('dashboard.area_label', { area: usageStats.areaHectares.toFixed(2) })}
              showLabel
              labelClassName="text-white text-xs text-opacity-80"
              valueClassName="text-white font-semibold"
              barClassName="bg-white dark:bg-gray-700"
            />
          ) : null}
        </MetricCard>

        <MetricCard
          title={t('dashboard.system_operational')}
          value="100%"
          description={t('dashboard.all_services_active')}
          icon={Activity}
          gradientFrom="from-purple-500"
          gradientTo="to-purple-600"
          footer={lastUsageUpdate ? t('dashboard.last_update', { time: new Date(lastUsageUpdate).toLocaleTimeString('es-ES') }) : undefined}
        >
          <div className="flex items-center gap-2 text-xs text-white text-opacity-80">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
            {t('dashboard.nominal_status')}
          </div>
        </MetricCard>
      </div>

      {/* Weather Widget Section - Uses tenant municipality */}
      <div className="mb-8">
        <WeatherWidget />
      </div>

      {/* Weather Agro Panel Section - Auto-detects tenant municipality */}
      <div className="mb-8">
        <WeatherAgroPanel />
      </div>

      {/* Grafana Access Section */}
      <div className="mb-8">
        <GrafanaAccess />
      </div>

      {/* 3D Map Section */}
      <div className="mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <MapPin className="w-6 h-6" />
              {t('dashboard.overview')}
            </h2>
            {canManageDevices && (
              <button
                onClick={() => navigate('/entities')}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition text-white text-sm flex items-center gap-2"
                title={t('dashboard.add_parcel')}
              >
                <Plus className="w-4 h-4" />
                {t('dashboard.add_parcel')}
              </button>
            )}
          </div>
          <div className="p-0">
            <CesiumMap
              title={t('dashboard.overview')}
              height="h-[500px]"
              showControls={false}
              robots={robots}
              sensors={sensors}
              parcels={parcels}
              machines={machines}
              livestock={livestock}
              weatherStations={weatherStations}
              enable3DTerrain={true}
              terrainProvider="auto"
              enable3DTiles={true}
              tilesetUrl="https://idena.navarra.es/3dtiles/Pamplona2025/tileset.json"
              mode={mapMode === 'PICK_LOCATION' ? 'picker' : 'view'}
              onMapClick={(lat, lon) => {
                if (mapMode === 'PICK_LOCATION' && pickingCallback) {
                  pickingCallback(lat, lon);
                  cancelPicking();
                }
              }}
            />
            {mapMode === 'PICK_LOCATION' && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-2 rounded-full shadow-lg z-50 animate-pulse font-medium flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Haga clic en el mapa para seleccionar ubicación
                <button
                  onClick={cancelPicking}
                  className="ml-2 bg-white/20 hover:bg-white/30 rounded-full p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Robots Status */}
        <RobotsStatusCard robots={robots} isLoading={isLoading} canManageDevices={canManageDevices} />

        {/* Activity Feed */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-6 h-6" />
              {t('dashboard.recent_activity')}
            </h2>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('dashboard.robot_activated')}</p>
                  <p className="text-xs text-gray-500">{t('dashboard.minutes_ago', { minutes: '5' })}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('dashboard.new_sensor_registered')}</p>
                  <p className="text-xs text-gray-500">{t('dashboard.hour_ago', { hours: '1' })}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('dashboard.data_update')}</p>
                  <p className="text-xs text-gray-500">{t('dashboard.hours_ago', { hours: '2' })}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sensors Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EnvironmentalSensorsCard sensors={sensors} canManageDevices={canManageDevices} onOpenWizard={openWizard} />
        <AgriculturalMachinesCard machines={machines} canManageDevices={canManageDevices} onOpenWizard={openWizard} />
      </div>

      {/* Livestock and Weather Stations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <LivestockCard livestock={livestock} canManageDevices={canManageDevices} onOpenWizard={openWizard} />
        <WeatherStationsCard weatherStations={weatherStations} canManageDevices={canManageDevices} onOpenWizard={openWizard} />
      </div>

      {/* Module Dashboard Widgets */}
      <SlotRenderer
        slot="dashboard-widget"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
      />

      {/* Parcels Overview */}
      <ParcelsOverviewCard parcels={parcels} />

      {/* Alerts Section */}
      <AlertsCard chargingRobots={chargingRobots} />

      {/* Unified Entity Wizard */}
      <EntityWizard
        isOpen={showEntityWizard}
        onClose={() => setShowEntityWizard(false)}
        initialEntityType={wizardInitialType}
        onSuccess={() => {
          loadData();
        }}
      />
      </SlotRegistryProvider>
    </Layout>
  );
};
