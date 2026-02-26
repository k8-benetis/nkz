// =============================================================================
// Dashboard — Nekazari Platform
// =============================================================================
// Operational view: weather + agroclimate, active risks, entity inventory.
// All data is real. No hardcoded content.

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useI18n } from '@/context/I18nContext';
import { Layout } from '@/components/Layout';
import { WeatherWidget } from '@/components/WeatherWidget';
import { WeatherAgroPanel } from '@/components/WeatherAgroPanel';
import { PlanSummaryCard } from '@/components/dashboard/PlanSummaryCard';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { TenantInfoWidget } from '@/components/dashboard/TenantInfoWidget';
import { RiskSummaryCard } from '@/components/dashboard/RiskSummaryCard';
import { EnvironmentalSensorsCard } from '@/components/dashboard/EnvironmentalSensorsCard';
import { AgriculturalMachinesCard } from '@/components/dashboard/AgriculturalMachinesCard';
import { LivestockCard } from '@/components/dashboard/LivestockCard';
import { WeatherStationsCard } from '@/components/dashboard/WeatherStationsCard';
import { ParcelsOverviewCard } from '@/components/dashboard/ParcelsOverviewCard';
import { useDashboardData } from '@/hooks/dashboard/useDashboardData';
import { getExpirationAlert } from '@/utils/keycloakHelpers';
import {
  Bot,
  Gauge,
  MapPin,
  Activity,
  TrendingUp,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { EntityWizard } from '@/components/EntityWizard';
import { SlotRegistryProvider } from '@/context/SlotRegistry';
import { SlotRenderer } from '@/components/SlotRenderer';

export const DashboardImproved: React.FC = () => {
  const navigate = useNavigate();
  const { hasAnyRole } = useAuth();
  const { t } = useI18n();

  const canManageDevices = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant']);

  const {
    robots, sensors, parcels, machines, livestock, weatherStations,
    isLoading, expirationInfo, tenantUsage, loadData
  } = useDashboardData();

  const [showEntityWizard, setShowEntityWizard] = useState(false);
  const [wizardInitialType, setWizardInitialType] = useState<string | undefined>(undefined);

  const openWizard = useCallback((entityType: string) => {
    setWizardInitialType(entityType);
    setShowEntityWizard(true);
  }, []);

  const activeRobots = robots.filter(r => r.status?.value === 'working').length;

  const usageStats = tenantUsage?.usage;
  const robotLimit = tenantUsage?.limits?.maxRobots ?? null;
  const sensorLimit = tenantUsage?.limits?.maxSensors ?? null;
  const areaLimit = tenantUsage?.limits?.maxAreaHectares ?? null;
  const lastUsageUpdate = tenantUsage?.timestamp;

  const totalEntities =
    robots.length + sensors.length + parcels.length +
    machines.length + livestock.length + weatherStations.length;

  const expirationAlert = getExpirationAlert(expirationInfo);

  return (
    <Layout className="host-layout-protected">
      <SlotRegistryProvider>

        {/* ── Expiration alert ───────────────────────────────────────────── */}
        {expirationAlert && (
          <div className={`mb-6 p-4 rounded-lg border ${expirationAlert.color} flex items-center justify-between`}>
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
              <p className="font-medium">{expirationAlert.message}</p>
              {expirationInfo?.expires_at && (
                <span className="ml-2 text-sm opacity-75">
                  (Expira: {new Date(expirationInfo.expires_at).toLocaleDateString('es-ES')})
                </span>
              )}
            </div>
            <a
              href="/settings"
              className="px-4 py-2 bg-white dark:bg-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition font-medium text-sm text-gray-900 dark:text-gray-100 flex-shrink-0 ml-4"
            >
              Renovar
            </a>
          </div>
        )}

        {/* ── Tenant header ──────────────────────────────────────────────── */}
        <TenantInfoWidget />

        {/* ── KPI row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            title={t('dashboard.registered_parcels')}
            value={parcels.length}
            description={t('dashboard.monitoring')}
            icon={MapPin}
            accentIcon={TrendingUp}
            gradientFrom="from-green-500"
            gradientTo="to-green-600"
            footer={usageStats && areaLimit
              ? t('dashboard.area', { current: usageStats.areaHectares.toFixed(1), limit: areaLimit.toString() })
              : undefined}
          >
            {usageStats && areaLimit ? (
              <ProgressBar
                value={usageStats.areaHectares}
                max={areaLimit}
                label={t('dashboard.area_label', { area: usageStats.areaHectares.toFixed(1) })}
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
            description="en línea"
            icon={Gauge}
            accentIcon={Activity}
            gradientFrom="from-blue-500"
            gradientTo="to-blue-600"
            footer={usageStats && sensorLimit ? `Capacidad: ${usageStats.sensors}/${sensorLimit}` : undefined}
          >
            {usageStats && sensorLimit ? (
              <ProgressBar
                value={usageStats.sensors}
                max={sensorLimit}
                label={`${usageStats.sensors}/${sensorLimit}`}
                showLabel
                labelClassName="text-white text-xs text-opacity-80"
                valueClassName="text-white font-semibold"
                barClassName="bg-white dark:bg-gray-700"
              />
            ) : null}
          </MetricCard>

          <MetricCard
            title="Robots"
            value={robots.length}
            description={`${activeRobots} activos`}
            icon={Bot}
            accentIcon={Activity}
            gradientFrom="from-indigo-500"
            gradientTo="to-indigo-600"
            footer={usageStats && robotLimit ? `Capacidad: ${usageStats.robots}/${robotLimit}` : undefined}
          >
            {usageStats && robotLimit ? (
              <ProgressBar
                value={usageStats.robots}
                max={robotLimit}
                label={`${usageStats.robots}/${robotLimit}`}
                showLabel
                labelClassName="text-white text-xs text-opacity-80"
                valueClassName="text-white font-semibold"
                barClassName="bg-white dark:bg-gray-700"
              />
            ) : null}
          </MetricCard>

          <MetricCard
            title="Entidades Registradas"
            value={isLoading ? '…' : totalEntities}
            description={`${parcels.length} parcelas · ${sensors.length} sensores · ${robots.length} robots`}
            icon={Layers}
            gradientFrom="from-purple-500"
            gradientTo="to-purple-600"
            footer={lastUsageUpdate
              ? `Actualizado ${new Date(lastUsageUpdate).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
              : undefined}
          >
            <button
              onClick={() => navigate('/entities')}
              className="text-xs text-white/80 hover:text-white underline underline-offset-2 transition"
            >
              Ver todas las entidades →
            </button>
          </MetricCard>
        </div>

        {/* ── Weather + Risks (main) ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Left: weather stacked */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <WeatherWidget />
            <WeatherAgroPanel />
          </div>

          {/* Right: risk summary — sticky context while scrolling */}
          <div className="lg:col-span-1">
            <RiskSummaryCard />
          </div>
        </div>

        {/* ── Sensors + Parcels ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <EnvironmentalSensorsCard
            sensors={sensors}
            canManageDevices={canManageDevices}
            onOpenWizard={openWizard}
          />
          <ParcelsOverviewCard parcels={parcels} />
        </div>

        {/* ── Machines + Livestock + Weather Stations ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <AgriculturalMachinesCard
            machines={machines}
            canManageDevices={canManageDevices}
            onOpenWizard={openWizard}
          />
          <LivestockCard
            livestock={livestock}
            canManageDevices={canManageDevices}
            onOpenWizard={openWizard}
          />
          <WeatherStationsCard
            weatherStations={weatherStations}
            canManageDevices={canManageDevices}
            onOpenWizard={openWizard}
          />
        </div>

        {/* ── Plan & limits ──────────────────────────────────────────────── */}
        <div className="mb-6">
          <PlanSummaryCard
            planType={tenantUsage?.limits?.planType || expirationInfo?.plan}
            daysRemaining={expirationInfo?.days_remaining ?? null}
            expiresAt={expirationInfo?.expires_at ?? null}
            limits={tenantUsage?.limits}
            usage={usageStats}
            updatedAt={lastUsageUpdate}
          />
        </div>

        {/* ── Module dashboard widgets ───────────────────────────────────── */}
        <SlotRenderer
          slot="dashboard-widget"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
        />

        {/* ── Entity wizard ──────────────────────────────────────────────── */}
        <EntityWizard
          isOpen={showEntityWizard}
          onClose={() => setShowEntityWizard(false)}
          initialEntityType={wizardInitialType}
          onSuccess={loadData}
        />

      </SlotRegistryProvider>
    </Layout>
  );
};
