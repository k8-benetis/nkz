import React, { useEffect, useState } from 'react';
import { Wind, Droplets, Thermometer, Radio, Cloud, AlertCircle, Loader2, Sprout } from 'lucide-react';
import api from '@/services/api';

interface ParcelAgroStatusDetailProps {
  parcelId: string;
}

type Semaphore =
  | 'optimal'
  | 'caution'
  | 'not_suitable'
  | 'too_wet'
  | 'too_dry'
  | 'satisfied'
  | 'alert'
  | 'deficit'
  | 'unknown';

interface AgroStatus {
  semaphores: {
    spraying: Semaphore;
    workability: Semaphore;
    irrigation: Semaphore;
  };
  source_confidence: 'SENSOR_REAL' | 'OPEN-METEO';
  metrics?: {
    temperature?: number;
    humidity?: number;
    delta_t?: number;
    water_balance?: number;
    moisture?: number;
  };
  timestamp?: string;
}

const statusLabel = (type: 'spraying' | 'workability' | 'irrigation', value: Semaphore) => {
  const map: Record<typeof type, Record<Semaphore, string>> = {
    spraying: {
      optimal: 'Óptimo para pulverizar',
      caution: 'Precaución: condiciones límite',
      not_suitable: 'No recomendado',
      too_wet: 'No aplica',
      too_dry: 'No aplica',
      satisfied: 'No aplica',
      alert: 'No aplica',
      deficit: 'No aplica',
      unknown: 'Sin datos',
    },
    workability: {
      optimal: 'Suelo en buen tempero',
      too_wet: 'Suelo demasiado húmedo',
      too_dry: 'Suelo demasiado seco',
      caution: 'Precaución',
      not_suitable: 'No aplica',
      satisfied: 'No aplica',
      alert: 'No aplica',
      deficit: 'No aplica',
      unknown: 'Sin datos',
    },
    irrigation: {
      satisfied: 'Riego satisfecho',
      alert: 'Alerta: vigilar',
      deficit: 'Déficit hídrico',
      optimal: 'Riego satisfecho',
      caution: 'Alerta: vigilar',
      not_suitable: 'Déficit hídrico',
      too_wet: 'Alerta: vigilar',
      too_dry: 'Déficit hídrico',
      unknown: 'Sin datos',
    },
  };
  return map[type][value] || 'Sin datos';
};

const badgeColor = (value: Semaphore) => {
  switch (value) {
    case 'optimal':
    case 'satisfied':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'caution':
    case 'alert':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'not_suitable':
    case 'too_wet':
    case 'too_dry':
    case 'deficit':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};

export const ParcelAgroStatusDetail: React.FC<ParcelAgroStatusDetailProps> = ({ parcelId }) => {
  const [status, setStatus] = useState<AgroStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parcelId) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await api.getParcelAgroStatus(parcelId);
        setStatus(resp);
      } catch (err: any) {
        console.error('Error loading parcel agro status:', err);
        setError(
          err?.response?.data?.error ||
            err?.message ||
            'No se pudo cargar el estado agronómico de la parcela'
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [parcelId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando estado agronómico...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        <AlertCircle className="w-4 h-4" />
        <span>{error}</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
        Sin datos agronómicos para esta parcela.
      </div>
    );
  }

  const { semaphores, source_confidence, metrics } = status;

  const detailRow = (
    title: string,
    label: string,
    icon: React.ReactNode,
    badgeClass: string,
    extra?: string
  ) => (
    <div className="flex items-start gap-3">
      <div className={`w-9 h-9 rounded-full border flex items-center justify-center ${badgeClass}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-700">{label}</p>
        {extra && <p className="text-xs text-gray-500 mt-1">{extra}</p>}
      </div>
    </div>
  );

  return (
    <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-gray-200 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <Sprout className="w-5 h-5 text-green-600" />
          Condiciones agronómicas
        </h4>
        <div
          className="flex items-center gap-1 text-xs text-gray-600 bg-white/80 px-2 py-1 rounded-full"
          title={source_confidence === 'SENSOR_REAL' ? 'Datos de sensor real' : 'Datos de modelo meteorológico'}
        >
          {source_confidence === 'SENSOR_REAL' ? (
            <>
              <Radio className="w-3 h-3 text-blue-600" />
              <span>Sensor</span>
            </>
          ) : (
            <>
              <Cloud className="w-3 h-3 text-gray-500" />
              <span>Modelo</span>
            </>
          )}
        </div>
      </div>

      {/* Expanded metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {detailRow(
          'Pulverización',
          statusLabel('spraying', semaphores.spraying),
          <Wind className="w-5 h-5" />,
          badgeColor(semaphores.spraying),
          metrics?.delta_t !== undefined ? `ΔT: ${metrics.delta_t.toFixed(1)}°C` : undefined
        )}

        {detailRow(
          'Tempero',
          statusLabel('workability', semaphores.workability),
          <Droplets className="w-5 h-5" />,
          badgeColor(semaphores.workability),
          metrics?.moisture !== undefined ? `Humedad suelo: ${metrics.moisture.toFixed(1)}%` : undefined
        )}

        {detailRow(
          'Riego',
          statusLabel('irrigation', semaphores.irrigation),
          <Thermometer className="w-5 h-5" />,
          badgeColor(semaphores.irrigation),
          metrics?.water_balance !== undefined
            ? `Balance hídrico 3 días: ${metrics.water_balance > 0 ? '+' : ''}${metrics.water_balance.toFixed(1)} mm`
            : undefined
        )}
      </div>

      {/* Detailed metrics section */}
      {(metrics?.temperature !== undefined || metrics?.humidity !== undefined || metrics?.delta_t !== undefined || metrics?.water_balance !== undefined) && (
        <div className="bg-white/60 rounded-lg p-3 border border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-2">Métricas detalladas</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {metrics?.temperature !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Temperatura:</span>
                <span className="font-semibold text-gray-900">{metrics.temperature.toFixed(1)}°C</span>
              </div>
            )}
            {metrics?.humidity !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Humedad:</span>
                <span className="font-semibold text-gray-900">{metrics.humidity.toFixed(0)}%</span>
              </div>
            )}
            {metrics?.delta_t !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Delta T:</span>
                <span className="font-semibold text-gray-900">{metrics.delta_t.toFixed(1)}°C</span>
              </div>
            )}
            {metrics?.water_balance !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Balance hídrico:</span>
                <span className={`font-semibold ${metrics.water_balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {metrics.water_balance > 0 ? '+' : ''}{metrics.water_balance.toFixed(1)} mm
                </span>
              </div>
            )}
          </div>
          {status.timestamp && (
            <p className="text-xs text-gray-500 mt-2 text-right">
              Actualizado: {new Date(status.timestamp).toLocaleString('es-ES')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

