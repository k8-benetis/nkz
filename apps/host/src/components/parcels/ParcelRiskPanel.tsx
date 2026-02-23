// =============================================================================
// Parcel Risk Panel - Shows active risk evaluations for a selected parcel
// =============================================================================

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldCheck, Loader2, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import type { RiskState } from '@/types';

interface ParcelRiskPanelProps {
    parcelId: string;
}

const SEVERITY_STYLES: Record<string, { badge: string; bar: string; label: string }> = {
    critical: {
        badge: 'bg-red-100 text-red-800 border border-red-200',
        bar: 'bg-red-500',
        label: 'Crítico',
    },
    high: {
        badge: 'bg-orange-100 text-orange-800 border border-orange-200',
        bar: 'bg-orange-500',
        label: 'Alto',
    },
    medium: {
        badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
        bar: 'bg-yellow-500',
        label: 'Medio',
    },
    low: {
        badge: 'bg-blue-100 text-blue-800 border border-blue-200',
        bar: 'bg-blue-400',
        label: 'Bajo',
    },
};

function getSeverityStyle(severity: RiskState['severity']) {
    if (!severity) return SEVERITY_STYLES.low;
    return SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low;
}

export const ParcelRiskPanel: React.FC<ParcelRiskPanelProps> = ({ parcelId }) => {
    const [riskStates, setRiskStates] = useState<RiskState[]>([]);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (!parcelId) return;

        let cancelled = false;
        setLoading(true);

        api.getRiskStates({ entityId: parcelId, limit: 5 })
            .then((data) => {
                if (!cancelled) setRiskStates(data);
            })
            .catch(() => {
                if (!cancelled) setRiskStates([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [parcelId]);

    const criticalOrHigh = riskStates.filter(
        (s) => s.severity === 'critical' || s.severity === 'high'
    );

    return (
        <div className="bg-red-50 rounded-lg border border-red-200">
            {/* Section header */}
            <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => setCollapsed((c) => !c)}
            >
                <h4 className="text-sm font-semibold text-red-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Riesgos activos
                    {!loading && criticalOrHigh.length > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                            {criticalOrHigh.length}
                        </span>
                    )}
                </h4>
                {collapsed ? (
                    <ChevronDown className="w-4 h-4 text-red-700" />
                ) : (
                    <ChevronUp className="w-4 h-4 text-red-700" />
                )}
            </button>

            {!collapsed && (
                <div className="px-4 pb-4 space-y-3">
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Cargando evaluaciones...</span>
                        </div>
                    ) : riskStates.length === 0 ? (
                        <div className="flex items-start gap-2 text-sm text-gray-600">
                            <ShieldCheck className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                            <p>Sin evaluaciones recientes. El sistema evalúa cada hora.</p>
                        </div>
                    ) : (
                        riskStates.map((state) => {
                            const style = getSeverityStyle(state.severity);
                            const timestamp = state.timestamp
                                ? new Date(state.timestamp).toLocaleString('es-ES', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })
                                : '—';
                            return (
                                <div key={state.id} className="bg-white rounded-md p-3 border border-red-100 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold text-gray-800 truncate">
                                            {state.risk_code.replace(/_/g, ' ')}
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${style.badge}`}>
                                            {style.label}
                                        </span>
                                    </div>

                                    {/* Probability bar */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${style.bar}`}
                                                style={{ width: `${state.probability_score}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-500 shrink-0 w-10 text-right">
                                            {state.probability_score.toFixed(0)}%
                                        </span>
                                    </div>

                                    <p className="text-xs text-gray-400">Evaluado: {timestamp}</p>
                                </div>
                            );
                        })
                    )}

                    {/* Configure alerts shortcut */}
                    <button
                        className="flex items-center gap-1 text-xs text-red-700 hover:text-red-900 hover:underline"
                        onClick={() => navigate('/alerts')}
                    >
                        <Settings2 className="w-3 h-3" />
                        Configurar alertas
                    </button>
                </div>
            )}
        </div>
    );
};
