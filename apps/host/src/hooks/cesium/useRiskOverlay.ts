import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

export interface RiskOverlayInfo {
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: number;
  riskCode: string;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

const REFRESH_INTERVAL = 60_000; // 60 s

export function useRiskOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [data, setData] = useState<Map<string, RiskOverlayInfo>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const states = await api.getRiskStates({ limit: 500 });
      const map = new Map<string, RiskOverlayInfo>();
      for (const state of states) {
        if (!state.severity) continue;
        const existing = map.get(state.entity_id);
        const rank = SEVERITY_RANK[state.severity] ?? 0;
        const existingRank = SEVERITY_RANK[existing?.severity ?? ''] ?? 0;
        if (rank > existingRank) {
          map.set(state.entity_id, {
            severity: state.severity as RiskOverlayInfo['severity'],
            probability: state.probability_score,
            riskCode: state.risk_code,
          });
        }
      }
      setData(map);
    } catch {
      // silently fail — stale data stays
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return {
    enabled,
    setEnabled,
    /** Undefined when overlay is disabled so consumers can short-circuit rendering. */
    overlay: enabled ? data : undefined as Map<string, RiskOverlayInfo> | undefined,
    refresh,
  };
}
