import React from 'react';
import { CalendarClock, ShieldCheck, Zap, Users, Bot, Gauge, MapPin, RefreshCw } from 'lucide-react';
import type { TenantLimits, TenantUsageStats } from '@/types';
import { ProgressBar } from './ProgressBar';

interface PlanSummaryCardProps {
  planType?: string | null;
  daysRemaining?: number | null;
  expiresAt?: string | null;
  limits?: TenantLimits;
  usage?: TenantUsageStats;
  updatedAt?: string;
}

const formatPlanName = (planType?: string | null): string => {
  if (!planType) return 'Plan Básico';
  
  // Normalize plan type names
  const normalized = planType.toLowerCase().replace(/[-_]+/g, ' ').trim();
  
  // Map common variations to standard names
  const planMap: Record<string, string> = {
    'basic': 'Plan Básico',
    'basico': 'Plan Básico',
    'advance': 'Plan Avanzado',
    'avanzado': 'Plan Avanzado',
    'advanced': 'Plan Avanzado',
    'enterprise': 'Plan Enterprise',
    'empresarial': 'Plan Enterprise',
  };
  
  // Check if normalized matches a known plan
  if (planMap[normalized]) {
    return planMap[normalized];
  }
  
  // Fallback: capitalize first letter
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatExpiration = (daysRemaining?: number | null): { label: string; tone: string } => {
  if (typeof daysRemaining !== 'number') {
    return { label: 'Sin datos de expiración', tone: 'text-gray-500' };
  }
  if (daysRemaining <= 0) {
    return { label: 'Plan expirado', tone: 'text-red-600 font-semibold' };
  }
  if (daysRemaining <= 3) {
    return { label: `Expira en ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}`, tone: 'text-red-500 font-semibold' };
  }
  if (daysRemaining <= 7) {
    return { label: `Expira en ${daysRemaining} días`, tone: 'text-orange-500 font-semibold' };
  }
  return { label: `Expira en ${daysRemaining} días`, tone: 'text-emerald-600 font-semibold' };
};

export const PlanSummaryCard: React.FC<PlanSummaryCardProps> = ({
  planType,
  daysRemaining,
  expiresAt,
  limits,
  usage,
  updatedAt,
}) => {
  const expiration = formatExpiration(daysRemaining);
  const planName = formatPlanName(planType ?? limits?.planType ?? undefined);
  const robotsInUse = usage?.robots ?? 0;
  const sensorsInUse = usage?.sensors ?? 0;
  const areaInUse = usage?.areaHectares ?? 0;

  return (
    <div className="mb-8 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 px-6 py-4 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6" />
          <div>
            <h2 className="text-xl font-semibold">Resumen del Plan</h2>
            <p className="text-sm text-emerald-100">Gestión centralizada de límites y uso del tenant</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            <span className="font-medium">{planName}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            <span className={expiration.tone}>{expiration.label}</span>
          </div>
          {expiresAt && (
            <span className="hidden md:block text-emerald-100">({new Date(expiresAt).toLocaleDateString('es-ES')})</span>
          )}
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500 dark:text-gray-400">Usuarios</div>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {limits?.maxUsers ?? '—'}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Usuarios permitidos por plan</p>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500 dark:text-gray-400">Robots</div>
            <Bot className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            {robotsInUse} en uso {limits?.maxRobots ? `de ${limits.maxRobots}` : ''}
          </div>
          <ProgressBar
            value={robotsInUse}
            max={limits?.maxRobots ?? undefined}
            label="Uso de robots"
            barClassName="bg-gradient-to-r from-blue-500 to-blue-600"
          />
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500 dark:text-gray-400">Sensores</div>
            <Gauge className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            {sensorsInUse} en uso {limits?.maxSensors ? `de ${limits.maxSensors}` : ''}
          </div>
          <ProgressBar
            value={sensorsInUse}
            max={limits?.maxSensors ?? undefined}
            label="Uso de sensores"
            barClassName="bg-gradient-to-r from-green-500 to-green-600"
          />
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500 dark:text-gray-400">Superficie monitorizada</div>
            <MapPin className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            {areaInUse.toFixed(2)} ha {limits?.maxAreaHectares ? `de ${limits.maxAreaHectares} ha` : ''}
          </div>
          <ProgressBar
            value={areaInUse}
            max={limits?.maxAreaHectares ?? undefined}
            label="Cobertura"
            barClassName="bg-gradient-to-r from-amber-500 to-amber-600"
          />
        </div>
      </div>

      <div className="px-6 pb-5 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-3 h-3" />
          <span>
            Datos actualizados {updatedAt ? new Date(updatedAt).toLocaleString('es-ES') : 'recientemente'}
          </span>
        </div>
        <span>Plan: {planName}</span>
      </div>
    </div>
  );
};

export default PlanSummaryCard;
