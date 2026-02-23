// =============================================================================
// Risk Summary Card — Dashboard widget showing active risks for the tenant
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '@/services/api';
import type { RiskState } from '@/types';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  high:     'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  medium:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  low:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const SEVERITY_BAR: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-yellow-500',
  low:      'bg-blue-400',
};

function severityLabel(score: number, severity: string | null): string {
  if (severity) return severity;
  if (score >= 95) return 'critical';
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

export const RiskSummaryCard: React.FC = () => {
  const navigate = useNavigate();
  const [states, setStates] = useState<RiskState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRiskStates({ limit: 20 })
      .then(data => setStates(data))
      .catch(() => setStates([]))
      .finally(() => setLoading(false));
  }, []);

  const alertCount = states.filter(s => {
    const sev = severityLabel(s.probability_score, s.severity);
    return sev === 'high' || sev === 'critical';
  }).length;

  const recent = states.slice(0, 3);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-6 h-6" />
          Riesgos Activos
        </h2>
        {alertCount > 0 && (
          <span className="bg-white/20 text-white text-sm font-semibold px-3 py-0.5 rounded-full">
            {alertCount} alerta{alertCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : states.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Sin riesgos detectados.</p>
            <p className="text-xs mt-1 opacity-70">Próxima evaluación en la hora.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recent.map(state => {
              const sev = severityLabel(state.probability_score, state.severity);
              return (
                <div key={state.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {state.risk_code}
                    </span>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[sev] || SEVERITY_BADGE.medium}`}>
                      {sev}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{state.entity_id}</p>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${SEVERITY_BAR[sev] || SEVERITY_BAR.medium}`}
                      style={{ width: `${Math.min(state.probability_score, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {states.length > 3 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                +{states.length - 3} más
              </p>
            )}
          </div>
        )}

        {!loading && (
          <button
            onClick={() => navigate('/alerts')}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 text-sm font-medium rounded-xl transition"
          >
            Ver alertas
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
