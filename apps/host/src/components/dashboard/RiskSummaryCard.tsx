// =============================================================================
// Risk Summary Card — Dashboard widget showing active risks for the tenant
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '@/services/api';
import type { RiskState } from '@/types';

// Human-readable labels for known risk codes
const RISK_LABELS: Record<string, string> = {
  MILDIU:            'Mildiu / Botrytis',
  SPRAY_SUITABILITY: 'Pulverización (Delta T)',
  FROST:             'Helada',
  WIND_SPRAY:        'Viento Pulverización',
  WATER_STRESS:      'Estrés Hídrico',
  ENERGY_RISK:       'Riesgo Energético',
  ROBOT_FAILURE:     'Fallo Robot',
  GDD_PRAYS_OLEAE:   'Polilla del Olivo (Prays)',
  GDD_LOBESIA_1ST:   'Lobesia 1.ª gen. (Vid)',
  GDD_LOBESIA_2ND:   'Lobesia 2.ª gen. (Vid)',
};

const SEVERITY_CONFIG: Record<string, { badge: string; bar: string; dot: string; label: string }> = {
  critical: {
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    bar:   'bg-red-500',
    dot:   'bg-red-500',
    label: 'Crítico',
  },
  high: {
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    bar:   'bg-orange-500',
    dot:   'bg-orange-500',
    label: 'Alto',
  },
  medium: {
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    bar:   'bg-yellow-500',
    dot:   'bg-yellow-500',
    label: 'Medio',
  },
  low: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    bar:   'bg-blue-400',
    dot:   'bg-blue-400',
    label: 'Bajo',
  },
};

function computeSeverity(score: number, severity: string | null | undefined): string {
  if (severity && severity in SEVERITY_CONFIG) return severity;
  if (score >= 95) return 'critical';
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

/** Extract a short readable name from a full NGSI-LD URN.
 *  "urn:ngsi-ld:AgriParcel:north-field" → "north-field"
 */
function shortEntityName(entityId: string): string {
  if (!entityId) return entityId;
  const parts = entityId.split(':');
  return parts[parts.length - 1] || entityId;
}

function riskLabel(code: string): string {
  return RISK_LABELS[code] ?? code.replace(/_/g, ' ');
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const RiskSummaryCard: React.FC = () => {
  const navigate = useNavigate();
  const [states, setStates] = useState<RiskState[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getRiskStates({ limit: 30 })
      .then(data => {
        setStates(data);
        setLastUpdated(new Date());
      })
      .catch(() => setStates([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  // Derive per-severity counts
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  states.forEach(s => {
    const sev = computeSeverity(s.probability_score, s.severity);
    counts[sev as keyof typeof counts] = (counts[sev as keyof typeof counts] ?? 0) + 1;
  });

  const alertCount = counts.critical + counts.high;
  const visible = states.slice(0, 6);

  const headerGradient = alertCount > 0
    ? 'from-red-500 to-orange-500'
    : 'from-emerald-500 to-green-600';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={`bg-gradient-to-r ${headerGradient} px-6 py-4 flex items-center justify-between`}>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          {alertCount > 0
            ? <ShieldAlert className="w-6 h-6" />
            : <ShieldCheck className="w-6 h-6" />}
          Riesgos Activos
        </h2>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <span className="bg-white/20 text-white text-sm font-semibold px-3 py-0.5 rounded-full">
              {alertCount} alerta{alertCount !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="text-white/70 hover:text-white transition"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Severity summary chips ─────────────────────────────────────────── */}
      {!loading && states.length > 0 && (
        <div className="flex gap-2 flex-wrap px-6 pt-4">
          {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
            const n = counts[sev];
            if (n === 0) return null;
            const cfg = SEVERITY_CONFIG[sev];
            return (
              <span key={sev} className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>
                {n} {cfg.label}
              </span>
            );
          })}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="p-6 flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : states.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-gray-500 dark:text-gray-400">
            <ShieldCheck className="w-12 h-12 text-emerald-400 mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Sin alertas activas
            </p>
            <p className="text-xs mt-1 opacity-60">
              Próxima evaluación automática en la hora.
            </p>
          </div>
        ) : (
          <div className="space-y-3 flex-1">
            {visible.map(state => {
              const sev = computeSeverity(state.probability_score, state.severity);
              const cfg = SEVERITY_CONFIG[sev] ?? SEVERITY_CONFIG.low;
              return (
                <div key={state.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    {/* Risk name */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {riskLabel(state.risk_code)}
                      </span>
                    </div>
                    {/* Score + badge */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                        {Math.round(state.probability_score)}%
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                  {/* Entity name */}
                  <p className="text-xs text-gray-400 dark:text-gray-500 pl-4 truncate">
                    {shortEntityName(state.entity_id)}
                  </p>
                  {/* Score bar */}
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${cfg.bar}`}
                      style={{ width: `${Math.min(state.probability_score, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {states.length > 6 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">
                +{states.length - 6} evaluaciones más
              </p>
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="mt-4 space-y-2">
          {lastUpdated && (
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">
              Actualizado {lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          <button
            onClick={() => navigate('/risks')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-xl transition"
          >
            Ver panel de riesgos
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
